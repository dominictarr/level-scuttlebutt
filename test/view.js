var level     = require('level-test')()
var SubLevel  = require('level-sublevel')
var delay     = require('delay-stream')
var Model     = require('scuttlebutt/model')
var LevelScuttlebutt
              = require('../')
var MapReduce = require('map-reduce')
var Client    = require('../client')
var mac       = require('macgyver')().autoValidate()
var tape      = require('tape')

tape('test', function (t) {

  var A, B

  var db = SubLevel(level('level-scuttlebutt-test-A'))

  var schema = {
    test: function () {
      return Model()
    }
  }

  LevelScuttlebutt(db, 'test1', schema)

  db.views['all'] = 
    MapReduce(db, 'all',
      function (key, scuttle, emit) { 
        console.log(key.split('!'), scuttle)
        return emit(key.split('!'), 1)
      },
      function (acc, item) {
        return '' + (Number(acc) + Number(item))
      },
      '0'
    )

  //open a scuttlebutt, then close the connection to the database,
  //then reopen the connection, then the scuttlebutt should be reconnected.

  var local  = db.scuttlebutt
  var remote = Client(schema, 'test1-client')

  local.open('test!thing1',  mac(function remoteOpen (err, a) {
    if(err) t.fail(err)
    a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())
  }).once())

  local.open('test!thing2',  mac(function remoteOpen (err, a) {
    if(err) t.fail(err)
    a.set('x', Math.random())
    a.set('y', Math.random())
    a.set('z', Math.random())
  }).once())

  var rv = []
  var lv = []
  var ended = 0
  function onEnd () {
    if(!ended++) return
    t.deepEqual(rv, lv)
//    console.log(rv, lv)
//    console.log('passed?')
    t.end()
  }

  remote.view({
    name: 'all', range: ['test', true]
  }).on('data', function (data) {
    console.log('remote view', data)
    rv.push(data)
    if(rv.length > 1) onEnd()
  })

  local.view({
    name: 'all', range: ['test', true]
  }).on('data', function (data) {
    console.log('local view', data)
    lv.push(data)
    if(lv.length > 1) onEnd()
  })

  var ls = local.createRemoteStream()
  var rs = remote.createStream()

  ls.pipe(rs).pipe(ls)

})
