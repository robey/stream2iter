import * as net from "net";

export interface SocketPair {
  client: net.Socket;
  server: net.Socket;
}

// weirdly missing from net!
export function socketpair(): Promise<SocketPair> {
  let client: net.Socket;
  let server: net.Socket;
  let listener = null;

  return new Promise((resolve, reject) => {
    const listener = net.createServer(socket => {
      server = socket;
      listener.close();
      if (server && client) resolve({ client, server });
    });
    listener.on("error", error => {
      listener.close();
      reject(error);
    });
    listener.listen(0, "localhost", () => {
      const socket = net.connect(listener.address().port, "localhost", () => {
        client = socket;
        if (server && client) resolve({ client, server });
      });
    });
  });
}
