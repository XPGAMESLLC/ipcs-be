import * as mc from "@minecraft/server";

type NetClass = typeof import("./net").default;

const signal = mc.system.afterEvents.scriptEventReceive;

function loadNet(): NetClass {
  let net!: NetClass;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    net = require("./net").default;
  });
  return net;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("script event subscription", () => {
  afterEach(() => jest.restoreAllMocks());

  test("a new namespace renews the filter once, the old handler is removed first", () => {
    const Net = loadNet();
    const subscribe = jest.spyOn(signal, "subscribe");
    const unsubscribe = jest.spyOn(signal, "unsubscribe");
    Net.subscribe();
    expect(subscribe).toHaveBeenLastCalledWith(expect.any(Function), { namespaces: ["ipcs"] });
    Net.on("aa:one", () => {});
    Net.on("aa:two", () => {});
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenLastCalledWith(expect.any(Function), { namespaces: ["ipcs", "aa"] });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith(subscribe.mock.calls[0][0]);
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeGreaterThan(subscribe.mock.invocationCallOrder[1]);
  });

  test("namespaces added before the first subscribe are part of it", () => {
    const Net = loadNet();
    const subscribe = jest.spyOn(signal, "subscribe");
    Net.on("early:x", () => {});
    expect(subscribe).not.toHaveBeenCalled();
    Net.subscribe();
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function), { namespaces: ["ipcs", "early"] });
  });

  test("only events of watched namespaces reach the script", () => {
    const Net = loadNet();
    Net.subscribe();
    const handle = jest.spyOn(Net, "handleScriptEvent");
    const got: any[] = [];
    Net.on("bb:x", (_id, data) => got.push(data));
    Net.send("bb:x", { a: 1 }, { encoding: "text" });
    mc.system.sendScriptEvent("cc:x", "anything");
    expect(got).toEqual([{ a: 1 }]);
    expect(handle.mock.calls.map((c) => c[0])).toEqual(["bb:x"]);
  });

  test("in restricted execution the renewal waits for the next tick", async () => {
    const Net = loadNet();
    Net.subscribe();
    const realSubscribe = signal.subscribe.bind(signal);
    jest.spyOn(signal, "subscribe").mockImplementationOnce(() => {
      throw new Error("restricted");
    }).mockImplementation(realSubscribe);
    const got: any[] = [];
    const responses: any[] = [];
    Net.on("ipcs:keep", (_id, data) => responses.push(data));
    Net.on("dd:x", (_id, data) => got.push(data));
    // the old handler still delivers its namespaces in the same tick
    Net.send("ipcs:keep", { r: 1 }, { encoding: "text" });
    expect(responses).toEqual([{ r: 1 }]);
    await tick();
    Net.send("dd:x", { a: 1 }, { encoding: "text" });
    expect(got).toEqual([{ a: 1 }]);
  });

  test("a second failure is reported and not retried again", async () => {
    const Net = loadNet();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const subscribe = jest.spyOn(signal, "subscribe").mockImplementation(() => {
      throw new Error("broken");
    });
    Net.subscribe();
    await tick();
    await tick();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("broken"));
  });
});
