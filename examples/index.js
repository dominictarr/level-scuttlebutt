
var levelup     = require('levelup')
var Model       = require('scuttlebutt/model')
var Bucket      = require('range-bucket')
var delayJob    = require('./delay-job')

var scuttlebutt = require('..')('THIS', {
  test: function () {
    return new Model()
  }
})

var map         = require('level-map')
var reduce      = require('level-reduce')

levelup('/tmp/level-scuttlebutt-example', 
  {createIfMissing: true}, function (err, db) {
  
  scuttlebutt(db)
  map(db)
  reduce(db)

  var range = Bucket('SCUTTLEBUTT').range()

  db.map.add({
    name: 'test',
    start: range.start,
    end:   range.end,
    keyMap: function (data) {
      var d = data.key.toString().split('\0')
      d.pop();d.pop()
      return d.pop()
    },
    load: delayJob(function (name, cb) {
      db.scuttlebutt(name, false, function (err, s) {
        cb(null, s)
      })
    }, 1000),
    map: function (key, model, emit) {
      if(!model) return
      emit('square', Math.pow(Number(model.get('number')), 2))
      emit('cube', Math.pow(Number(model.get('number')), 3))
    }
  })

  db.reduce.add({
    name: 'test',
    depth: 1,
    reduce: function (sum, n) {
      return Number(sum) + Number(n)
    },
    initial: 0
  })

  'abcde'.split('').forEach(function (e, i) {
    db.scuttlebutt('test-'+e, false, function (err, t) {
      console.log('LOAD', t)
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

  db.on('reduce:test', function (group, sum) {
    console.log('r', group, sum)
//    var t = db.scuttlebutt('test-a')  
  })
})
