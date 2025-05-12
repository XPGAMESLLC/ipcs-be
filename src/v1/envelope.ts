/** Meta header fields */
export interface MetaHeader {
    version: number;
    encoding: string;
}

/** Encoding-specific header fields */
export interface EncHeader {
    id: string;
    frag?: number;
    last?: boolean;
}

/**
 * Record Separator and End-of-Text constants
 */
export const RS = "\u001e";
export const ETX = "\u0003";

/**
 * Build an IPCS-BE envelope string: <meta>RS<enc>ETX<payload>
 */
export function buildEnvelope(meta: MetaHeader, enc: string, chunk: string): string {
    const metaPart = `${meta.version}|${meta.encoding}`;
    return `${metaPart}${RS}${enc}${ETX}${chunk}`;
}

export function getEnvelopeLength(meta: MetaHeader): number {
    const metaPart = `${meta.version}|${meta.encoding}`;
    return `${metaPart}${RS}${ETX}`.length;
}