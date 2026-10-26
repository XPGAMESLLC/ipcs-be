import { system, world } from "@minecraft/server";
import NetV1, { SendOptions } from "./v1/net";

export type { SendOptions };

let version = 1;
const MaxVersion = 1;
const MinVersion = 1;

export function setVersion(v: number) {
  if (v < MinVersion || v > MaxVersion) {
    throw new Error(`IPCS-BE spec version ${v} is not supported`);
  }
  version = v;
}

/**
 * Send a script event, fragmenting JSON/text payload if needed. Optionally receive a response.
 * @param channel - The script-event channel to send to.
 * @param payload - The payload to send.
 * @param opts - Optional encoding, message ID, and response timeout (`timeoutTicks`, `onTimeout`).
 * @param callback - Optional callback to receive a response. It is dropped after the timeout.
 */
export function send(
  channel: string,
  payload: any,
  opts?: SendOptions,
  callback?: (response: any) => void
): string {
  if (version === 1) {
    return NetV1.send(channel, payload, {
      ...opts,
      // By default, use the most preferred encoding
      encoding: opts?.encoding ?? supportedEncodings[0],
    }, callback);
  }
  throw new Error(`IPCS-BE spec version ${version} is not supported`);
}

/**
 * Subscribe to reassembled messages on a channel.
 * @param channel - The script-event channel to subscribe to.
 * @param cb - The callback to invoke when a message is received.
 */
export function on(
  channel: string,
  cb: (id: string, payload: any, respond?: (resp: any) => void) => void
): void {
  NetV1.on(channel, cb);
}

/**
 * Unsubscribe a callback registered with `on`.
 * @param channel - The script-event channel.
 * @param cb - The same callback that was passed to `on`.
 */
export function off(
  channel: string,
  cb: (id: string, payload: any, respond?: (resp: any) => void) => void
): void {
  NetV1.off(channel, cb);
}

// Register the IPCS-BE script event handler
system.beforeEvents.startup.subscribe(() => {
  system.afterEvents.scriptEventReceive.subscribe((evt) => {
    NetV1.handleScriptEvent(evt.id, evt.message);
  });
});

let initialized = false;

export interface InitData {
  /**
   * The pack name.
   */
  packName: string;
  /**
   * The pack author.
   */
  packAuthor: string;
}

interface HelloPacket {
  v: number;
  name: string;
  author: string;
  enc: string[];
  encOpts?: Record<string, Record<string, any>>;
}

export interface KnownPack {
  name: string;
  author: string;
}

const KnownPacks: KnownPack[] = [];

// Encodings supported by all packs ordered from most to least preferred
let supportedEncodings: string[] = ["b64", "text"];

// Channel for the hello packet
const HelloChannel = "ipcs:hello";

export function init(initData: InitData) {
  if (initialized) {
    throw new Error("IPCS-BE is already initialized");
  }
  // Send a hello packet when the world loads
  let helloId = "";
  world.afterEvents.worldLoad.subscribe(() => {
    const packet: HelloPacket = {
      name: initData.packName,
      author: initData.packAuthor,
      // Adjusted according to the library
      v: version,
      enc: ["text", "b64"],
    };
    helloId = send(HelloChannel, packet);
  });
  on(HelloChannel, (id, payload) => {
    // Handle the hello packet
    if (id === helloId) {
      // Ignore self-sent hello packets
      return;
    }
    const helloPayload = payload as HelloPacket;
    if (helloPayload.v > MaxVersion || helloPayload.v < MinVersion) {
      warn(`Received hello packet with unsupported version ${helloPayload.v}`);
      return;
    }
    if (!helloPayload.name || !helloPayload.author) {
      warn("Received hello packet with missing name or author");
      return;
    }
    if (
      !helloPayload.enc ||
      !Array.isArray(helloPayload.enc) ||
      helloPayload.enc.length === 0
    ) {
      warn("Received hello packet with missing or invalid encodings");
      return;
    }
    // Filter out unsupported encodings
    for (const enc of [...supportedEncodings]) {
      // add exception for text encoding, as it is bare minimum
      if (enc === "text") continue;
      if (!helloPayload.enc.includes(enc)) {
        supportedEncodings = supportedEncodings.filter((e) => e !== enc);
      }
    }
    KnownPacks.push({ name: helloPayload.name, author: helloPayload.author });
  });
  initialized = true;
}

/**
 * Get the currently known packs.
 */
export function getKnownPacks(): KnownPack[] {
  if (!initialized) {
    throw new Error("IPCS-BE is not initialized");
  }
  return KnownPacks;
}

function warn(message: string) {
  DEBUG: {
    console.warn(message);
  }
}
