# level-scuttlebutt

Plugin to add persist and query [scuttlebutt](https://github.com/scuttlebutt) documents
stored in leveldb.

Instead of representing an object as a single document, scuttlebutt represents a document as
a series of immutable transactions. The 'document' is modified by appending a new transaction.
Old transactions that are no longer relevant can be cleaned up, but you can never modify a
transaction in place. Turns out, that leveldb (a log-structured merge tree) is optimized for 
exactly this sort of data.



range based documents.

DOC|TS|SOURCE ->

intercept each put,
and also write to

SOURCE|TS|DOC

also, update

LATEST|SOURCE = TS

then, to replicate:

exchange LATEST|*=x

then send SOURCE|x...

so, the minimum api for a range-doc

write(key, value, ts, source)

on('_update', doc, ts, source)

rm(doc, ts, source)

## map-reduce

To make this work with map-reduce,
queue the update job when a change is made...

Could use a vector clock to represent the state of the latest change(s) mapped.
if the document is open... then it's really easy to do the map,
even if it's rapidly changing.

If it's not open... then add jobs like before...
Just tie them to the range, not the key.

Maybe, if I separate the map, from the reduce...
and triggered reduce from hooks, not inserted them.

## License

MIT
