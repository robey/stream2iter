const LF = 10;
const CR = 13;

export async function *streamIntoLines(stream: AsyncIterable<Buffer>, bufferSize: number): AsyncIterable<string> {
  let saved: Buffer[] = [];
  let savedSize: number = 0;

  const save = (slice: Buffer) => {
    saved.push(slice);
    savedSize += slice.length;
    if (savedSize > bufferSize) throw new Error(`Buffer overflow: ${savedSize} > ${bufferSize}`);
  }

  for await (const data of stream) {
    let start = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i] == LF) {
        if (i > start) save(data.slice(start, i));
        let line = Buffer.concat(saved, savedSize).toString();
        if (line.length > 0 && line[line.length - 1] == String.fromCharCode(CR)) line = line.slice(0, line.length - 1);
        yield line;

        saved.length = 0;
        savedSize = 0;
        start = i + 1;
      }
    }

    if (start < data.length) save(data.slice(start));
  }
}
