var EventEmitter = require('events').EventEmitter
var Cache        = require('./cache')
var through      = require('through')

module.exports = function (schema) {
  var opener = new EventEmitter()
  var _opener

  opener.swap = function (newOpener) {
    if(_opener) throw new Error('already has opener, expects opener.emit("close")')
    if(!newOpener) throw new Error('cannot swap null')
    _opener = newOpener
    _opener.once('close', function () {
      _opener = null
    })
    ready()
    return opener
  }

  var toOpen = [], toView = [], _open, _view

  //cache at this level, not on scuttlebutt.open

  opener.open = Cache(schema, function (scuttlebutt, tail, cb) {
    if('object' !== typeof scuttlebutt)
      throw new Error('expected Scuttlebutt')

    if(!_opener)
      return toOpen.push([scuttlebutt, tail, cb])

    _opener.open(scuttlebutt, tail, cb)
    return scuttlebutt
  })

  var cache = opener.open.local

  opener.view = function () {
    var args = [].slice.call(arguments)
    if(_opener)
      return _opener.view.apply(null, args)
    var stream = through()
    toView.push({args: args, stream: stream})
    return stream
  }

  function ready () {
    while(_opener && toOpen.length) {
      var args = toOpen.shift()
      _opener.open.apply(null, args)
    }
    while(_opener && toView.length) {
      var v = toView.shift()
      _opener.view.apply(null, v.args)
        .on('error', function (err) {
          //because stream errors are not propagated...
          v.stream.emit('error', err)
        }).pipe(v.stream)
    }

    //reopen anything that was closed...
    //for(var key in cache)
    //  _opener.open(cache[key], true, function () {})
  }

  return opener
}
