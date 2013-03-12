var Bucket       = require('range-bucket')
var EventEmitter = require('events').EventEmitter
var timestamp    = require('monotonic-timestamp')
var uuid         = require('node-uuid')
var duplex       = require('duplex')


var LiveStream   = require('level-live-stream')
var REDIS        = require('redis-protocol-stream')

var makeSchema   = require('./lib/schema')
//var cache        = require('./lib/cache')
//var sbMapReduce  = require('./lib/map')

//var Remote     = require('./remote')

var DbOpener     = require('./lib/db-opener')
var BufferedOpener
                 = require('./lib/buffered-opener')
var ClientOpener = require('./lib/client-opener')
var MakeCreateStream
                 = require('./lib/stream')

//need a seperator that sorts early.
//use NULL instead?

var SEP = ' '
var DEFAULT = 'SCUTTLEBUTT'

module.exports = function (db, id, schema) {

  //none of these should be used.
  var sep = '!'

  var localDb     = db.sublevel('sb')
  var replicateDb = db.sublevel('replicate')
  var vectorDb    = db.sublevel('vector')

/*
  var prefix  = DEFAULT //TEMP
  var bucket  = Bucket(prefix  || DEFAULT)
  var _bucket = Bucket((prefix || DEFAULT)+'_R')
  var vector  = Bucket((prefix || DEFAULT)+'_V')
  var range   = bucket.range()
*/

  var sources = {}

  if('string' !== typeof id)
    schema = id, id = null

  id = id || uuid()

//  if(db.scuttlebutt) return db

//  hooks()(db)

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
    if(!queued)
      process.nextTick(function () {
        db.batch(_batch)
        queued = false
        _batch = []
      })
    queued = true
  }

  db.scuttlebutt = function () {
    var args = [].slice.call(arguments)
    return db.scuttlebutt.open.apply(null, args)
  }

  db.scuttlebutt._checkOld = checkOld
  db.scuttlebutt._match = match
  db.scuttlebutt._localDb = localDb

  function key() {
    return [].slice.call(arguments).join(sep)
  }

  var insertBatch =
  db.scuttlebutt._insertBatch = 
  function (_id, doc_id, ts, value) {
    ts = ts.toString()

    //WTF WHY WAS THIS BEING TRIGGERED?
    //if(checkOld(_id, ts)) return console.log('OLD', ts, value)
    //if(checkOld(_id, ts))
    //   console.log('write-old', _id, ts)

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

    save()
  }

//  db.scuttlebutt._bucket = bucket

  var deleteBatch =
  db.scuttlebutt._deleteBatch =
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

  var dbO
  var opener = BufferedOpener(schema, id).swap(dbO = DbOpener(db))

  db.scuttlebutt.open = opener.open
  db.scuttlebutt.view = opener.view
  db.scuttlebutt.createRemoteStream = MakeCreateStream(opener) //dbO.createStream

  //REPLICATION XXXX 
  // FIX THIS LATER
  // FIX THIS LATER
  // FIX THIS LATER
  // FIX THIS LATER
  // FIX THIS LATER
  // FIX THIS LATER
  // FIX THIS LATER

  db.scuttlebutt.createReplicateStream = function (opts) {
    //throw new Error ('NOT IMPLEMNTED YET')
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
          console.log('YOUR CLOCK', yourClock)
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
            start: [id, clock[id]].join('!'),
            end  :  [id, '\xff'].join('!'),
            tail : opts.tail
          }
          //TODO, merge stream that efficiently handles back pressure
          //when reading from many streams.
          var stream = LiveStream(replicateDb, _opts)
            .on('data', function (data) {
              var ary = data.key.split('!')
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
    vectorDb.createReadStream()
      .on('data', function (data) {
        clock[data.key] = Number(''+data.value)
      })
      .on('close', function () {
        cb(null, clock)
      })
  }
}
