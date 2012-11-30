var Bucket       = require('range-bucket')
var EventEmitter = require('events').EventEmitter
var timestamp    = require('monotonic-timestamp')
var uuid         = require('node-uuid')
var duplex       = require('duplex')
var parserx      = require('parse-regexp')

var hooks        = require('level-hooks')
var liveStream   = require('level-live-stream')
var REDIS        = require('redis-protocol-stream')

//need a seperator that sorts early.
//use NULL instead?
var SEP = ' '

module.exports = function (id, schema) {
  var prefix = 'rangeDoc' //TEMP
  var bucket  = Bucket(prefix  || 'rangeDoc')
  var _bucket = Bucket((prefix || 'rangeDoc')+'_R')
  var vector  = Bucket((prefix || 'rangeDoc')+'_V')
  var range   = bucket.range()

  id = id || uuid()

  return function (db) {

    if(db.scuttlebutt) return db
    hooks()(db)
    liveStream(db)

    var rules = [], live = []

    for (var p in schema) {
      rules.push({rx: parserx(p) || p, fn: schema[p]})
    }

    function match (key) {
      for (var i in rules) {
        var r = rules[i]
        var m = key.match(r.rx)
        if(m && m.index === 0)
          return r.fn
      }
    }

    //create a new scuttlebutt attachment.
    //a document that is modeled as a range of keys,
    //rather than as a single {key: value} pair

    function insertBatch (_id, doc_id, ts, value) {

      db.batch([{
        key: bucket([doc_id, ts, _id]),
        value: value,
        type: 'put'
      }, {
        //the second time, so that documents can be rapidly replicated.
        key: _bucket([_id, ts, doc_id]),
        value: value,
        type: 'put'
      }, {
        //also, update the vector clock for this replication range,
        //so that it's easy to recall what are the latest documents are.
        key: vector(_id), value: ''+ts, type: 'put'
      }])

    }

    db.scuttlebutt = function (doc_id) {
      if(!doc_id) throw new Error('must provide a doc_id')
      if(live[doc_id]) return live[doc_id]

      var emitter = live[doc_id] = match(doc_id)()
      emitter.id = id

      console.log('RANGE', doc_id, bucket.range([doc_id, 0, true], [doc_id, '\xff', true]))

      var stream = 
        db.liveStream(bucket.range([doc_id, 0, true], [doc_id, '\xff', true]))
          .on('data', function (data) {
            var ary    = bucket.parse(data.key).key
            var ts     = Number(ary[1])
            var source = ary[2]
            var value  = JSON.parse(data.value)
            emitter._update([value, ts, source])
          })

      emitter.once('dispose', function () {
        delete live[doc_id]
        stream.destroy()
      })

      emitter.on('_update', function (update) {
        var value  = update[0]
        var ts     = update[1]
        var id     = update[2]
        //write the update twice, 
        //the first time, to store the document.
        //maybe change scuttlebutt so that value is always a string?
        insertBatch (id, doc_id, ts, JSON.stringify(value))
      })

      return emitter
    }

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
            
            console.log(_opts, [id, clock[id], true])
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
}
