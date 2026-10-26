import { system } from "@minecraft/server";
import { IEncoder, SPEC_VERSION, MAX_CHUNK } from "./encoding/encoding";
import { buildEnvelope, MetaHeader, EncHeader, RS, ETX, getEnvelopeLength } from "./envelope";
import { makeUUID } from "../utils/uuid";
import { TextPacketEncoder } from "./encoding/TextPacketEncoder";
import { Base64PacketEncoder } from "./encoding/Base64PacketEncoder";

export interface SendOptions {
    encoding?: string;
    /** message UUID: 32 hex digits, hyphens allowed, any case */
    id?: string;
    /** with a callback: stop waiting for the response after this many ticks (default Net.ResponseTimeoutTicks) */
    timeoutTicks?: number;
    /** with a callback: called once when no response came in time */
    onTimeout?: () => void;
}

interface FragmentBuffer {
    parts: string[];
    received: number;
    lastIndex?: number;
    /** Date.now() of the last fragment */
    touched: number;
}

export default class Net {
    private static listeners = new Map<string, ((id: string, payload: any, respond?: (resp: any) => void) => void)[]>();
    private static buffers = new Map<string, FragmentBuffer>();
    private static encoders = new Map<string, IEncoder>();
    private static readonly DefaultEncoding = "text";
    /** a partial message is dropped when no fragment arrived for this long */
    public static BufferTimeoutMs = 10_000;
    /** at most this many partial messages are kept; a new one drops the oldest */
    public static MaxBuffers = 64;
    /** fragment indices at or above this are refused */
    public static MaxFragments = 4096;
    /** how long send() waits for a response by default (20 ticks = 1 s) */
    public static ResponseTimeoutTicks = 200;

    /**
     * Register a new encoder implementation by its unique name.
     */
    public static registerEncoder(encoder: IEncoder) {
        this.encoders.set(encoder.encoding, encoder);
    }

