//test to open scuttlebutt from leveldb.

var rimraf  = require('rimraf')
var levelup = require('levelup')
var Model   = require('scuttlebutt/model')
var LevelScuttlebutt = require('..')
var Client  = require('../client')

var tape = require('tape')

tape('local open, remote open', function (t) {
  var path = '/tmp/test-scuttlebutt-remote'
  t.plan(2)
  rimraf(path, function () {
    var db = levelup(path, {createIfMissing: true})
    var schema = {test: function () { return new Model} }
    LevelScuttlebutt(db, 'test', schema)
 
    var local  = db.scuttlebutt
    var client = Client(schema)

    local.open('test1', function (err, a) {
      if(err) t.fail(err)

      console.log('OPEN')
 
      a.set('x', Math.random())
      a.set('y', Math.random())
      a.set('z', Math.random())
 
      client.open('test1', function (err, b) {
        t.notStrictEqual(a, b)
        t.deepEqual(b.history(), a.history())
        t.end()
      })
    })
 
    var ls = local.createRemoteStream()
    var rs = client.createStream()

    rs.on('data', console.log)
    ls.on('data', console.log)

    ls.pipe(rs).pipe(ls)
  })
})

tape('parallel open', function (t) {
  var path = '/tmp/test-scuttlebutt-remote2'
  t.plan(2)
  rimraf(path, function () {
    var db = levelup(path, {createIfMissing: true})
    var schema = {test: Model}
    LevelScuttlebutt(db, 'test', schema)

    var a,b

    var local  = db.scuttlebutt
    var remote = Client(schema)
    local.open('test1', function (err, _a) {
      if(err) t.fail(err)
      a = _a
 
      a.set('x', Math.random())
      a.set('y', Math.random())
      a.set('z', Math.random())

      if(a && b) next() 
    })

    remote.open('test1', function (err, _b) {
      b = _b
      if(a && b) next()
    })

    function next () {
      t.notStrictEqual(a, b)
      t.deepEqual(b.history(), a.history())
      t.end()
    }

    var ls = local.createStream()
    var rs = remote.createStream()
 
    ls.pipe(rs).pipe(ls)
  })
})

tape('remote open, local open', function (t) {
  var path = '/tmp/test-scuttlebutt-remote3'
  t.plan(2)
  rimraf(path, function () {
    var db = levelup(path, {createIfMissing: true})
    var schema = {test: Model}
    LevelScuttlebutt(db, 'test', schema)
 
    var local  = db.scuttlebutt
    var remote = Client(schema)

    remote.open('test1', function (err, a) {
      if(err) t.fail(err)
 
      a.set('x', Math.random())
      a.set('y', Math.random())
      a.set('z', Math.random())
 
      local.open('test1', function (err, b) {
        t.notStrictEqual(a, b)
        console.log(b.history())
        t.deepEqual(b.history(), a.history())
        t.end()
      })
    })

    var local  = Remote(schema).openDb(db)
    var remote = Remote(schema)
 
    var ls = local.createStream()
    var rs = remote.createRemoteStream()

    rs.on('data', console.log)

    ls.pipe(rs).pipe(ls)

  })
})

