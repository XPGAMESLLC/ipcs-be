# Inter-Pack Communication Standard for Minecraft Bedrock Add-Ons (IPCS-BE)

---

## 1  Scope & Goals

IPCS-BE defines a lightweight, backward-compatible way for Bedrock Add-Ons to exchange data through the built-in **script event** system. It standardises

* **Channel naming** (script-event **ID**) - including a catalogue of shared gameplay channels plus per-request reply channels.
* A **dual-layer header** that works for *all* payload encodings - no JSON overhead.
* **Fragmentation / reassembly** for messages that exceed 2047 UTF-16 code units.
* **Capability discovery** (fire-and-forget handshake).
* **Extensibility** (new encodings, structures, channels).

---

## 2  Terminology

| Term             | Definition                                                                      |
| ---------------- | ------------------------------------------------------------------------------- |
| **Pack**         | A behaviour, resource, or script add-on emitting or listening to script events. |
| **Channel**      | The script-event **ID** (`<namespace>:<id>`). *Acts as the logical "type."*     |
| **Envelope**     | The serialised **header + payload** placed in the script-event *message* field. |
| **Fragment**     | One script event that carries a slice of a larger logical message.              |
| **Encoding `e`** | Algorithm for serialising *payload* (`text`, `b64`, `struct`, ...).             |

---

## 3  Channel Naming Rules

### 3.1  General

* MUST follow Bedrock's permitted character set `()-.?A-Z_a-z`.
* MUST be namespaced: `<namespace>:<id>`.
* `ipcs` namespace is reserved for **control** channels (handshake, per-request replies, errors).
* Packs SHOULD use their **pack UID** (32 hex chars, no hyphens) as namespace to avoid collisions.

### 3.2  Standard Gameplay Channels (`std:*`)

| Channel    | Purpose                              |
| ---------- | ------------------------------------ |
| *(future)* | `std:reg.block`, `std:reg.item`, ... |

---

## 4  Envelope Layout

```
<meta-hdr>␞<enc-hdr>␃<payload>
```

* `␞` = **RS** (Record Separator `\u001e`)
* `␃` = **ETX** (End-of-Text `\u0003`)
* Combined size of *meta-hdr + enc-hdr + payload* per fragment MUST <= **2047** UTF-16 code units.
* All headers are **pipe-delimited lists** for text-orientated encodings, or a packed binary block for compact encodings. **No JSON is used.**

### 4.1  Meta Header (always present)

```
v|e
```

| Field | Type | Description                         |
| ----- | ---- | ----------------------------------- |
| `v`   | int  | IPCS-BE spec version (starts at 1). |
| `e`   | str  | Payload encoding code (see § 5).    |

### 4.2  Encoding-Specific Header (`enc-hdr`)

#### 4.2.1  Header for `text` Encoding (human-readable)

```
id|len|frag|tot
```

| Field  | Req. | Notes                                              |
| ------ | ---- | -------------------------------------------------- |
| `id`   | ✔︎    | Message-UUID (32 hex or hyphenated).               |
| `frag` | -    | 0-based fragment index. Omit if not fragmented.    |
| `last` | -    | Is this the last fragment? Omit if not fragmented. |

The *payload* itself is a plain JS object serialised to UTF-16 (e.g. via `JSON.stringify`). Receivers rely on the **channel ID** to understand its schema.

#### 4.2.2  Binary Header for `b64` & `struct` Encodings

Packed little-endian block, **Base-64 encoded** for safe transport.

| Offset | Size  | Field              | Description                                  |
| ------ | ----- | ------------------ | -------------------------------------------- |
| 4      | 16    | `id` (u16)         | Message UUID.                                |
| 20     | 1     | `flags` (u8)       | **0x01** fragmented, **0x02** extra present. |
| 21     | *var* | conditional fields | Present if `flags & 0x01` or `flags & 0x02`. |

Conditional sequence:

1. `frag` (u16) - fragment index   `flags & 0x01`
2. `last`  (u8) - is this the last fragment? `flags & 0x01`
3. **extra** - layout depends on encoding `flags & 0x02`

Extra field layout:

| Encoding | Extra bytes                                               |
| -------- | --------------------------------------------------------- |
| `b64`    | - *(none)* - payload is a binary JSON (see § 4.2.2).      |
| `struct` | `structCode` (u16) + `ver` (u8) - structure ID & version. |

