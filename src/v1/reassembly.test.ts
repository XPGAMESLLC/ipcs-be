import Net from "./net";
import { RS, ETX } from "./envelope";
import { send, off, on, setVersion } from "../index";

const env = (id: string, frag: number, last: boolean, body: string) =>
  `1|text${RS}${id}|${frag}|${last ? 1 : 0}${ETX}${body}`;

function fragments(id: string, payload: any, n: number): string[] {
  const raw = JSON.stringify(payload);
  const size = Math.ceil(raw.length / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(env(id, i, i === n - 1, raw.slice(i * size, (i + 1) * size)));
  return out;
}

describe("reassembly", () => {
  afterEach(() => {
    Net.BufferTimeoutMs = 10_000;
    Net.MaxBuffers = 64;
  });

  test("fragments in reverse and shuffled order", () => {
    const payload = { text: "abcdefghijklmnopqrstuvwxyz".repeat(10) };
    const got: any[] = [];
    Net.on("r:order", (_id, data) => got.push(data));
    const parts = fragments("aa01", payload, 5);
    for (const p of [...parts].reverse()) Net.handleScriptEvent("r:order", p);
    const shuffled = [parts[2], parts[4], parts[0], parts[3], parts[1]];
    for (const p of shuffled) Net.handleScriptEvent("r:order", p.replace("aa01", "aa02"));
    expect(got).toEqual([payload, payload]);
    expect(Net.pendingCount()).toBe(0);
  });

  test("duplicate fragments are ignored", () => {
    const payload = { n: 12345, s: "x".repeat(50) };
    const got: any[] = [];
    Net.on("r:dup", (_id, data) => got.push(data));
    const parts = fragments("bb01", payload, 3);
    for (const p of [parts[0], parts[0], parts[1], parts[1], parts[2]]) Net.handleScriptEvent("r:dup", p);
    expect(got).toEqual([payload]);
  });

  test("a partial message expires", () => {
    const got: any[] = [];
    Net.on("r:stale", (_id, data) => got.push(data));
    const parts = fragments("cc01", { s: "y".repeat(40) }, 3);
    Net.handleScriptEvent("r:stale", parts[0]);
    expect(Net.pendingCount()).toBe(1);
    Net.BufferTimeoutMs = -1;
    Net.handleScriptEvent("r:stale", parts[1]); // purges cc01, then starts it again with only this part
    Net.BufferTimeoutMs = 10_000;
    Net.handleScriptEvent("r:stale", parts[2]);
    expect(got).toEqual([]);
    Net.BufferTimeoutMs = -1;
    Net.handleScriptEvent("r:stale", env("cc02", 0, false, "{"));
    expect(Net.pendingCount()).toBe(1);
  });

  test("the number of partial messages is capped", () => {
    Net.BufferTimeoutMs = 10_000;
    Net.MaxBuffers = 4;
    for (let i = 0; i < 10; i++) Net.handleScriptEvent("r:cap", env(`dd${i}`, 0, false, "{"));
    expect(Net.pendingCount()).toBe(4);
  });

  test("bad fragment indices are refused", () => {
    const before = Net.pendingCount();
    Net.handleScriptEvent("r:bad", env("ee01", -1, false, "{"));
    Net.handleScriptEvent("r:bad", env("ee02", Net.MaxFragments, false, "{"));
    expect(Net.pendingCount()).toBe(before);
  });
});

describe("api", () => {
  test("off removes a listener", () => {
    const got: any[] = [];
    const cb = (_id: string, data: any) => got.push(data);
    on("a:off", cb);
    send("a:off", { a: 1 }, { encoding: "text" });
    off("a:off", cb);
    send("a:off", { a: 2 }, { encoding: "text" });
    expect(got).toEqual([{ a: 1 }]);
  });

  test("encoding: undefined keeps the preferred encoding", () => {
    const got: any[] = [];
    on("a:enc", (_id, data) => got.push(data));
    expect(() => send("a:enc", { a: 1 }, { encoding: undefined })).not.toThrow();
    expect(got).toEqual([{ a: 1 }]);
  });

  test("no response: onTimeout fires and the late answer is ignored", (done) => {
    let answers = 0;
    const id = send("a:silent", { q: 1 }, { encoding: "text", timeoutTicks: 5, onTimeout: () => {
      Net.handleScriptEvent(`ipcs:${id}`, `1|text${RS}${id}${ETX}{"late":true}`);
      setTimeout(() => {
        expect(answers).toBe(0);
        done();
      }, 10);
    } }, () => answers++);
  });

  test("a response cancels the timeout", (done) => {
    let timeouts = 0;
    on("a:echo", (_id, data, respond) => respond?.(data));
    send("a:echo", { q: 2 }, { encoding: "text", timeoutTicks: 5, onTimeout: () => timeouts++ }, (resp) => {
      expect(resp).toEqual({ q: 2 });
      setTimeout(() => {
        expect(timeouts).toBe(0);
        done();
      }, 20);
    });
  });

  test("same id on two channels reassembles separately", () => {
    const req = { req: "r".repeat(40) };
    const resp = { resp: "s".repeat(40) };
    const gotReq: any[] = [];
    const gotResp: any[] = [];
    const pending = Net.pendingCount();
    Net.on("k:req", (_id, data) => gotReq.push(data));
    Net.on("ipcs:cc01", (_id, data) => gotResp.push(data));
    const a = fragments("cc01", req, 2);
    const b = fragments("cc01", resp, 2);
    Net.handleScriptEvent("k:req", a[0]);
    Net.handleScriptEvent("ipcs:cc01", b[0]);
    Net.handleScriptEvent("k:req", a[1]);
    Net.handleScriptEvent("ipcs:cc01", b[1]);
    expect(gotReq).toEqual([req]);
    expect(gotResp).toEqual([resp]);
    expect(Net.pendingCount()).toBe(pending);
  });

  test("setVersion checks the new version", () => {
    expect(() => setVersion(2)).toThrow("version 2");
    expect(() => setVersion(0)).toThrow("version 0");
    expect(() => setVersion(1)).not.toThrow();
  });
});
