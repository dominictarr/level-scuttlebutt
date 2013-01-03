# level-scuttlebutt

Plugin to add persist and query [scuttlebutt](https://github.com/scuttlebutt) documents
stored in leveldb.

Instead of representing an object as a single document, scuttlebutt represents a document as
a series of immutable transactions. The 'document' is modified by appending a new transaction.
Old transactions that are no longer relevant can be cleaned up, but you can never modify a
transaction in place. Turns out, that leveldb (a log-structured merge tree) is optimized for 
exactly this sort of data.

# Example

``` js
//creae a leveldb instance and patch it with level-scuttlebutt
var levelup = require("levelup")
var level_scuttlebutt = require("level-scuttlebutt")

//a scuttlebutt model.
var Model = require('scuttlebutt/model')
//Unique Device Id. 
//level-scuttlebutt needs to know the id this instance,
//if changes are made to the objects.
//the udid module handles this
var udid = require('udid')

levelup(DB_FILE, {createIfMissing: true}, function (err, db){
  if(err) throw err
  //create a scuttlebutt instance given a name.
  //the key will match the start of the name.
  level_scuttlebutt(db, udid, function (name) {
    //scuttlebutts 
    return new Model()
    //now is a good time to customize the scuttlebutt instance.
  })

  //see below...
  db.scuttlebutt.addMapReduce(mapReduceOptions)

  //open a scuttlebutt instance by name.
  db.scuttlebutt.open(name, function (err, model) {
    model.on('change:key', console.log) //...
    model.set('key', value)
  })

})
```

## Initialization

Add `level-scuttlebutt` plugin to the `db` object
`var level_scuttlebutt = require('level-scuttlebutt'); level_scuttlebutt(db, ID, schema)`

`ID` is a unique string that identifies the node instance, should be tied to the leveldb instance,
I suggest using [udid](https://github.com/dominictarr/udid).

`schema` should be a function that takes a string (the name of the scuttlebutt instance) and returns
and empty scuttlebutt instance. You can use [scuttlebutt-schema](https://github.com/dominictarr/scuttlebutt-schema)


## Map Reduce

create a map-reduce `db.scuttlebutt.addMapReduce(mapReduceOptions)`.
This is the same as `db.mapReduce.add(mapReduceOptions)` in [map-reduce](https://github.com/dominictarr/map-reduce)
except that you should leave off `start` and `end`, and that in `map: function (key, value) {...}` `value` will be your scuttlebutt instance.

Do not assign event listeners during the `map` function.

### Example

get the 10 latest documents edited.

``` js
db.scuttlebutt.addMapReduce({
  name: 'latest10',
  map: function (key, sb) {
    var name = sb.meta.get('name') || 'no_name'
    //emit 0-many group-value pairs.
    //value must be a string or a buffer.
    this.emit([], JSON.stringify({name: name, time: Date.now(), length: sb.text.length}))
  },
  //merge the latest value into the accumulator.
  reduce: function (acc, value) {
    var all = parse(acc).concat(parse(value))
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
  initial: '[]'
})
```



## License

MIT
