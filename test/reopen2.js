var level    = require('level-test')()
var SubLevel = require('level-sublevel')
var delay    = require('delay-stream')
var Model    = require('scuttlebutt/model')
var LevelScuttlebutt = require('../')
var Client   = require('../client')
var mac      = require('macgyver')().autoValidate()
var tape     = require('tape')

tape('test', function (t) {



  db = SubLevel(level('level-scuttlebutt-test-A'))

  var schema = {
    test: function () {
      return Model()
    }
  }

  LevelScuttlebutt(db, 'test1', schema)

  //open a scuttlebutt, then close the connection to the database,
  //then reopen the connection, then the scuttlebutt should be reconnected.

  var local  = db.scuttlebutt
  var remote = Client(schema, 'test1-client')

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
//      t.end()
      b.set('a', Math.random())
      b.set('b', Math.random())
      b.set('c', Math.random())

      t.deepEqual(b.history(), a.history())

      rs.end()

      a.set('i', Math.random())
      b.set('j', Math.random())
      a.set('k', Math.random())

      t.notDeepEqual(b.history(), a.history())

      console.log('pre disconnect')
      console.log('A', a.history())
      console.log('B', b.history())

      var ls2 = local.createRemoteStream()
      var rs2 = remote.createStream()

      ls2.pipe(rs2).pipe(ls2)

      ls2.resume()
      rs2.resume()

      process.nextTick(function () {
        process.nextTick(function () {
          console.log('post reconnect')
          console.log('A', a.history())
          console.log('B', b.history())
          t.deepEqual(b.history(), a.history())
          t.end()
        })
      })
    }).once())

  }).once())

  var ls = local.createRemoteStream()
  var rs = remote.createStream()

  ls.pipe(rs).pipe(ls)

})
