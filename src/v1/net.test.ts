import { MAX_CHUNK } from "./encoding/encoding";
import { RS, ETX } from "./envelope";
import Net from "./net";
import '../index';

jest.setTimeout(100);

describe("Net integration (TextPacketEncoding)", () => {
  test("send and receive small payload (TextPacketEncoding)", (done) => {
    const payload = { hello: "world", num: 42 };
    Net.on("chan1", (id, data) => {
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
    Net.on("chan2", (id, data) => {
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
    Net.on(requestChannel, (id, data, respond) => {
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
    Net.on("chan1", (id, data) => {
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
    Net.on("chan2", (id, data) => {
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
    Net.on(requestChannel, (id, data, respond) => {
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
describe("Net listener errors", () => {
  test("a throwing listener is reported and does not stop the others", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const got: any[] = [];
    Net.on("chan:err", () => {
      throw new Error("boom");
    });
    Net.on("chan:err", (id, data) => got.push(data));
    Net.send("chan:err", { a: 1 }, { encoding: "text" });
    expect(got).toEqual([{ a: 1 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
    warn.mockRestore();
  });
});

describe("Net message id", () => {
  test.each([
    ["text", "not-a-uuid"],
    ["text", "a|b"],
    ["b64", "z".repeat(32)],
    ["b64", "abc"],
  ])("%s rejects id %s before sending", (encoding, id) => {
    const got: any[] = [];
    Net.on("id:bad", (_id, data) => got.push(data));
    expect(() => Net.send("id:bad", { a: 1 }, { encoding, id }, () => {})).toThrow("Invalid message id");
    expect(got).toEqual([]);
  });

  test("uppercase hyphenated id gets a b64 response", (done) => {
    Net.on("id:upper", (_id, _data, respond) => respond?.({ ok: true }));
    const id = Net.send("id:upper", { a: 1 }, { encoding: "b64", id: "ABCDEF00-0000-4000-8000-000000000001" }, (resp) => {
      expect(resp).toEqual({ ok: true });
      done();
    });
    expect(id).toBe("abcdef00000040008000000000000001");
  });

  test("a request with a non-UUID text id from an older version still gets a response", () => {
    const got: any[] = [];
    Net.on("ipcs:OldStyle1", (_id, data) => got.push(data));
    Net.on("id:old", (_id, _data, respond) => respond?.({ ok: true }));
    Net.handleScriptEvent("id:old", `1|text${RS}OldStyle1${ETX}{"a":1}`);
    expect(got).toEqual([{ ok: true }]);
  });
});
