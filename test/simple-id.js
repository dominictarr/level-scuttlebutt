

//test to open scuttlebutt from leveldb.

var rimraf  = require('rimraf')
var levelup = require('levelup')
var SubLevel = require('level-sublevel')

var Model   = require('scuttlebutt/model')
var LevelScuttlebutt = require('..')
var Client  = require('../client')
var mac     = require('macgyver')().autoValidate()

var tape = require('tape')

function initDb(suffix) {
  var path = '/tmp/test-scuttlebutt-'+suffix
  rimraf.sync(path)
  return SubLevel(levelup(path))
}


tape('sets correct id with object', function (t) {
  t.plan(2)
  var db = initDb('object')
  var ID = '#' + Math.random().toString(16).substring(2)
  LevelScuttlebutt(db, ID, {
    test: function () { return new Model}
  })

  var a = db.open('test1', mac(function (err, a) {
    t.equal(a.id, ID)
    t.end()
  }).once())
  t.equal(a.id, ID)
})

tape('sets correct id with function', function (t) {
  t.plan(2)
  var db = initDb('function')
  var ID = '#' + Math.random().toString(16).substring(2)
  LevelScuttlebutt(db, ID, function () { return new Model})

  var a = db.open('test1', mac(function (err, a) {
    t.equal(a.id, ID)
    t.end()
  }).once())
  t.equal(a.id, ID)
})
  
