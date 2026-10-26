import { RS } from "./v1/envelope";

type Ipcs = typeof import("./index");

function load(): { ipcs: Ipcs; sent: { channel: string; message: string }[] } {
  let ipcs!: Ipcs;
  const sent: { channel: string; message: string }[] = [];
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mc = require("@minecraft/server");
    const original = mc.system.sendScriptEvent;
    mc.system.sendScriptEvent = (channel: string, message: string) => {
      sent.push({ channel, message });
      original(channel, message);
    };
    ipcs = require("./index");
  });
  return { ipcs, sent };
}

function encodingOf(message: string): string {
  return message.split(RS)[0].split("|")[1];
}

describe("hello handshake", () => {
  test("hello is sent as text and own hello is not a known pack", () => {
    const { ipcs, sent } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    const hello = sent.find((s) => s.channel === "ipcs:hello")!;
    expect(encodingOf(hello.message)).toBe("text");
    expect(ipcs.getKnownPacks()).toEqual([]);
  });

  test("peer without b64 makes later messages use text", () => {
    const { ipcs, sent } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text"] }, { encoding: "text" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
    ipcs.send("test:chan", { a: 1 });
    expect(encodingOf(sent[sent.length - 1].message)).toBe("text");
  });

  test("peer with b64 keeps b64, also when its hello came as b64 (old version)", () => {
    const { ipcs, sent } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text", "b64"] }, { encoding: "b64" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
    ipcs.send("test:chan", { a: 1 });
    expect(encodingOf(sent[sent.length - 1].message)).toBe("b64");
  });
});
