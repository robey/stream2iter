# stream2iter

This is just sample code showing how to convert a nodejs-style readable stream into an `AsyncIterable<Buffer>`. A nice side effect is that the stream's flow control is handled by the rate at which you iterate.

An additional small function will turn that into an `AsyncIterable<string>` of linefeed terminated UTF-8 strings.

I may eventually turn this into a library, or incorporate it into a larger library for handling JSON streams.

Feel free to steal this code. I have attached an Apache 2 license.
