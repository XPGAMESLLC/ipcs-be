import {
  RawMessage,
  ScriptEventCommandMessageAfterEvent,
  ScriptEventSource,
  StartupEvent,
  WorldLoadAfterEvent,
} from "@minecraft/server";

jest.mock(
  "@minecraft/server",
  () => {
    const scriptEventListeners: ((
      e: ScriptEventCommandMessageAfterEvent
    ) => void)[] = [];
    return {
      ScriptEventSource: {
        Block: "Block",
        Entity: "Entity",
        NPCDialogue: "NPCDialogue",
        Server: "Server",
      },
      Direction: {
        Down: "Down",
        East: "East",
        North: "North",
        South: "South",
        Up: "Up",
        West: "West",
      },
      system: {
        afterEvents: {
          scriptEventReceive: {
            subscribe: (
              cb: (e: ScriptEventCommandMessageAfterEvent) => void
            ) => {
              scriptEventListeners.push(cb);
            },
          },
        },
        beforeEvents: {
          startup: {
            subscribe: (
              cb: (e: StartupEvent) => void
            ) => {
              cb({
                blockComponentRegistry: {} as any,
                customCommandRegistry: {} as any,
                dimensionRegistry: {} as any,
                itemComponentRegistry: {} as any,
              });
            },
          },
        },
        sendScriptEvent: (channel: string, message: string) => {
          if (message.length > 2048) {
            throw new Error("Script event message payload exceeds size of 2048");
          }
          for (const cb of scriptEventListeners) {
            cb({
              id: channel,
              message: message,
              sourceType: ScriptEventSource.Server,
            });
          }
        },
        clearRun: (id: number) => {
          clearInterval(id);
          clearTimeout(id);
        },
        run: (callback: () => void) => {
          return setTimeout(callback, 50);
        },
        runInterval: (callback: () => void, tickInterval?: number): number => {
          return setInterval(callback, tickInterval || 1)[Symbol.toPrimitive]();
        },
        runTimeout: (callback: () => void, tickDelay?: number): number => {
          return setTimeout(callback, tickDelay || 1)[Symbol.toPrimitive]();
        },
      },
      world: {
        sendMessage: (
          message: (RawMessage | string)[] | RawMessage | string
        ): void => {
          console.log(message);
        },
        afterEvents: {
          worldLoad: {
            subscribe: (
              cb: (e: WorldLoadAfterEvent) => void
            ) => {
              cb({});
            },
          },
        },
      },
    };
  },
  { virtual: true }
);
