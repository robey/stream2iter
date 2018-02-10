import * as stream from "stream";

const EMPTY = Buffer.alloc(0);

// in case the ES8 engine doesn't have an async iterator yet.
(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");

type Resolver<A> = (value: IteratorResult<A>) => void;
type Rejecter = (error: Error) => void;

export class StreamAsyncIterator implements AsyncIterator<Buffer> {
  private ready = false;
  private eof = false;
  private error?: Error;

  // the spec says we have to allow a bunch of sequential `next()` calls
  // before any of them resolve, and we have to respond to them in order.
  private resolve: Array<Resolver<Buffer>> = [];
  private reject: Array<Rejecter> = [];

  constructor(public stream: stream.Readable, public size?: number) {
    stream.pause();
    stream.on("readable", () => {
      this.ready = true;
      this.wakeup();
    });
    stream.on("error", error => {
      this.error = error;
      this.wakeup();
    });
    stream.on("end", () => {
      this.eof = true;
      this.wakeup();
    })
  }

  next(): Promise<IteratorResult<Buffer>> {
    return new Promise((resolve, reject) => {
      this.resolve.push(resolve);
      this.reject.push(reject);
      if (this.ready || this.eof || this.error) this.wakeup();
    });
  }

  private wakeup() {
    while (this.resolve.length > 0) {
      if (this.error) {
        this.callReject(this.error);
      } else if (this.eof) {
        this.callResolve({ done: true, value: EMPTY });
      } else {
        const buffer = this.stream.read(this.size) as Buffer;
        if (buffer == null) {
          this.ready = false;
          return;
        }
        this.callResolve({ done: false, value: buffer });
      }
    }
  }

  private callResolve(value: IteratorResult<Buffer>) {
    const resolve = this.resolve.shift();
    this.reject.shift();
    if (!resolve) throw new Error("invalid state");
    resolve(value);
  }

  private callReject(error: Error) {
    const reject = this.reject.shift();
    this.resolve.shift();
    if (!reject) throw new Error("invalid state");
    reject(error);
  }
}

export class StreamAsyncIterable implements AsyncIterable<Buffer> {
  private iter: AsyncIterator<Buffer>;

  constructor(public stream: stream.Readable, public size?: number) {
    // there can be only one.
    this.iter = new StreamAsyncIterator(this.stream, this.size);
  }

  [Symbol.asyncIterator](): AsyncIterator<Buffer> {
    return this.iter;
  }
}

/*
 * wrap a node.js `Readable` stream into an ES8 async iterator, of the kind
 * that can be used in `for await` expressions. the iterator will place the
 * stream into "pull" mode (paused) and emit `Buffer` objects until it
 * reaches the end of the stream, or the stream emits an error.
 *
 * `size` is an optional parameter to pass to the stream's `read()` method,
 * if you want to try to read chunks of a specific size.
 */
export function asyncIteratorFor(stream: stream.Readable, size?: number): StreamAsyncIterable {
  return new StreamAsyncIterable(stream, size);
}
