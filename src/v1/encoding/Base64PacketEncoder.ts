import Base64, { Base64InputStream, Base64OutputStream } from "../../utils/base64";
import { bytesToUuid, uuidToBytes } from "../../utils/uuid";
import { EncHeader } from "../envelope";
import { IEncoder } from "./encoding";


export class Base64PacketEncoder implements IEncoder {
  // encoding name for Base64 transport
  encoding = "b64";

  encode(payload: Record<string, any>): string {
    // JSON stringify and then Base64 encode
    const json = JSON.stringify(payload);
    return Base64.encode(json);
  }

  encodeHeader(header: EncHeader): string {
    const { id, frag, last } = header;
    // build binary header
    const out = new Base64OutputStream();
    // write 16-byte UUID (hex without hyphens)
    out.writeBytes(uuidToBytes(id));
    // flags: bit0 = fragmented, bit1 = extra (none for b64)
    let flags = 0;
    if (last !== undefined) flags |= 0x01;
    out.writeByte(flags);
    // optionally write fragment indices
    if (flags & 0x01) {
      out.writeShort(frag!);
      out.writeByte(last ? 1 : 0);
    }
    return out.toString();
  }

  decode(raw: string): Record<string, any> | null {
    try {
      const json = Base64.decode(raw);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  decodeHeader(raw: string): EncHeader | null {
    try {
      const inp = new Base64InputStream(raw);
      // read 16-byte UUID
      const bytes = inp.readBytes(16);
      const id = bytesToUuid(bytes);
      const flags = inp.readByte();
      const header: EncHeader = { id };
      if (flags & 0x01) {
        header.frag = inp.readShort();
        header.last = inp.readByte() === 1;
      }
      return header;
    } catch {
      return null;
    }
  }
}