import * as stream from "stream";
import { asyncIteratorFor } from "../";
import { streamIntoLines } from "../lines";
import { socketpair } from "./helpers";

import "should";
import "source-map-support/register";

function sleep(msec: number): Promise<string> {
  return new Promise(resolve => setTimeout(resolve, msec)).then(() => {
    return "SLEEP";
  });
}

async function arrayFrom<A>(iter: AsyncIterable<A>) {
  const rv: Array<A> = [];
  for await (const item of iter) rv.push(item);
  return rv;
}

describe("streamIntoLines", () => {
  it("simple", async () => {
    let done = false;
    const fake = new stream.Readable({
      read(size) {
        if (!done) {
          fake.push(Buffer.from("hello\n"));
          done = true;
        } else {
          fake.push(null);
        }
      }
    });

    let worked = false;
    for await (const line of streamIntoLines(asyncIteratorFor(fake), 1024)) {
      line.should.eql("hello");
      worked = true;
    }
    worked.should.eql(true);
  });

  it("notices a single line", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 128);
    s.write(Buffer.from("hello\n"));
    (await iter[Symbol.asyncIterator]().next()).should.eql({ done: false, value: "hello" });
  });

  it("notices a few lines bundled together", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 128);
    s.write(Buffer.from("hello\ncats\ndogs\n"));
    (await iter[Symbol.asyncIterator]().next()).should.eql({ done: false, value: "hello" });
    (await iter[Symbol.asyncIterator]().next()).should.eql({ done: false, value: "cats" });
    (await iter[Symbol.asyncIterator]().next()).should.eql({ done: false, value: "dogs" });
  });

  it("buffers a chopped-up line", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 128)[Symbol.asyncIterator]();
    s.write(Buffer.from("hel"));

    const p = iter.next().then(ir => ir.value);
    (await Promise.race([ sleep(10), p ])).should.eql("SLEEP");

    s.write("lo\ncats");
    (await Promise.race([ sleep(10), p ])).should.eql("hello");
  });

  it("handles CR+LF", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 128)[Symbol.asyncIterator]();
    s.write(Buffer.from("hello\r"));

    const p = iter.next().then(ir => ir.value);
    (await Promise.race([ sleep(10), p ])).should.eql("SLEEP");

    s.write("\ncat");
    (await Promise.race([ sleep(10), p ])).should.eql("hello");

    s.write("s\r\n");
    (await Promise.race([ sleep(10), iter.next().then(ir => ir.value) ])).should.eql("cats");
  });

  it("handles a long buffer", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 128)[Symbol.asyncIterator]();
    s.write(Buffer.from("this is a"));
    s.write(Buffer.from("nother lon"));
    s.write(Buffer.from("g string"));
    s.write(Buffer.from("\n"));
    (await iter.next()).value.should.eql("this is another long string");
  });

  it("rejects lines that are too long", async () => {
    const s = new stream.PassThrough();
    const iter = streamIntoLines(asyncIteratorFor(s), 16)[Symbol.asyncIterator]();
    s.write(Buffer.from("abcdefghij"));
    s.write(Buffer.from("klmnopq"));
    iter.next().should.be.rejectedWith(/Buffer overflow/);
  });

  describe("over an actual socket", () => {
    it("emits a stream of lines", async () => {
      const { client, server } = await socketpair();
      client.write("hello\nkitty\n");
      client.end();
      (await arrayFrom(streamIntoLines(asyncIteratorFor(server), 1024))).should.eql([ "hello", "kitty" ]);
    });

    it("handles odd packetizing", async () => {
      const { client, server } = await socketpair();
      client.write("hel");
      client.write("lo\nkit");
      client.write("ty\nboo");
      client.end();
      (await arrayFrom(streamIntoLines(asyncIteratorFor(server), 1024))).should.eql([ "hello", "kitty" ]);
    });

    it("reports errors", async () => {
      const { client, server } = await socketpair();
      client.write("hello kitty this line is too long\n");
      client.end();
      arrayFrom(streamIntoLines(asyncIteratorFor(server), 16)).should.be.rejectedWith(/Buffer overflow/);
    });
  });
});
