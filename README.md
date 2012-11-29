# level-scuttlebutt

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

## License

MIT
