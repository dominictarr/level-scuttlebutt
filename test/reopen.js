
var level    = require('level-test')()
var SubLevel = require('level-sublevel')
var rimraf   = require('rimraf')
var delay    = require('delay-stream')
var Model    = require('scuttlebutt/model')
var tape     = require('tape')  


tape('test', function (t) {

  var db = SubLevel(level('level-scuttlebutt-test-A'))

  require('../')(db, 'test1', {
    test: function () {
      return Model()
    }
  })

  var m = new Model()

  m.name = 'test-model'

  m.set('x', Math.random())
  m.set('y', Math.random())
  m.set('z', Math.random())

  var opener = db.scuttlebutt._opener //Opener(db)

  opener.open(m, function () {
    console.log('reopened')

    db.scuttlebutt(m.name, function (err, _m) {

      console.log(_m.history(), m.history())
      t.notStrictEqual(_m, m)
      t.deepEqual(_m.history(), m.history())
      t.end()
    })
  })

})
