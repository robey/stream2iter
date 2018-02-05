import * as stream from "stream";

const EMPTY = Buffer.alloc(0);

class StreamIterator implements AsyncIterator<Buffer> {
  ready = false;
  eof = false;
  error?: Error;

  resolve?: (value: IteratorResult<Buffer>) => void;
  reject?: (error: Error) => void;

  constructor(public stream: stream.Readable) {
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
      this.resolve = resolve;
      this.reject = reject;
      if (this.ready) this.wakeup();
    });
  }

  wakeup() {
    if (!this.resolve || !this.reject) return;

    if (this.error) return this.callReject(this.error);
    if (this.eof) return this.callResolve({ done: true, value: EMPTY });

    const buffer = this.stream.read() as Buffer;
    if (buffer == null) return;
    this.callResolve({ done: false, value: buffer });
  }

  callResolve(value: IteratorResult<Buffer>) {
    const resolve = this.resolve;
    delete this.resolve;
    delete this.reject;
    this.ready = false;
    if (!resolve) throw new Error("invalid state");
    resolve(value);
  }

  callReject(error: Error) {
    const reject = this.reject;
    delete this.resolve;
    delete this.reject;
    this.ready = false;
    if (!reject) throw new Error("invalid state");
    reject(error);
  }
}
