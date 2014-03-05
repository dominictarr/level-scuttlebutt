
var level       = require('level-test')()
var Model       = require('scuttlebutt/model')
var assert      = require('assert')
var rimraf      = require('rimraf')
var MapReduce   = require('map-reduce')
var Scuttlebutt = require('..')
var SubLevel    = require('level-sublevel')

require('tape')('scuttlebutt: map-reduce', function (t) {

  var db = SubLevel(level('level-scuttlebutt-example'))

  Scuttlebutt(db, 'THIS', {
    test: function () {
      return new Model()
    }
  })

  var mapDb = 
  MapReduce(db, 'test',
    function (key, model, emit) {
      model = JSON.parse(model)
      if(!model) return
      emit('square', Math.pow(Number(model.number), 2))
      emit('cube', Math.pow(Number(model.number), 3))
    },
    function (sum, n) {
      return Number(sum) + Number(n)
    },
    0)

  'abcde'.split('').forEach(function (e, i) {
    db.scuttlebutt.open('test-'+e, false, function (err, t) {
      t.set('number', i)
      setTimeout(function () {
        var l = 10
        var int = setInterval(function () {
          t.set('number', i * 2 * l)
          if(!--l) {
            clearInterval(int)
          t.dispose()
        }
        }, 200)
  
      }, 1000)
    })
  })

  var sq, cu

  mapDb.on('reduce', function (group, sum) {
    console.log('reduce->', group, sum)
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
