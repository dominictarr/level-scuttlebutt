var MuxDemux = require('mux-demux')
var through  = require('through')
var EventEmitter = require('events').EventEmitter
var Schema   = require('./schema')
var Cache    = Schema.cache

//create a server that can wrap a leveldb.
//this assumes that the db already has scuttlebutt installed.
//it would be nice if it was possible to abstract this,
//and just wrap anything in a remote interface, like rpc
//but it's really not that simple, given that we are working with objects
//that are replicatable on their own.
//maybe we could detect that, oh, this method returned a stream,
//handle it this way - this object returned an object with createStream method
//maybe it's duplex? replicate it...
//^ those would both require having some smarts on the client,
//you'd need to know that it's gonna return a stream.
//so for now, we are gonna just write the client manually...

//COMBINE into one stream object...

var remote = module.exports = function (schema) {

  schema = Schema(schema)

  //OKAY, so maybe write some test so I know this actually works?
  //ALSO, scuttlebutt needs to accept a ready scuttlebutt instance instead of name...

  var db = 'function' === typeof schema ? null : schema

  var emitter = new EventEmitter()

  var toOpen = [], toView = [], _open, _view

  //cache at this level, not on scuttlebutt.open

  emitter.open = Cache(schema, function (scuttlebutt, tail, cb) {
    if('string' === typeof scuttlebutt)
      throw new Error('expected Scuttlebutt passed in by cache')

    if(!_open)
      return toOpen.push([scuttlebutt, tail, cb])

    _open(scuttlebutt, tail, cb)
    return scuttlebutt
  })

  emitter.view = function () {
    var args = [].slice.call(arguments)
    if(_view)
      return _view.apply(null, args)
    var stream = through()
    toView.push({args: args, stream: stream})
    return stream
  }

  function ready () {
    while(_open && toOpen.length)
      _open.apply(null, toOpen.shift())
    while(_view && toView.length) {
      var v = toView.shift()
      _view.apply(null, v.args)
        .on('error', function (err) {
          //because stream errors are not propagated...
          v.stream.emit('error', err)
        }).pipe(v.stream)
    }
  }

  emitter.openDb = function (_db) {
    db = _db
    if(!db.isOpen()) db.open()

    //leveldb already buffers while it's loading
    //can I trust that?

    _open = function dbOpen () {
      var args = [].slice.call(arguments)
      var sb = db.scuttlebutt._open.apply(db.scuttlebutt, args)
      return sb
    }

    _view = function dbView () {
      return db.scuttlebutt.view.apply(db.scuttlebutt, arguments)
    }

    db.once('close', function () {
      if(_open == dbOpen) _open = null
      if(_view == dbView) _view = null
      //the streams should error or something,
      //if they are still connected when this happens.
    })

    ready()

    return this
  }

  var clientStream = false

  emitter.createStream = function (isServer) {

    //shoud add a check here that there is only one stream if in client mode.
    //there can be multiple server streams, but never multiple client streams.

    if(clientStream) throw new Error('only one connection allowed')
    if(!db) clientStream = true

    var mx = MuxDemux(function (stream) {
      if(!db) return stream.error('cannot access database this end')

      //if(!db.isOpen())
      //  return stream.error('db is not open yet')

      if('string' === typeof stream.meta) {
        var ts = through().pause()
        //TODO. make mux-demux pause.

        stream.pipe(ts)
        //load the scuttlebutt with the callback,
        //and then connect the stream to the client
        //so that the 'sync' event fires the right time,
        //and the open method works on the client too.
        emitter.open(stream.meta, function (err, doc) {
          ts.pipe(doc.createStream()).pipe(stream)
          ts.resume()
        })
      } else if(Array.isArray(stream.meta)) {
        //reduce the 10 most recently modified documents.
        db.mapReduce.view.apply(db.mapReduce.view, stream.meta)
          .pipe(through(function (data) {
            this.queue(JSON.parse(data.value))
          }))
          .pipe(stream)
      }
    })

    if(db) {
      function onClose () { mx.end() }
      //TODO: make pull request to have close event
      //that fires when db STARTS to close
      db.once('closed', onClose)  
      mx.once('close', function () {
        db.removeListener('closed', onClose)
      })
    }

    var clientOpen =
      require('./schema')
        .open(schema,
          function (name) {
            //where is the messages going?
            return mx.createStream(''+name) //force to string.
          })

    function clientView (name, opts) {
      var args = [].slice.call(arguments)
    
      //enhance this to match api of server levelup...
      //and maybe ... wrap reconnect... abstract out reloading
      //so that it is more like having the database local.

      return mx.createStream(args)
    }

    //scuttlebutts can be reconnected automatically,
    //when the stream is reconnected, or the server changes.
    //can also defer the call, until there is a connection/db is open...

    //really, this is where the cache should be, not around db.scuttlebutt.open
    //will need the list of current scuttlebutts to reconnect with...

    if(!db) {
      process.nextTick(function () {
        _open = clientOpen

        //for about timed events, it will be possible to replay them in order...
        //from the thing last recieved. for streams that update randomly that won't work,
        //so you'll have to restream the whole thing when you reconnect.
        //(best to let the user reconnect again, if that is what they want)

        _view = clientView
      })
    }

    mx.on('end', function () {
      clientStream = false
    })

    process.nextTick(ready)

    return mx
  }

  return emitter
}

//hmmm... so this function return a stream.
//but, we'll have autonode...

