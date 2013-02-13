var EventEmitter = require('events').EventEmitter
var MuxDemux     = require('mux-demux')
var remoteOpen = function (connect) {
  //pass in a string name, or a scuttlebutt instance
  //you want to reconnect to the server.
  return function (scuttlebutt, tail, cb) {
    if('function' == typeof tail)
      cb = tail, tail = true

    if('object' !== typeof scuttlebutt)
      throw new Error('expect Scuttlebutt, not ' + typeof scuttlebutt)

    var es = scuttlebutt.createStream(), stream
    try {
      stream = connect(scuttlebutt.name)
    } catch (err) { return cb(err) }

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

module.exports = function () {

  var opener = new EventEmitter()
  var mx = null

  opener.open = remoteOpen(function (name) {
    if(!mx) throw new Error('scuttlebutt remoteOpener must be connected')
    return mx.createStream(name)
  })

  opener.view = function () {
    var args = [].slice.call(arguments)
    return mx.createStream(args)
  }

  //create stream...
  opener.createStream = function () {
    if(mx) throw new Error('remoteOpener may only connect to one server')

    mx = MuxDemux(function (stream) {
      stream.error(new Error('remoteOpener is client only - cannot recieve stream'))
    })

    var ended = false

    function onEnd () {
      if(ended) return ended = true
      mx.removeListener('end',   onEnd)
      mx.removeListener('close', onEnd)
      mx.removeListener('error', onEnd)
      mx.removeAllListeners()
      mx = null
      opener.emit('close')
    }

    mx.on('close', onEnd)
    mx.on('end',   onEnd)
    mx.on('error', onEnd)

    process.nextTick(function () {
      opener.emit('open', mx)
      mx.resume()
    })
    return mx
  }

  return opener
}

