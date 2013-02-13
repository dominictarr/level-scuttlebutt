var mapReduce = require('map-reduce')

function merge (a, b) {
  for (var k in b) {
    a[k] = b[k]
  }
  return a
}

module.exports = function (db) {

  if(db.scuttlebutt.addMap) return

  mapReduce(db)

  db.scuttlebutt.addView =
  db.scuttlebutt.addMapReduce = function (opts) {

    opts = merge({
      name: 'default',
      start: db.scuttlebutt.range.start,
      end:   db.scuttlebutt.range.end,
      keyMap: function (data) {
        var d = data.key.toString().split('\0')
        d.pop();d.pop()
        return d.pop()
      },
      load: function (name, cb) {
        db.scuttlebutt(name, false, function (err, s) {
          cb(null, s)
          s.dispose()
        })
      }
      //the user should pass in map, and/or reduce
    }, opts)

    db.mapReduce.add(opts)

    return db.scuttlebutt
  }
}
