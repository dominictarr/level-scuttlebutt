module.exports = function (connect) {
  //pass in a string name, or a scuttlebutt instance
  //you want to reconnect to the server.
  return function (scuttlebutt, tail, cb) {
    if('function' == typeof tail)
      cb = tail, tail = true

    if('object' !== typeof scuttlebutt)
      throw new Error('expect Scuttlebutt, not ' + typeof scuttlebutt)

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

