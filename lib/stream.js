var MuxDemux = require('mux-demux')
var through  = require('through')

module.exports = function (opener) {
  return function () {
    return MuxDemux(function (stream) {

      if('string' === typeof stream.meta) {
        var ts = through().pause()
        //TODO. make mux-demux pause.

        stream.pipe(ts)
        //load the scuttlebutt with the callback,
        //and then connect the stream to the client
        //so that the 'sync' event fires the right time,
        //and the open method works on the client too.
       opener.open(stream.meta, function (err, doc) {
          ts.pipe(doc.createStream()).pipe(stream)
          ts.resume()
        })
      } else if(Array.isArray(stream.meta)) {
        //reduce the 10 most recently modified documents.
        try {
          opener.view.apply(null, stream.meta)
            .pipe(through(function (data) {
              this.queue(data)
            }))
            .pipe(stream)
        } catch (err) {
          stream.error(err) //emit error on other end!
        }
      }
    })
  }
}
