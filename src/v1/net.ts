import { system } from "@minecraft/server";
import { IEncoder, SPEC_VERSION, MAX_CHUNK } from "./encoding/encoding";
import { buildEnvelope, MetaHeader, EncHeader, RS, ETX, getEnvelopeLength } from "./envelope";
import { makeUUID } from "../utils/uuid";
import { TextPacketEncoder } from "./encoding/TextPacketEncoder";
import { Base64PacketEncoder } from "./encoding/Base64PacketEncoder";

interface FragmentBuffer {
    parts: {body: string, frag: number, last: boolean}[];
    lastIndex?: number;
}

export default class Net {
    private static listeners = new Map<string, ((id: string, payload: any, respond?: (resp: any) => void) => void)[]>();
    private static buffers = new Map<string, FragmentBuffer>();
    private static encoders = new Map<string, IEncoder>();
    private static readonly DefaultEncoding = "text";

    /**
     * Register a new encoder implementation by its unique name.
     */
    public static registerEncoder(encoder: IEncoder) {
        this.encoders.set(encoder.encoding, encoder);
    }

    /** fire a script event, fragmenting JSON/text payload if needed. Optionally receive a response. */
    public static send(channel: string, payload: any, opts?: { encoding?: string; id?: string }, callback?: (response: any) => void): string {
        const encodingName = opts?.encoding ?? Net.DefaultEncoding;
        const encoder = Net.encoders.get(encodingName);
        if (!encoder) throw new Error(`Unknown encoder: ${encodingName}`);
        const raw = encoder.encode(payload);
        const id = (opts?.id ?? makeUUID()).replace(/-/g, "");
        // subscribe one-time response listener if callback provided
        if (callback) {
            const respChannel = `ipcs:${id}`;
            const wrapper = (id: string, respPayload: any) => { try { callback(respPayload); } finally { Net.off(respChannel, wrapper as any); } };
            Net.on(respChannel, wrapper as any);
        }
        const totalLen = raw.length;
        // compute overhead and fragment size to not exceed MAX_CHUNK per envelope
        const metaPart = `${SPEC_VERSION}|${encodingName}`;
        let chunks: string[][] = [];
        // estimate header length without fragmentation
        const meta: MetaHeader = { version: SPEC_VERSION, encoding: encodingName };
        const metaLength = getEnvelopeLength(meta);
        const noFragHdr = encoder.encodeHeader({ id });
        const noFragHdrLen = noFragHdr.length;
        const noFragOverhead = metaPart.length + RS.length + ETX.length + noFragHdrLen;
        if (totalLen + noFragOverhead + metaLength <= MAX_CHUNK) {
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
                        Net.send(`ipcs:${id}`, responsePayload, { encoding: encodingName, id });
                    };
                    cb(id, payload, respond);
                } else if (id) {
                    cb(id, payload);
                } else {
                    throw new Error(`No ID provided for channel ${channel}`);
                }
            } catch {
                /* swallow errors */
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
        // fragmented: buffer until all arrive
        let buf = Net.buffers.get(id);
        if (!buf) {
            buf = { parts: [] };
            Net.buffers.set(id, buf);
        }
        if (frag !== undefined && buf.parts[frag] === undefined) {
            buf.parts[frag] = {
                body,
                frag: header.frag!,
                last: header.last!,
            };
            if (header.last!) {
                buf.lastIndex = frag;
            }
        }
        if (buf.lastIndex !== undefined && buf.parts.length === (buf.lastIndex + 1) && buf.parts.sort((a, b) => a.frag - b.frag)[buf.lastIndex].frag === buf.lastIndex) {
            const full = buf.parts.map(p => p.body).join("");
            Net.buffers.delete(id);
            const payload = encoder.decode(full);
            if (payload !== null) Net.dispatch(channel, payload, id, encodingName);
        }
    }
}

// register built-in encoders
Net.registerEncoder(new TextPacketEncoder());
Net.registerEncoder(new Base64PacketEncoder());