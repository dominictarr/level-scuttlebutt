
var Schema   = require('./lib/schema')
var Client   = require('./lib/client-opener')
var Buffered = require('./lib/buffered-opener')

module.exports = function (schema, id) {
  schema = Schema(schema, id)
  var c = Client()
  var b = Buffered(schema, id)
  c.on('open', function () {
    b.swap(c)
  })
  b.createStream = 
  b.createRemoteStream = c.createStream
  return b
}
