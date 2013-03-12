require('tape')('test replication', function (t) {

var SubLevel = require('level-sublevel')
var levelup = require('levelup')
var rimraf  = require('rimraf')
var delay   = require('delay-stream')
var Model   = require('scuttlebutt/model')

function create(path, cb) {
  rimraf(path, function (err) {
    if(err) return callback(err)
    levelup(path, function (err, db) {
      if(err) throw err
      cb(null, SubLevel(db))
    })
  })
}

var A, B

function randomData(db, id, cb) {
  require('..')(db, id, {
    test: function () {
      return Model()
    }
  })

  db.scuttlebutt('test1', function (err, emitter) {
    var letters = "ABCDEFGHIJK"
    var l = 5

    while(l --> 0)
      emitter.set(letters[~~(Math.random()*letters.length)], 'Date: ' + new Date())

    setTimeout(cb, 1000)

  })
}

create('/tmp/level-scuttlebutt-test-A', function (err, db) {
  randomData(A = db, 'A', next)
})

create('/tmp/level-scuttlebutt-test-B', function (err, db) {
  randomData(B = db, 'B', next)
})
var z = 2

function next() {
  if(--z) return
  var streamA = A.scuttlebutt.createReplicateStream({tail: false})
  var streamB = B.scuttlebutt.createReplicateStream({tail: false})
  
  streamA.pipe(delay(100)).pipe(streamB).pipe(delay(100)).pipe(streamA)

  streamA.pipe(process.stderr, {end: false})
  streamB.pipe(process.stderr, {end: false})
  
  var n = 2, vecA, vecB

  streamA.on('end', function () {
    A.scuttlebutt.vectorClock(function (err, vec) {
      console.log('streamA end')
      vecA = vec; next()
    })
  })

  streamB.on('end', function () {
    B.scuttlebutt.vectorClock(function (err, vec) {
      console.log('streamB end')
      vecB = vec; next()
    })
  })

  function next() {
    if(--n) return
    console.log(vecA, vecB)
    t.deepEqual(vecA, vecB)
    t.end()
  }
}

})
