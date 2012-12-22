
var levelup     = require('levelup')
var Model       = require('scuttlebutt/model')
var assert      = require('assert')

var scuttlebutt = require('..')/*('THIS', {
  test: function () {
    return new Model()
  }
})*/

require('tape')('scuttlebutt: map-reduce', function (t) {

levelup('/tmp/level-scuttlebutt-example', 
  {createIfMissing: true}, function (err, db) {
  
  scuttlebutt(db, 'THIS', {
    test: function () {
      return new Model()
    }
  })

  var range = db.scuttlebutt.range

  db.scuttlebutt.addMapReduce({
    name: 'test',
    depth: 1,
    map: function (key, model, emit) {
      if(!model) return
      emit('square', Math.pow(Number(model.get('number')), 2))
      emit('cube', Math.pow(Number(model.get('number')), 3))
    },
    reduce: function (sum, n) {
      return Number(sum) + Number(n)
    },
    initial: 0
  })

  'abcde'.split('').forEach(function (e, i) {
    db.scuttlebutt('test-'+e, false, function (err, t) {
      t.set('number', i)
      setTimeout(function () {
        var l = 10
        var int = setInterval(function () {
          t.set('number', i * 2 * l)
          if(!--l)
            clearInterval(int)
        }, 1000)
      
      }, 1000)
    })
  })

  var sq, cu

  db.on('reduce:test', function (group, sum) {
    console.log('r', [group, sum])
    try {
      assert.deepEqual([['square'], 120], [group, sum])
      console.log('sq')
      sq = true
      t.ok(true, "eventually ['square']: 120")
    } catch (_) { }

    try {
      assert.deepEqual([['cube'], 800], [group, sum])
      console.log('cu')
      cu = true
      t.ok(true, "eventually ['cube']: 800")
    } catch (_) { }

    if(sq && cu)
      t.end()
  })
})

})
