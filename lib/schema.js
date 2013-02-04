var parserx = require('parse-regexp')

//don't make the timeout too large, because it will prevent the process from exiting...
var exports = module.exports = function (schema, id) {
  if('function' == typeof schema)
    return schema
  if('__proto__' === id)
    throw new Error('__proto__ is invalid id')

  if(!id) throw new Error('schema requires node id')

  var rules = []
  for (var p in schema) {
    rules.push({rx: parserx(p) || p, fn: schema[p]})
  }

  function match (key) {
    if('object' === typeof key) return key
    for (var i in rules) {
      var r = rules[i]
      var m = key.match(r.rx)
      if(m && m.index === 0) {
        var scuttlebutt = r.fn(key)
        scuttlebutt.name = key
        'function' === scuttlebutt.setId ? scuttlebutt.setId(id) : scuttlebutt.id = id
        return scuttlebutt
      }
    }
  }

  match.schema = schema
  match.rules = rules

  return match
}

exports.schema = exports

exports.cache =
function (schema, open, onCache) {
  var local = cached.local = {}
  function cached (name, tail, cb) {
    if('function' == typeof tail)
      cb = tail, tail = true

    //user *must not* pass a Scuttlebutt instance to cached open.
    if('string' !== typeof name)
      throw new Error('name must be string')

    //so if this is passed a ready instance...
    //and there is a cached instance... then pipe them together.
    //hmm, but the caching should be ontop of the other layer...
    //will this work?
    //ah, if a scuttlebutt is passed, and there isn't one in the cache
    //clone it and put the clone in the cache!
    //else, pipe it to the cached instace.

    //actually... should combine this into level-scuttlebutt
    //then only one cache will be necessary.

    //which will work better for reconnections.

    //...so, need lots of tests here.

    //yes, only one cache, the outer most open does not support
    //opening with a scuttlebutt - but remote, and 
    //level-scuttlebutt do!
    
    //then there is only one cache...
    //so, you always control the point of caching.
    //no "russian doll" caching.

    var cached = local[name]
    if(cached && 'function' === typeof cached.clone) {
      var n = cached.clone()
      n.name = name
      cb(null, n)
      return n
    }
    var clone
    var scuttlebutt = local[name] = schema(name)
    scuttlebutt.name = name
    open(scuttlebutt, tail, function (err, scuttlebutt) {
      if(err) return cb(err)
      cb(null, clone)
    })

    //will callback an error
    if(!scuttlebutt) return

    scuttlebutt.name = name
    
    //only scuttlebutts with clone can be cleanly cached.
    if('function' === typeof scuttlebutt.clone) {
      local[name] = scuttlebutt
      clone = scuttlebutt.clone()
      clone.name = name
      if(onCache) onCache('clone', scuttlebutt.name)
      //okay... have something to dispose the scuttlebutt when there are 0 streams.
      //hmm, count streams... and emit an event 'unstream' or something?
      //okay, if all the steams have closed but this one, then it means no one is using this,
      //so close...
      //TODO add this to level-scuttlebutt.

      //OH, hang on... maybe DOMAINS is the right thing to use here...

      var timer = null
      scuttlebutt.on('unstream', function (n) {
        if(n === 1) {
          clearTimeout(timer)
          timer = setTimeout(function () {
            scuttlebutt.dispose()
            if(onCache) onCache('uncache', scuttlebutt.name)
          }, TIMEOUT*1.5)
            //if an emitter was passed, imet
        } else if(n > 1)
          clearTimeout(timer)
      })
      scuttlebutt.on('dispose', function () {
        delete local[name]
      })
    }
    
    return scuttlebutt
  }

  return cached
}

exports.sync = 
exports.open = function (schema, connect) {
  //pass in a string name, or a scuttlebutt instance
  //you want to reconnect to the server.
  return function (name, tail, cb) {
    if('function' == typeof tail)
      cb = tail, tail = true

    if('string' === typeof name)
      throw new Error('expect cache to create Scuttlebutt for open')

    var scuttlebutt = name
    /*
    if('string' === typeof name)
      scuttlebutt = schema(name)
    else {
      scuttlebutt = name
      name = scuttlebutt.name
    }
    */
    var es = scuttlebutt.createStream()
    var stream = connect(scuttlebutt.name)

    if(!stream)
      return cb(new Error('unable to connect'))

    stream.pipe(es).pipe(stream)

    var ready = false
    es.once('sync', function () {
      if(ready) return
      ready = true

      //cb the stream we are loading the scuttlebutt from,
      //incase it errors after we cb?
      //I'm not sure about this usecase.
      //Actually, just leave that feature out!
      //that way I don't have to break API when I realize it was a bad idea.
      if(cb)    cb(null, scuttlebutt)
      if(!tail) es.end()
    })
    //hmm, this has no way to detect that the stream has errored
    stream.once('error', function (err) {
      if(!ready) return cb(err)
    })

    return scuttlebutt
  }
}

