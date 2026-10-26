import * as mc from "@minecraft/server";
import { RS } from "./v1/envelope";

type Ipcs = typeof import("./index");

// the mock is shared by every copy of the library loaded below
const sent: { channel: string; message: string }[] = [];
const realSendScriptEvent = mc.system.sendScriptEvent;
const realSubscribeWorldLoad = mc.world.afterEvents.worldLoad.subscribe;
(mc.system as any).sendScriptEvent = (channel: string, message: string) => {
  sent.push({ channel, message });
  realSendScriptEvent(channel, message);
};

/** fresh copy of the library; with holdWorldLoad the world loads only when loadWorld() is called */
function load(holdWorldLoad = false): { ipcs: Ipcs; loadWorld: () => void } {
  let ipcs!: Ipcs;
  const worldLoadListeners: (() => void)[] = [];
  if (holdWorldLoad) {
    (mc.world.afterEvents.worldLoad as any).subscribe = (cb: () => void) => worldLoadListeners.push(cb);
  }
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ipcs = require("./index");
  });
  (mc.world.afterEvents.worldLoad as any).subscribe = realSubscribeWorldLoad;
  sent.length = 0;
  return { ipcs, loadWorld: () => worldLoadListeners.forEach((cb) => cb()) };
}

function encodingOf(message: string): string {
  return message.split(RS)[0].split("|")[1];
}

function hellos() {
  return sent.filter((s) => s.channel === "ipcs:hello");
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("hello handshake", () => {
  test("init before world load sends hello as text on world load", () => {
    const { ipcs, loadWorld } = load(true);
    ipcs.init({ packName: "A", packAuthor: "XP" });
    expect(hellos()).toHaveLength(0);
    loadWorld();
    expect(hellos()).toHaveLength(1);
    expect(encodingOf(hellos()[0].message)).toBe("text");
    expect(ipcs.getKnownPacks()).toEqual([]);
  });

  test("init after world load sends hello on the next tick", async () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    expect(hellos()).toHaveLength(0);
    await tick();
    expect(hellos()).toHaveLength(1);
    expect(encodingOf(hellos()[0].message)).toBe("text");
    expect(ipcs.getKnownPacks()).toEqual([]);
  });

  test("hello that came before init is kept", () => {
    const { ipcs } = load();
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text"] }, { encoding: "text" });
    ipcs.init({ packName: "A", packAuthor: "XP" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
  });

  test("peer without b64 makes later messages use text", () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text"] }, { encoding: "text" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
    ipcs.send("test:chan", { a: 1 });
    expect(encodingOf(sent[sent.length - 1].message)).toBe("text");
  });

  test("peer with b64 keeps b64, also when its hello came as b64 (old version)", () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text", "b64"] }, { encoding: "b64" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
    ipcs.send("test:chan", { a: 1 });
    expect(encodingOf(sent[sent.length - 1].message)).toBe("b64");
  });

  test("a pack that says hello twice is known once", () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    const hello = { v: 1, name: "B", author: "Other", enc: ["text"] };
    ipcs.send("ipcs:hello", hello, { encoding: "text" });
    ipcs.send("ipcs:hello", hello, { encoding: "text" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
  });

  test("changing the returned known packs does not change the library state", () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    ipcs.send("ipcs:hello", { v: 1, name: "B", author: "Other", enc: ["text"] }, { encoding: "text" });
    const packs = ipcs.getKnownPacks();
    packs[0].name = "changed";
    packs.push({ name: "C", author: "X" });
    expect(ipcs.getKnownPacks()).toEqual([{ name: "B", author: "Other" }]);
  });

  test("init twice throws", () => {
    const { ipcs } = load();
    ipcs.init({ packName: "A", packAuthor: "XP" });
    expect(() => ipcs.init({ packName: "A", packAuthor: "XP" })).toThrow("already initialized");
  });
});
