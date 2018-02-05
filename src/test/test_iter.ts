import * as stream from "stream";
import { asyncIteratorFor } from "../";

import "should";
import "source-map-support/register";

describe("StreamAsyncIterator", () => {
  it("writes data and closes", async () => {
    let done = false;
    const fake = new stream.Readable({
      read(size) {
        if (!done) {
          fake.push(Buffer.from("hello"));
          done = true;
        } else {
          fake.push(null);
        }
      }
    });

    let worked = false;
    for await (const b of asyncIteratorFor(fake)) {
      b.toString().should.eql("hello");
      worked = true;
    }
    worked.should.eql(true);
  });

  it("collects a stream of data", async () => {
    let data = [ "hello", " sail", "or" ];
    const fake = new stream.Readable({
      read(size) {
        if (data.length == 0) {
          fake.push(null);
          return;
        }
        fake.push(Buffer.from(data.shift() || ""));
      }
    });

    const iter = asyncIteratorFor(fake);
    const rv = await Promise.all([ iter.next(), iter.next(), iter.next(), iter.next() ]);
    rv.map(item => item == null ? "" : item.toString()).should.eql([ "hello", " sail", "or" ]);
  });
});
