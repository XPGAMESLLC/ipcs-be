import { system } from "@minecraft/server";
import NetV1 from "./v1/net";

let version = 1;
const MaxVersion = 1;
const MinVersion = 1;

export function setVersion(v: number) {
  if (version < MinVersion || version > MaxVersion) {
    throw new Error(`IPCS-BE spec version ${version} is not supported`);
  }
  version = v;
}

/**
 * Send a script event, fragmenting JSON/text payload if needed. Optionally receive a response.
 * @param channel - The script-event channel to send to.
 * @param payload - The payload to send.
 * @param opts - Optional encoding and message ID.
 * @param callback - Optional callback to receive a response.
 */
export function send(
  channel: string,
  payload: any,
  opts?: { encoding?: string; id?: string },
  callback?: (response: any) => void
): void {
  if (version === 1) {
    NetV1.send(channel, payload, opts, callback);
  }
}

/**
 * Subscribe to reassembled messages on a channel.
 * @param channel - The script-event channel to subscribe to.
 * @param cb - The callback to invoke when a message is received.
 */
export function on(
  channel: string,
  cb: (payload: any, respond?: (resp: any) => void) => void
): void {
  NetV1.on(channel, cb);
}

system.afterEvents.scriptEventReceive.subscribe((evt) => {
  NetV1.handleScriptEvent(evt.id, evt.message);
});