After the binary header comes the ETX (`␃`) delimiter, followed by the *payload*.

> **Extending Headers** - New encodings MUST document their binary layout. Unknown flag bits MUST be ignored by older receivers.

---

## 5  Supported Payload Encodings (`e`)

| Code     | Payload Form                 | Enc-Hdr Schema | Notes                                    |
| -------- | ---------------------------- | -------------- | ---------------------------------------- |
| `text`   | UTF-16 stringified JS object | § 4.2.1        | Default / human-readable.                |
| `b64`    | Base-64 of binary blob.      | § 4.2.2        | For binary-compact object serialisation. |
| `struct` | Positional list by contract. | § 4.2.2        | Most compact; needs handshake agreement. |

### 5.1  Structure Registry (`struct` encoding)

A **structure** is a named, versioned schema agreed in advance (e.g. `oreDef/v1`, `vec3/v1`). Packs advertise supported structures in their handshake (§ 6).

---

## 6  Fragmentation & Reassembly

1. If payload length > **2047** UTF-16 code units, split **after serialising**.
2. For each fragment set `frag` (index) and `last` (is it last?) in its header.
3. All fragments share the same `id`.
4. Fragments MAY arrive out-of-order; receivers MUST reorder by `frag`.

---

## 7  Handshake (`ipcs:hello`)

On world load **every pack simply broadcasts** a single fire-and-forget `ipcs:hello` on its first script tick:

```jsonc
{
  "v":1,
  "name":"<packName>",
  "author": "<packAuthor>",
  // What encodings are supported
  "enc":["text","b64","struct"],
  // Optional data per encoding
  "encOpts": {
    "struct": {
      "supported": ["oreDef/v1"]
    }
  }
}
```

> There is **no acknowledgement step**. Peers cache the capabilities they hear; late-joiners broadcast their own `hello` as they come online.

---

## 8  Request / Response Pattern

* **Request channel**: `<ns>:req`; include unique message `id` in header.
* **Response channel**: `ipcs:<id>` - where `<id>` is the request's UUID. Using a dedicated reply channel prevents fragment collisions between unrelated packs.

Example flow:

1. Pack A -> `<myPack>:req` (id =`ab12...`)
2. Pack B -> `ipcs:ab12...` (frag 0), `ipcs:ab12...` (frag 1), ...

---

## 9  Versioning & Compatibility

* Major spec-version bump (`v`) = breaking change.
* Receivers seeing higher unknown `v` MAY ignore message or fall back to subset.

---

## 10  Simple Binary JSON (SBJ)

**Purpose** - SBJ is the canonical binary format used inside the `b64` encoding. It converts any JavaScript value (typically a `Record<string, any>`) into a compact byte stream that is then Base-64 encoded for transport. The design borrows from Minecraft’s NBT but allows mixed-type arrays and stores all numbers as doubles.

### A.1  Tag IDs

| Tag ID | Name    | Payload (after the tag byte)                              |
| ------ | ------- | --------------------------------------------------------- |
| `0`    | Null    | -                                                         |
| `1`    | Boolean | 1 byte (`0` = false, `1` = true)                          |
| `2`    | Number  | 8-byte IEEE-754 double (little-endian)                    |
| `3`    | String  | `u16` length + UTF-8 bytes                                |
| `4`    | Array   | sequence of `<tag><value>` pairs until an **End** tag     |
| `5`    | Object  | `String(key)` + `<tag><value>` pairs until an **End** tag |
| `6`    | End     | terminates an Array or Object                             |

### A.2  Encoding Rules

1. **Root value** - Encode with its tag, exactly like nested values.
2. **Arrays**    - Start with `Array` tag; emit each element; finish with `End`.
3. **Objects**   - Start with `Object` tag; for each property write key as a tagged `String`, then value; finish with `End`.
4. **Strings**   - `String` tag followed by `u16` length and UTF-8 bytes.
5. **Numbers**   - Always 64-bit floats.
6. **Cycles**    - If the encoder encounters a previously-seen reference it MUST throw.

**Usage in `b64`** - When `e = b64`, the *payload* MUST be a Base-64 string produced by SBJ. Receivers deserialize it to recover the original object.

---
