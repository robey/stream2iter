import * as stream from "stream";

const EMPTY = Buffer.alloc(0);

// in case the ES8 engine doesn't have an async iterator yet.
(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");

export class StreamAsyncIterator implements AsyncIterator<Buffer> {
  ready = false;
  eof = false;
  error?: Error;

  // the spec says we have to allow a bunch of sequential `next()` calls
  // before any of them resolve, and we have to respond to them in order.
  resolve: Array<(value: IteratorResult<Buffer>) => void> = [];
  reject: Array<(error: Error) => void> = [];

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

  [Symbol.asyncIterator](): AsyncIterator<Buffer> {
    return this;
  }

  next(): Promise<IteratorResult<Buffer>> {
    return new Promise((resolve, reject) => {
      this.resolve.push(resolve);
      this.reject.push(reject);
      if (this.ready || this.eof || this.error) this.wakeup();
    });
  }

  wakeup() {
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

  callResolve(value: IteratorResult<Buffer>) {
    const resolve = this.resolve.shift();
    this.reject.shift();
    if (!resolve) throw new Error("invalid state");
    resolve(value);
  }

  callReject(error: Error) {
    const reject = this.reject.shift();
    this.resolve.shift();
    if (!reject) throw new Error("invalid state");
    reject(error);
  }
}

export function asyncIteratorFor(stream: stream.Readable, size?: number): StreamAsyncIterator {
  return new StreamAsyncIterator(stream, size);
}
