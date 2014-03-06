var level = require('level-test')()
  , assert = require('assert')
  , sublevel = require('level-sublevel')
//  , udid = require('udid')('example-app')
  , scuttlebutt = require('../')
  , Doc = require('crdt').Doc
  , test = require('tape')

// setup db
newDB = function (opts) {
  var db = sublevel(level('test-level-scuttlebutt-crdt', opts))
  scuttlebutt(db, 'udid', function(name) {return new Doc;});
  return db
}

test('modifying a sequence persists correctly', function(t) {
  t.plan(1)
  var DB = newDB()

  DB.open('one-doc', function(err, doc1) {
    var seq = doc1.createSeq('session', 'one');
    doc1.on('_remove', function (update) {
      console.error('_REMOVE', update)
    })
    seq.on('_update', console.error)

    seq.push({id: 'a'});
    seq.push({id: 'b'});
    seq.push({id: 'c'});
    console.log(seq.toJSON())
    seq.after('a', 'b');
    console.log(JSON.stringify(doc1.history()))

    var firstOutput = seq.toJSON()

    // is 'drain' the right event to listen for here?
    DB.on('drain', function(){
      DB.close(function(err){
        if (err) console.log('err', err);

        // reopen DB
        var anotherDB = newDB({clean: false})

        anotherDB.open('one-doc', function(err, doc2) {
          var seq2 = doc2.createSeq('session', 'one');

          var secondOutput = seq2.toJSON()
          console.log(doc2.history())
          t.same(secondOutput, firstOutput)
        })
      })
    })
  })
})
