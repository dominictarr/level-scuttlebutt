//test to open scuttlebutt from leveldb.

var level    = require('level-test')()
var SubLevel = require('level-sublevel')

var Model   = require('scuttlebutt/model')
var LevelScuttlebutt = require('..')
var Client  = require('../client')
var mac     = require('macgyver')().autoValidate()

var tape = require('tape')

tape('local open, remote open', function (t) {
  var path = 'test-scuttlebutt-remote'
  t.plan(2)
  var db = SubLevel(level(path))

  var schema = {test: function () { return new Model} }

  LevelScuttlebutt(db, 'TEST', schema)
  var local  = db.scuttlebutt
  var client = Client(schema, 'TEST-CLIENT')

  local.open('test1', mac(function (err, a) {
    if(err) t.fail(err)

    console.log('OPEN')
    a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())
    console.log('A', a.history(), a._parent.history())

    setTimeout(function () {
    client.open('test1', mac(function (err, b) {
      if(err) t.fail(err)
      
      console.log('B', b.history())
      t.notStrictEqual(a, b)
      t.deepEqual(b.history(), a.history())
      t.end()
    }).once())

    }, 500)
  }).once())
  var ls = local.createRemoteStream()
  var rs = client.createStream()

  rs.on('data', function (d) { console.log('rs>>', d) })
  ls.on('data', function (d) { console.log('ls>>', d) })

  ls.pipe(rs).pipe(ls)

})

tape('parallel open', function (t) {
  var path = 'test-scuttlebutt-remote2'
  t.plan(2)

  var db = SubLevel(level(path))
  var schema = {test: Model}
  LevelScuttlebutt(db, 'test', schema)

  var a,b

  var local  = db.scuttlebutt
  var remote = Client(schema, 'TEST-CLIENT')
  local.open('test1', mac(function (err, _a) {
    if(err) t.fail(err)
    a = _a
    a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())

    if(a && b) next() 
  }).once())

  remote.open('test1', mac(function (err, _b) {
    b = _b
    if(a && b) next()
  }).once())

  function next () {
    console.log('END')
    t.notStrictEqual(a, b)
    t.deepEqual(b.history(), a.history())
    t.end()
  }

  var ls = local.createRemoteStream()
  var rs = remote.createStream()
  ls.pipe(rs).pipe(ls)
})

