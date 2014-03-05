var EventEmitter = require('events').EventEmitter
var duplex       = require('duplex')

var LiveStream   = require('level-live-stream')
var REDIS        = require('redis-protocol-stream')

var makeSchema   = require('./lib/schema')
var BufferedOpener
                 = require('./lib/buffered-opener')
var MakeCreateStream
                 = require('./lib/stream')
var ranges       = require('map-reduce/range')

//need a seperator that sorts early.
//use NULL instead?

module.exports = function (db, id, schema) {

  //none of these should be used.
  var sep = '\x00'
  var localDb     = db.sublevel('sb')
  var replicateDb = db.sublevel('replicate')
  var vectorDb    = db.sublevel('vector')
  var sources = {}

  if('string' !== typeof id)
    schema = id, id = null

  id = id || uuid()

  var match = makeSchema(schema, id)

  //create a new scuttlebutt attachment.
  //a document that is modeled as a range of keys,
  //rather than as a single {key: value} pair

  //WHY DID I DO THIS? - remove this and it works.
  //but it seems to be problem with r-array...
  function checkOld (id, ts) {
    return false
    if(sources[id] && sources[id] >= ts) return true
    sources[id] = ts
  }

  var _batch = [], queued = false

  function save() {
    if(!queued) {
      process.nextTick(function () {
        var batch = _batch
        _batch = []
        db.batch(batch, function (err) {
          if(err) return db.emit('error', err)

          queued = false
          if(!_batch.length) db.emit('drain')
          else               save()
        })
      })
    }
    queued = true
  }

  db.scuttlebutt = function () {
    var args = [].slice.call(arguments)
    return db.scuttlebutt.open.apply(null, args)
  }

  function key() {
    return [].slice.call(arguments).join(sep)
  }

  function insertBatch (_id, doc_id, ts, value, emitter) {
    ts = ts.toString()

    _batch.push({
      key: key(doc_id, ts, _id),
      value: value, type: 'put',
      prefix: localDb
    })

    _batch.push({
      //the second time, so that documents can be rapidly replicated.
      key: key(_id, ts, doc_id),
      value: value, type: 'put',
      prefix: replicateDb
    })

    _batch.push({
      //also, update the vector clock for this replication range,
      //so that it's easy to recall what are the latest documents are.
      //this vector clock is for all the documents, not just this one...
      key: _id, value: ''+ts, type: 'put',
      prefix: vectorDb
    })

    //or do this async?
    //YES, do this async, providing a way to wait until the given
    //maps have been flushed.

    if(emitter && emitter.toJSON)
      _batch.push({
        key: doc_id,
        value: JSON.stringify(emitter.toJSON()),
        type: 'put',
        prefix: db
      })

    save()
  }

  function deleteBatch (_id, doc_id, ts) {

    _batch.push({
      key: key(doc_id, ts, _id),
      type: 'del', prefix: localDb
    })

    _batch.push({
      key: key(_id, ts, doc_id),
      type: 'del', prefix: replicateDb
    })

    save()
  }

  var dbO = new EventEmitter()
  dbO.open = function (key, tail, callback) {
    if('function' === typeof tail) callback = tail, tail = true

    if(!key) throw new Error('must provide a doc_id')
    var scuttlebutt
    if('string' === typeof key) {
      scuttlebutt = match(key)
      scuttlebutt.name = key

      'function' === scuttlebutt.setId
         ? scuttlebutt.setId(id)
         : scuttlebutt.id = id

    } else {
      scuttlebutt = key
      key = scuttlebutt.name
    }

    var stream = LiveStream(localDb, {
          start: [key,   0].join(sep),
          end  : [key, '~'].join(sep)
        })
        .on('data', function (data) {
          //ignore deletes,
          //deletes must be an update.
          if(data.type == 'del') return

          var ary    = data.key.split(sep)
          var ts     = Number(ary[1])
          var source = ary[2]
          var change = JSON.parse(data.value)

          scuttlebutt._update([change, ts, source])
        })

    //this scuttlebutt instance is up to date with the db.
    
    var ready = false
    function onReady () {
      if(ready) return
      ready = true
      scuttlebutt.emit('sync')
      if(callback) callback(null, scuttlebutt)
    }

    stream.once('sync', onReady)
    stream.once('end' , onReady)

    scuttlebutt.once('dispose', function () {
      //levelup/read-stream throws if the stream has already ended
      //but it's just a user error, not a serious problem.
      try { stream.destroy() } catch (_) { }
    })

    //write the update twice, 
    //the first time, to store the document.
    //maybe change scuttlebutt so that value is always a string?
    //If i write a bunch of batches, will they come out in order?
    //because I think updates are expected in order, or it will break.

    function onUpdate (update) {
      var value = update[0], ts = update[1], id = update[2]
      insertBatch (id, key, ts, JSON.stringify(value), scuttlebutt)
    }

    //If the user has passed in a scuttlebutt instead of a key,
    //then it may have history, so save that.
    scuttlebutt.history().forEach(onUpdate)

    //then, track real-time updates
    scuttlebutt.on('_update', onUpdate)

    //an update is now no longer significant
    //can clean it from the database,
    //this isn't to save space so much as it is to
    //save time on future reads.
    scuttlebutt.on('_remove', function (update) {
      var ts = update[1], id = update[2]
      deleteBatch (id, key, ts)
    })

    return scuttlebutt
  }

  dbO.createStream = function () {
    var mx = MuxDemux(function (stream) {
      if(!db) return stream.error('cannot access database this end')

      if('string' === typeof stream.meta) {
        var ts = through().pause()
        //TODO. make mux-demux pause.

        stream.pipe(ts)
        //load the scuttlebutt with the callback,
        //and then connect the stream to the client
        //so that the 'sync' event fires the right time,
        //and the open method works on the client too.
        opener.open(stream.meta, function (err, doc) {
          ts.pipe(doc.createStream()).pipe(stream)
          ts.resume()
        })
      } else if(Array.isArray(stream.meta)) {
        //reduce the 10 most recently modified documents.
        opener.view.apply(null, stream.meta)
          .pipe(through(function (data) {
            this.queue({
              key: data.key.toString(), 
              value: data.value.toString()
            })
          }))
          .pipe(stream)
      }
    })
    //clean up
    function onClose () { mx.end() }

    db.once('close', onClose)
    mx.once('close', function () { db.removeListener('close', onClose) })

    return mx
  }

  //THIS IS JUST LEGACY STUFF NOW,
  //TODO: rewrite the streaming/client api,
  //so this disappears.

  db.views = {}
  dbO.view = function (name, opts) {
    if(!opts)
      opts = name, name = opts.name
    if(opts.range) {
      var r      = ranges.range(opts.range)
      opts.start = r.start
      opts.end   = r.end
    }
    if(db.views[name])
      return LiveStream(db.views[name], opts)
    throw new Error('no view named:', name)
  }

  db.on('close', function () {
    opener.emit('close')
  })

  var opener = BufferedOpener(schema, id).swap(dbO)

  db.open =
  db.scuttlebutt.open = opener.open
  db.scuttlebutt._opener = dbO
  db.scuttlebutt.view = opener.view
  db.createRemoteStream = 
  db.scuttlebutt.createRemoteStream = MakeCreateStream(opener)

  db.createReplicateStream =
  db.scuttlebutt.createReplicateStream = function (opts) {
    opts = opts || {}
    var yourClock, myClock
    var d = duplex ()
    var outer = REDIS.serialize(d)
    d.on('_data', function (data) {
      if(data.length === 1) {
        //like a telephone, say
        if(''+data[0] === 'BYE') {
          d._end()
        } else {
          //data should be {id: ts}
          yourClock = JSON.parse(data.shift())
          start()
        }
      } else {
        //maybe increment the clock for this node,
        //so that when we detect that a record has been written,
        //can avoid updating the model twice when recieving 
        var id = ''+data[0]
        var ts = Number(''+data[1])

        if(!myClock || !myClock[id] || myClock[id] < ts) {
          var doc_id = data[2]
          var value = data[3]
      
          insertBatch(id, doc_id, ts, value)
          myClock[id] = ts
        }
      }
    })

    function start() {
      if(!(myClock && yourClock)) return

      var clock = {}
      for(var id in myClock)
        clock[id] = ''

      for(var id in yourClock)
        clock[id] = yourClock[id]

      var started = 0
      for(var id in clock) {
        (function (id) {
          started ++
          var _opts = {
            start: [id, clock[id]].join(sep),
            end  : [id, '\xff'   ].join(sep),
            tail : opts.tail
          }
          //TODO, merge stream that efficiently handles back pressure
          //when reading from many streams.
          var stream = LiveStream(replicateDb, _opts)
            .on('data', function (data) {
              var ary = data.key.split(sep)
              ary.push(data.value)
              d._data(ary)
            })
            .once('end', function () {
              if(--started) return
              if(opts.tail === false) d._data(['BYE'])
            })

          d.on('close', stream.destroy.bind(stream))

        })(id);
      }
    }
    db.scuttlebutt.vectorClock(function (err, clock) {
      myClock = clock
      d._data([JSON.stringify(clock)])
      start()
    })

    return outer
  }

  //read the vector clock. {id: ts, ...} pairs.

  db.vectorClock =
  db.scuttlebutt.vectorClock = function (cb) {
    var clock = {}
    vectorDb.createReadStream()
      .on('data', function (data) {
        clock[data.key] = Number(''+data.value)
      })
      .on('close', function () {
        cb(null, clock)
      })
  }
}

