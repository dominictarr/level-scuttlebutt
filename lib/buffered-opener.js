var EventEmitter = require('events').EventEmitter
var Cache        = require('./cache')
var through      = require('through')

module.exports = function (schema, id) {
  var opener = new EventEmitter()
  var _opener

  if('string' !== typeof id)
    throw new Error('id must be string')

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

  opener.open = Cache(schema, id, function (scuttlebutt, tail, cb) {
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
    var opening = {}
    while(_opener && toOpen.length) {
      var args = toOpen.shift()
      opening[args[0].name] = true
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

    //reopen anything that was closed..
    for(var key in cache)
      if(!opening[key]) {
        _opener.open(cache[key], true, function () {})
      }
  }

  return opener
}
