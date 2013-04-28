# level-scuttlebutt

Plugin to add persistence and querying [scuttlebutt](https://github.com/scuttlebutt) documents
stored in leveldb.

Instead of representing an object as a single document, scuttlebutt represents a document as
a series of immutable transactions. The 'document' is modified by appending a new transaction.
Old transactions that are no longer relevant can be cleaned up, but you can never modify a
transaction in place. As it turns out, leveldb (a log-structured merge tree) is optimized for 
exactly this sort of data.

Must be used with [level-sublevel](https://github.com/dominictarr/level-sublevel)

# Example

``` js
var levelup = require("levelup")
var level_scuttlebutt = require("level-scuttlebutt")
var SubLevel = require('level-sublevel')


//create a leveldb instance...
//levelup must be extended with SubLevel!
var db = SubLevel(levelup(DB_FILE))



//a scuttlebutt model.
var Model = require('scuttlebutt/model')

//level-scuttlebutt needs to have an unique identifier of the current instance
var udid = require('udid')('app-name')


//patch it with level-scuttlebutt.
var sbDb = db.sublevel('scuttlebutt') //add a scuttlebutt 'table'

//k
level_scuttlebutt(sbDb, udid, function (name) {
  //create a scuttlebutt instance given a name.
  //the key will match the start of the name.
  return new Model()
  //now is a good time to customize the scuttlebutt instance.
})

//open a scuttlebutt instance by name.
sbDb.open(name, function (err, model) {
  model.on('change:key', console.log) //...
  model.set('key', value)
  
  // when you're done get rid of it
  model.dispose()
})

//the toJSON values are stored in the db,
//so you can just use any other map reduce library on it!
sbDb.views['all'] =
  mapReduce(sbDb, 'all', 
    function (key, json, emit) { 
      return emit(key.split('!'), 1)
    },
    function (acc, item) {
      return '' + (Number(acc) + Number(item))
    },
    '0'
  )

```

## Initialization

Add `level-scuttlebutt` plugin to the `db` object
`var level_scuttlebutt = require('level-scuttlebutt'); level_scuttlebutt(db, ID, schema)`

`ID` is a unique string that identifies the node (the machine) and should be 
tied to the leveldb instance.
I suggest using [udid](https://github.com/dominictarr/udid).

`schema` should be a function that takes a string (the name of the scuttlebutt instance)
and returns and empty scuttlebutt instance.
You can use [scuttlebutt-schema](https://github.com/dominictarr/scuttlebutt-schema).

## Queries

Use some other `level-*` plugin for queries!

[map-reduce](https://github.com/dominictarr/map-reduce), 
[level-map-merge](https://github.com/dominictarr/level-map-merge)

### Example

get the 10 last edited documents!

``` js
sbDb.views['latest10']
  = 
  MapReduce(sdb, 'latest10',
  function (key, json) {
    var name = key
    var obj = JSON.parse(json)
    //emit 0-many group-value pairs.
    //value must be a string or a buffer.
    this.emit([], JSON.stringify({name: name, time: Date.now(), length: obj.text.length}))
  },
  //merge the latest value into the accumulator.
  function (acc, value) {
    var all = JSON.parse(acc).concat(JSON.parse(value))
    //sort by time, decending.
    all.sort(function (a, b) {
      return b.time - a.time
    })
    //top ten most recent
    var all = all.slice(0, 10)
    return JSON.stringify(all)
  },
  //the first value for the accumulator.
  //since we are parsing it, it needs to be valid JSON.
  '[]'
})
```



## License

MIT
