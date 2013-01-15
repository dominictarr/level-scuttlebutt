//test to open scuttlebutt from leveldb.

var rimraf  = require('rimraf')
var levelup = require('levelup')
var Model   = require('scuttlebutt/model')
var LevelScuttlebutt = require('..')
var Remote  = require('../remote')

var tape = require('tape')

function create (c) {
  return function () {
    return new c
  }
}

tape('local open, remote open', function (t) {
  var path = '/tmp/test-scuttlebutt-remote'
  t.plan(1)
  rimraf(path, function () {
    var db = levelup(path, {createIfMissing: true})
    var schema = {foo: create(Model), bar: create(Model)}
    LevelScuttlebutt(db, 'test', schema)
 
    var local  = db.scuttlebutt//Remote(schema).openDb(db)
    var remote = Remote(schema)
    var a, b

    remote.open('foo1', function (err, _a) {
      if(err) t.fail(err)
      a = _a
      console.log(a)
      a.on('change', function (k, r) {
        console.log(this.name, k, r)
      })

      a.set('x', Math.random())
      a.set('y', Math.random())
      a.set('z', Math.random())
 
      console.log('A', a.history())

      if(a && b) t.notDeepEqual(a.history(), b.history()), t.end()
    })


    remote.open('bar1', function (err, _b) {
      b = _b
      console.log(b)
      b.on('change', function (k, r) {
        console.log(this.name, k, r)
      })
      b.set('a', Math.random())
      b.set('b', Math.random())
      b.set('c', Math.random())


      console.log('B', b.history())

      if(a && b) t.notDeepEqual(a.history(), b.history()), t.end()
    })
 
    var ls = local.createRemoteStream()
    var rs = remote.createStream()

    rs.on('data', console.log)
    ls.on('data', console.log)

    ls.pipe(rs).pipe(ls)
  })
})


