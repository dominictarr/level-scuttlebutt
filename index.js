var Bucket       = require('range-bucket')
var EventEmitter = require('events').EventEmitter
var timestamp    = require('monotonic-timestamp')
var uuid         = require('node-uuid')
var duplex       = require('duplex')

var all          = require('all')

var hooks        = require('level-hooks')
var liveStream   = require('level-live-stream')
var REDIS        = require('redis-protocol-stream')

var SEP = ' '

module.exports = function (id, prefix) {

  var bucket  = Bucket(prefix  || 'rangeDoc')
  var _bucket = Bucket((prefix || 'rangeDoc')+'_R')
  var vector  = Bucket((prefix || 'rangeDoc')+'_V')
  var range   = bucket.range()

  id = id || uuid()

  return function (db) {

    if(db.scuttlebutt) return db
    hooks()(db)
    liveStream(db)

    //create a new scuttlebutt attachment.
    //a document that is modeled as a range of keys,
    //rather than as a single {key: value} pair

    function insertBatch (_id, doc_id, ts, value) {
      db.batch([{
        key: bucket([doc_id, ts, _id].join(SEP)),
        value: value,
        type: 'put'
      }, {
        //the second time, so that documents can be rapidly replicated.
        key: _bucket([_id, ts, doc_id].join(SEP)),
        value: value,
        type: 'put'
      }, {
        //also, update the vector clock for this replication range,
        //so that it's easy to recall what are the latest documents are.
        key: vector(_id), value: ''+ts, type: 'put'
      }])
    }

    db.scuttlebutt = function (doc_id) {
      var emitter = new EventEmitter()

      emitter.update = function (value) {
        var ts = timestamp()
        //write the update twice, 
        //the first time, to store the document.
        insertBatch (id, doc_id, ts, value)
      }

      return emitter
    }

    db.scuttlebutt.createStream = function (opts) {
      opts = opts || {}
      console.log(opts)
      var yourClock, myClock
      var d = duplex ()
      var outer = REDIS.serialize(d)
      d.on('_data', function (data) {
        console.log('_data', data.length)
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
          //write these to disk...
          //should be of form
          //[id, doc, ts, value] //take the key directly from the db [id, ts, doc] : value ?
          //expand this to get the other form...
          //update any open rangeDocs, (they should be listening on a hook?) or on event?
          
          //maybe increment the clock for this node,
          //so that when we detect that a record has been written,
          //can avoid updating the model twice when recieving 
          var id = ''+data[0]
          var ts = Number(''+data[1])
          console.log('WRITE', myClock[id], ts , myClock[id] < ts)
          if(!myClock || !myClock[id] || myClock[id] < ts) {
            var doc_id = data[2]
            var value = data[3]
            console.log('WRITE', id, ts, ''+data)
        
            insertBatch(id, doc_id, ts, value)
            myClock[id] = ts
          }
        }
      })
      function start() {
        if(!(myClock && yourClock)) return
        //create streams from {start: _bucket([id, ts].join(SEP))}
        //and merge them all.
        //here is a nice opportunity for a QoS merge,
        //it would merge a bunch a bunch of streams into one stream,
        //managing the rate of sub streams correctly.
        //we should merge the streams by ts, so that we are writing the 
        //history in order.
        //also, we want to use the snapshot feature, and then the live stream.
        //TODO make sure that the live stream does not emit puts before reading the file has finished.

        var clock = {}
        for(var id in myClock)
          clock[id] = '0'

        for(var id in yourClock)
          clock[id] = yourClock[id]

        var started = 0
        for(var id in clock) {
          var _id = id.split('~').pop()
          started ++
          var _opts = _bucket.range(_id+SEP+clock[id])
          opts.start = _opts.start; opts.end = _opts.end

          db.liveStream(opts)
          .on('data', function (data) {
            var ary = (''+data.key).split('~').pop().split(SEP)
            ary.push(data.value)
            console.log('data!!', ''+ary)
            d._data(ary)
          })
          .once('end', function () {
            if(--started) return
            if(opts.tail === false) {
              console.log('end!!!')
              d._data(['BYE'])
            }
          })
        }
      }

      db.scuttlebutt.vectorClock(function (err, clock) {
        console.log('myClock', clock)
        myClock = clock
        d._data([JSON.stringify(clock)])
        start()
      })

      return outer
    }

    //read the vector clock. {id: ts, ...} pairs.
    db.scuttlebutt.vectorClock = function (cb) {
      var clock = {}
      db.readStream(vector.range())
        .on('data', function (data) {
          var k = (''+data.key).split('~').pop()
          clock[k] = Number(''+data.value)
        })
        .on('end', function () {
          cb(null, clock)
        })
    }
  }
}
