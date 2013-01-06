var Bucket       = require('range-bucket')
var EventEmitter = require('events').EventEmitter
var timestamp    = require('monotonic-timestamp')
var uuid         = require('node-uuid')
var duplex       = require('duplex')

var hooks        = require('level-hooks')
var REDIS        = require('redis-protocol-stream')

var makeSchema   = require('scuttlebutt-schema')

var sbMapReduce  = require('./map')

//need a seperator that sorts early.
//use NULL instead?

var SEP = ' '
var DEFAULT = 'SCUTTLEBUTT'

module.exports = function (db, id, schema) {
  var prefix  = DEFAULT //TEMP
  var bucket  = Bucket(prefix  || DEFAULT)
  var _bucket = Bucket((prefix || DEFAULT)+'_R')
  var vector  = Bucket((prefix || DEFAULT)+'_V')
  var range   = bucket.range()

  var sources = {}

  id = id || uuid()

  if(db.scuttlebutt) return db
  hooks()(db)

  var match = makeSchema(schema)

  //create a new scuttlebutt attachment.
  //a document that is modeled as a range of keys,
  //rather than as a single {key: value} pair

  function checkOld (id, ts) {
    if(sources[id] && sources[id] >= ts) return true
    sources[id] = ts
  }

  function insertBatch (_id, doc_id, ts, value) {

    if(checkOld(_id, ts)) return

    db.batch([{
      key: bucket([doc_id, ts, _id]),
      value: value, type: 'put'
    }, {
      //the second time, so that documents can be rapidly replicated.
      key: _bucket([_id, ts, doc_id]),
      value: value, type: 'put'
    }, {
      //also, update the vector clock for this replication range,
      //so that it's easy to recall what are the latest documents are.
      key: vector(_id), value: ''+ts, type: 'put'
    }])

  }

  function deleteBatch (_id, doc_id, ts) {

    db.batch([{
      key: bucket([doc_id, ts, _id]),
      type: 'del'
    }, {
      key: _bucket([_id, ts, doc_id]),
      type: 'del'
    }])

  }

  db.scuttlebutt = function (doc_id, tail, callback) {
    if('function' === typeof tail) callback = tail, tail = true

    if(!doc_id) throw new Error('must provide a doc_id')

    var emitter = match(doc_id)

    if(emitter.setId) emitter.setId(id)
    else              emitter.id = id

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

          checkOld(source, ts)

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
    emitter.on('_update', function (update) {
      var value = update[0], ts = update[1], id = update[2]
      insertBatch (id, doc_id, ts, JSON.stringify(value))
    })

    //an update is now no longer significant
    emitter.on('_remove', function (update) {
      var ts = update[1], id = update[2]
      deleteBatch (id, doc_id, ts)
    })
  }

  db.scuttlebutt.open = db.scuttlebutt

  db.scuttlebutt.createStream = function (opts) {
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
        clock[id] = 0

      for(var id in yourClock)
        clock[id] = yourClock[id]

      var started = 0
      for(var id in clock) {

        (function (id) {

          //var _id = _bucket.parse(id).key
          started ++
          var _opts = _bucket.range([id, clock[id], true], [id, '\xff', true])
          
          opts.start = _opts.start; opts.end = _opts.end
          
          //TODO, merge stream that efficiently handles back pressure
          //when reading from many streams.
          var stream = db.liveStream(opts)
            .on('data', function (data) {
              var ary = _bucket.parse(data.key).key
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

  //we need a special map-reduce for scuttlebutt objects,
  //because scuttlebutt is represented as a range of keys
  //rather than a single object.

  db.scuttlebutt.range = range

  sbMapReduce(db)

  //read the vector clock. {id: ts, ...} pairs.
  db.scuttlebutt.vectorClock = function (cb) {
    var clock = {}
    var opts = vector.range()
    opts.sync = true
    db.readStream(opts)
      .on('data', function (data) {
        var k = bucket.parse(data.key).key
        clock[k] = Number(''+data.value)
      })
      .on('close', function () {
        cb(null, clock)
      })
  }
}
