var SubLevel = require('level-sublevel')
var level    = require('level-test')()
var delay    = require('delay-stream')
var Model    = require('scuttlebutt/model')
var tape     = require('tape')

tape('test replication', function (t) {

var A, B

  function randomData(db, id, cb) {
    require('..')(db, id, {
      test: function () {
        return Model()
      }
    })

    db.sublevel('sb')
      .post(function (op) {
        console.error(op)
        if(undefined === op.value && op.type !== 'del')
          throw new Error('value is undefined')
      })

    db.scuttlebutt('test1', function (err, emitter) {
      var letters = "ABCDEFGHIJK"
      var l = 5

      while(l --> 0)
        emitter.set(letters[~~(Math.random()*letters.length)], 'Date: ' + new Date())

      setTimeout(cb, 1000)

    })
  }


  randomData(A = SubLevel(level('level-scuttlebutt-test-A', {encoding: 'utf8'})), 'A', next)
  randomData(B = SubLevel(level('level-scuttlebutt-test-B'), {encoding: 'utf8'}), 'B', next)

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
