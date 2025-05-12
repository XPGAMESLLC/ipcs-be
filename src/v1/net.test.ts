import { MAX_CHUNK } from "./encoding/encoding";
import Net from "./net";
import '../index';

describe("Net integration (TextPacketEncoding)", () => {
  test("send and receive small payload (TextPacketEncoding)", (done) => {
    const payload = { hello: "world", num: 42 };
    Net.on("chan1", (data) => {
      expect(data).toEqual(payload);
      done();
    });
    Net.send("chan1", payload, {
      encoding: "text",
    });
  });

  test("send and receive fragmented payload (TextPacketEncoding)", (done) => {
    // create a sequential char string > MAX_CHUNK so missing fragments show gaps
    const size = MAX_CHUNK * 2 + 100;
    let longStr = "";
    for (let i = 0; i < size; i++) {
      longStr += String.fromCharCode(65 + (i % 26)); // cycles A-Z
    }
    const payload = { text: longStr };
    Net.on("chan2", (data) => {
      expect(data).toEqual(payload);
      done();
    });
    Net.send("chan2", payload, {
      encoding: "text",
    });
  });

  test("send request and receive response (TextPacketEncoding)", (done) => {
    const reqPayload = { foo: "bar" };
    // listener on request channel, responds via provided respond callback
    const requestChannel = "chan3:req";
    Net.on(requestChannel, (data, respond) => {
      expect(data).toEqual(reqPayload);
      if (respond) respond({ ok: true });
    });
    // send request on request channel and expect response via callback
    Net.send(requestChannel, reqPayload, {
      encoding: "text",
    }, (response) => {
      expect(response).toEqual({ ok: true });
      done();
    });
  });
});

describe("Net integration (Base64PacketEncoding)", () => {
  test("send and receive small payload", (done) => {
    const payload = { hello: "world", num: 42 };
    Net.on("chan1", (data) => {
      expect(data).toEqual(payload);
      done();
    });
    Net.send("chan1", payload, {
      encoding: "b64",
    });
  });

  test("send and receive fragmented payload", (done) => {
    // create a sequential char string > MAX_CHUNK so missing fragments show gaps
    const size = MAX_CHUNK * 2 + 100;
    let longStr = "";
    for (let i = 0; i < size; i++) {
      longStr += String.fromCharCode(65 + (i % 26)); // cycles A-Z
    }
    const payload = { text: longStr };
    Net.on("chan2", (data) => {
      expect(data).toEqual(payload);
      done();
    });
    Net.send("chan2", payload, {
      encoding: "b64",
    });
  });

  test("send request and receive response", (done) => {
    const reqPayload = { foo: "bar" };
    // listener on request channel, responds via provided respond callback
    const requestChannel = "chan3:req";
    Net.on(requestChannel, (data, respond) => {
      expect(data).toEqual(reqPayload);
      if (respond) respond({ ok: true });
    });
    // send request on request channel and expect response via callback
    Net.send(requestChannel, reqPayload, {
      encoding: "b64",
    }, (response) => {
      expect(response).toEqual({ ok: true });
      done();
    });
  });
});