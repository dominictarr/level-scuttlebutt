var levelup = require('level-test')();
var SubLevel = require('level-sublevel')
var levelScuttlebutt = require('../');
var Model = require('scuttlebutt/model');

require('tape')('test', function (t) {
  var db = SubLevel(levelup('test-level-scuttlebutt-expected'))
  levelScuttlebutt(db, "TEST", function (name) {
    
    var m = new Model();
    m.set('foo', 'BAR')
    return m
  });

  db.open('some-name', function (err, model) {
    if(err) throw err
    t.deepEqual(model.toJSON(), {foo: 'BAR'})
    t.end()
  });
})