    /** fire a script event, fragmenting JSON/text payload if needed. Optionally receive a response. */
    public static send(channel: string, payload: any, opts?: SendOptions, callback?: (response: any) => void): string {
        // b64 carries the id as bytes, so the receiver sees it lowercase
        const id = (opts?.id ?? makeUUID()).replace(/-/g, "").toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(id)) throw new Error(`Invalid message id "${opts?.id}": expected a UUID`);
        return Net.sendWithId(channel, payload, id, opts, callback);
    }

    /** responses reuse the request id as it came, older versions did not check it */
    private static sendWithId(channel: string, payload: any, id: string, opts?: SendOptions, callback?: (response: any) => void): string {
        const encodingName = opts?.encoding ?? Net.DefaultEncoding;
        const encoder = Net.encoders.get(encodingName);
        if (!encoder) throw new Error(`Unknown encoder: ${encodingName}`);
        const raw = encoder.encode(payload);
        // subscribe one-time response listener if callback provided
        if (callback) {
            const respChannel = `ipcs:${id}`;
            const wrapper = (id: string, respPayload: any) => {
                system.clearRun(timer);
                Net.off(respChannel, wrapper as any);
                callback(respPayload);
            };
            Net.on(respChannel, wrapper as any);
            const timer = system.runTimeout(() => {
                Net.off(respChannel, wrapper as any);
                opts?.onTimeout?.();
            }, opts?.timeoutTicks ?? Net.ResponseTimeoutTicks);
        }
        const totalLen = raw.length;
        // compute overhead and fragment size to not exceed MAX_CHUNK per envelope
        let chunks: string[][] = [];
        // estimate header length without fragmentation
        const meta: MetaHeader = { version: SPEC_VERSION, encoding: encodingName };
        const metaLength = getEnvelopeLength(meta);
        const noFragHdr = encoder.encodeHeader({ id });
        if (totalLen + noFragHdr.length + metaLength <= MAX_CHUNK) {
            // fits without fragmentation
            chunks = [[noFragHdr, raw]];
        } else {
            let i = 0;
            let remaining = totalLen;
            let written = 0;
            while (remaining > 0) {
                // Calculate header length for fragment i
                const hdr = encoder.encodeHeader({ id, frag: i, last: 0 } as any);
                const hdrLen = hdr.length;
                // Fit as much as possible into a single envelope
                const chunkSize = Math.min(MAX_CHUNK - hdrLen - metaLength, remaining);
                chunks.push([hdr, raw.slice(written, written + chunkSize)]);
                remaining -= chunkSize;
                written += chunkSize;
                i++;
            }
        }
        // total fragments count
        // send each fragment envelope
        if (chunks.length === 1) {
            const hdrString = chunks[0][0];
            const envelope = buildEnvelope(meta, hdrString, chunks[0][1]);
            system.sendScriptEvent(channel, envelope);
        } else {
            for (let i = 0; i < chunks.length; i++) {
                const encHdr: EncHeader = { id, frag: i, last: i === chunks.length - 1 };
                const hdrString = encHdr.last ? encoder.encodeHeader(encHdr) : chunks[i][0];
                const envelope = buildEnvelope(meta, hdrString, chunks[i][1]);
                system.sendScriptEvent(channel, envelope);
            }
        }
        return id;
    }

    /** subscribe to reassembled messages on a channel */
    public static on(channel: string, cb: (id: string, payload: any, respond?: (resp: any) => void) => void): void {
        const arr = Net.listeners.get(channel) ?? [];
        arr.push(cb);
        Net.listeners.set(channel, arr);
    }

    /** unsubscribe a callback from a channel */
    public static off(channel: string, cb: (id: string, payload: any, respond?: (resp: any) => void) => void): void {
        const arr = this.listeners.get(channel);
        if (!arr) return;
        const filtered = arr.filter(fn => fn !== cb);
        if (filtered.length) this.listeners.set(channel, filtered);
        else this.listeners.delete(channel);
    }

    /** invoke all cbs registered on this channel, providing optional respond function */
    private static dispatch(channel: string, payload: any, id?: string, encodingName?: string) {
        const arr = Net.listeners.get(channel);
        if (!arr) return;
        for (const cb of arr) {
            try {
                // provide respond function only for request listeners (non-ipcs channels)
                if (id && !channel.startsWith('ipcs:')) {
                    const respond = (responsePayload: any) => {
                        Net.sendWithId(`ipcs:${id}`, responsePayload, id, { encoding: encodingName });
                    };
                    cb(id, payload, respond);
                } else if (id) {
                    cb(id, payload);
                } else {
                    throw new Error(`No ID provided for channel ${channel}`);
                }
            } catch (e) {
                DEBUG: {
                    console.warn(`IPCS-BE: listener on ${channel} threw: ${e}`);
                }
            }
        }
    }

    /** internal dispatcher: parse envelope, reassemble if needed, then fire user-cb */
    public static handleScriptEvent(channel: string, raw: string): void {
        // split meta and rest
        const [metaPart, rest] = raw.split(RS, 2);
        if (!rest) return;
        // split enc header and payload
        const [encPart, body] = rest.split(ETX, 2);
        if (body === undefined) return;
        // parse meta header
        const [verStr, encodingName] = metaPart.split("|");
        if (parseInt(verStr, 10) !== SPEC_VERSION) return;
        const encoder = Net.encoders.get(encodingName);
        if (!encoder) return;
        // parse enc header
        const header = encoder.decodeHeader(encPart);
        if (!header) return;
        const { id, frag, last } = header;
        // single-part
        if (frag === undefined || last === undefined) {
            const payload = encoder.decode(body);
            if (payload !== null) Net.dispatch(channel, payload, id, encodingName);
            return;
        }
        // fragmented: buffer until all arrive (in any order)
        if (!Number.isInteger(frag) || frag < 0 || frag >= Net.MaxFragments) return;
        const now = Date.now();
        Net.dropStale(now);
        // a request and its response share the id, so the channel is part of the key
        const key = `${channel}|${id}`;
        let buf = Net.buffers.get(key);
        if (!buf) {
            if (Net.buffers.size >= Net.MaxBuffers) Net.dropOldest();
            buf = { parts: [], received: 0, touched: now };
            Net.buffers.set(key, buf);
        }
        buf.touched = now;
        if (buf.parts[frag] === undefined) {
            buf.parts[frag] = body;
            buf.received++;
            if (last) buf.lastIndex = frag;
        }
        if (buf.lastIndex !== undefined && buf.received === buf.lastIndex + 1) {
            const full = buf.parts.join("");
            Net.buffers.delete(key);
            const payload = encoder.decode(full);
            if (payload !== null) Net.dispatch(channel, payload, id, encodingName);
        }
    }

    /** drop partial messages that got no fragment for BufferTimeoutMs */
    private static dropStale(now: number) {
        for (const [key, buf] of Net.buffers) {
            if (now - buf.touched > Net.BufferTimeoutMs) Net.buffers.delete(key);
        }
    }

    private static dropOldest() {
        let oldestKey: string | undefined;
        let oldest = Infinity;
        for (const [key, buf] of Net.buffers) {
            if (buf.touched < oldest) {
                oldest = buf.touched;
                oldestKey = key;
            }
        }
        if (oldestKey !== undefined) Net.buffers.delete(oldestKey);
    }

    /** number of partial messages waiting for fragments */
    public static pendingCount(): number {
        return Net.buffers.size;
    }
}

// register built-in encoders
Net.registerEncoder(new TextPacketEncoder());
Net.registerEncoder(new Base64PacketEncoder());