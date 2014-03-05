//test to open scuttlebutt from leveldb.

var level    = require('level-test')()
var SubLevel = require('level-sublevel')

var Model   = require('scuttlebutt/model')
var LevelScuttlebutt = require('..')
var Client  = require('../client')
var mac     = require('macgyver')().autoValidate()

var tape = require('tape')


tape('remote open, local open', function (t) {
  var path = 'test-scuttlebutt-remote3'
  t.plan(2)

  var db = SubLevel(level(path))
  var schema = {test: Model}
  LevelScuttlebutt(db, 'test', schema)
  var local  = db.scuttlebutt
  var remote = Client(schema, 'test-client')

  remote.open('test1', mac(function remoteOpen (err, a) {
    if(err) t.fail(err)
     a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())

    local.open('test1', mac(function localOpen (err, b) {
      t.notStrictEqual(a, b)
      console.log('A', a.history())
      console.log('B', b.history())
      t.deepEqual(b.history(), a.history())
      t.end()
    }).once())

  }).once())
  var ls = local.createRemoteStream()
  var rs = remote.createStream()

  ls.pipe(rs).pipe(ls)
})

