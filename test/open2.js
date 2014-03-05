//test to open scuttlebutt from leveldb.

var level    = require('level-test')()
var SubLevel = require('level-sublevel')

var Model   = require('scuttlebutt/model')
var LevelScuttlebutt
            = require('..')
var Client  = require('../client')
var mac     = require('macgyver')().autoValidate()
var tape    = require('tape')

function create (c) {
  return function () {
    return new c
  }
}

tape('local open, remote open', function (t) {
  var path = 'test-scuttlebutt-remote'
  t.plan(1)
  var db = SubLevel(level(path))
  var schema = {foo: create(Model), bar: create(Model)}
  LevelScuttlebutt(db, 'test', schema)
  var local  = db.scuttlebutt
  var remote = Client(schema, 'test-client')
  var a, b

  remote.open('foo1', mac(function (err, _a) {
    if(err) t.fail(err)
    a = _a
    console.log('OPEN foo1')
    a.on('change', mac(function (k, r) {
      console.log(this.name, k, r)
    }).times(3))

    a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())
    console.log('A', a.history())

    if(a && b) t.notDeepEqual(a.history(), b.history()), t.end()
  }).once())


  remote.open('bar1', mac(function (err, _b) {
    b = _b
    console.log('OPEN bar1')
    b.on('change', mac(function (k, r) {
      console.log(this.name, k, r)
    }).times(3))
    b.set('a', Math.random())
    b.set('b', Math.random())
    b.set('c', Math.random())


    console.log('B', b.history())

    if(a && b) t.notDeepEqual(a.history(), b.history()), t.end()
  }).once())

  console.log('>>>>>>>>>>>>>>>>')
  var ls = local.createRemoteStream()
  console.log('<<<<<<<<<<<<<<<<')

  var rs = remote.createStream()
  console.log(rs)
  rs.on('data', console.log)
//    ls.on('data', console.log)

  ls.pipe(rs).pipe(ls)

})


