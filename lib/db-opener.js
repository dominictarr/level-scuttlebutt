var EventEmitter = require('events').EventEmitter
var MuxDemux     = require('mux-demux')
var through      = require('through')

module.exports = function (db) {
  //so, passing around properties like this is UGLY UGLY UGLY
  //I think if I refactored all the level- stuff to use namespaces
  //then this problem would pretty much disappear

  var insertBatch = db.scuttlebutt._insertBatch
  var deleteBatch = db.scuttlebutt._deleteBatch
  var bucket = db.scuttlebutt._bucket
  var checkOld = db.scuttlebutt._checkOld
  var match    = db.scuttlebutt._match

  var opener = new EventEmitter()
  opener.open = function (doc_id, tail, callback) {
    if('function' === typeof tail) callback = tail, tail = true

    if(!doc_id) throw new Error('must provide a doc_id')
    var emitter
    if('string' === typeof doc_id) {
      emitter = match(doc_id)
    } else {
      emitter = doc_id
      doc_id = emitter.name
    }


    //read current state from db.
    var opts = bucket.range([doc_id, 0, true], [doc_id, '\xff', true])
    opts.tail = tail

    var stream = 
      db.liveStream(opts)
        .on('data', function (data) {
          //ignore deletes,
          //deletes must be an update.
          if(data.type == 'del') return

          var ary    = bucket.parse(data.key).key
          var ts     = Number(ary[1])
          var source = ary[2]
          var change  = JSON.parse(data.value)

          //if(checkOld(source, ts))
          //  console.log('read-old', source, ts)
          emitter._update([change, ts, source])
        })

    //this scuttlebutt instance is up to date with the db.
    
    var ready = false
    function onReady () {
      if(ready) return
      ready = true
      emitter.emit('sync')
      if(callback) callback(null, emitter)
    }

    stream.once('sync', onReady)
    stream.once('end' , onReady)

    emitter.once('dispose', function () {
      stream.destroy()
    })

    //write the update twice, 
    //the first time, to store the document.
    //maybe change scuttlebutt so that value is always a string?
    //If i write a bunch of batches, will they come out in order?
    //because I think updates are expected in order, or it will break.

    function onUpdate (update) {
      var value = update[0], ts = update[1], id = update[2]
      insertBatch (id, doc_id, ts, JSON.stringify(value))
    }

    emitter.history().forEach(onUpdate)

    //track updates...
    emitter.on('_update', onUpdate)

    //an update is now no longer significant
    emitter.on('_remove', function (update) {
      var ts = update[1], id = update[2]
      deleteBatch (id, doc_id, ts)
    })

    return emitter
  }

  opener.createStream = function () {
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

  opener.view = function () {
    var args = [].slice.call(arguments)
    return db.mapReduce.view.apply(db.mapReduce, args)
  }

  db.on('close', function () {
    opener.emit('close')
  })

  return opener
}

