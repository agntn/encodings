import { isBytes, requireBytes } from "./bytes.ts";
import { DecodeError, EncodingError } from "./errors.ts";

/** What `rlp.encode` takes: bytes, a non-negative integer, or a list of those, nested freely. */
export type RlpInput = Uint8Array | bigint | readonly RlpInput[];

/** What `rlp.decode` gives back: bytes, or a list of items. Integers come back as their bytes. */
export type RlpItem = Uint8Array | RlpItem[];

/** A list being measured: how far its children have been read and how long they are so far. */
interface Measuring {
  readonly list: readonly RlpInput[];
  next: number;
  payload: number;
}

/** A list being written: how far its children have been written. */
interface Writing {
  readonly list: readonly RlpInput[];
  next: number;
}

/** A list being decoded: its items so far and where its payload ends. */
interface Reading {
  readonly items: RlpItem[];
  readonly end: number;
}

/** One header read from the input: what the item is and where its payload sits. */
interface Header {
  readonly list: boolean;
  readonly start: number;
  readonly end: number;
}

/**
 * Tells a list apart from a leaf.
 *
 * @param item - Any item of the input.
 * @returns {boolean} Whether it is a list.
 */
function isList(item: RlpInput): item is readonly RlpInput[] {
  return Array.isArray(item);
}

/**
 * Turns a leaf into its bytes, an integer big-endian with no leading zero.
 *
 * @param item - Bytes or an integer, or whatever a caller without types passed.
 * @returns {Uint8Array} The bytes of the leaf.
 */
function leafBytes(item: unknown): Uint8Array {
  if (isBytes(item)) return item;
  if (typeof item !== "bigint") {
    throw new EncodingError(`rlp: cannot encode a ${typeof item}, only bytes, bigints and lists`);
  }
  if (item < 0n) throw new EncodingError(`rlp: ${item} is negative, and RLP holds no sign`);
  if (item === 0n) return new Uint8Array();
  const hex = item.toString(16);
  const digits = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(digits.length / 2);
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Counts the bytes a length takes in the long form of a header.
 *
 * @param length - A payload length of 56 or more.
 * @returns {number} How many big-endian bytes it needs.
 */
function lengthBytes(length: number): number {
  let count = 0;
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) count++;
  return count;
}

/**
 * Counts a header and its payload together.
 *
 * @param payload - Payload length.
 * @returns {number} The payload plus the header in front of it.
 */
function headed(payload: number): number {
  return payload + (payload < 56 ? 1 : 1 + lengthBytes(payload));
}

/**
 * Counts the encoded length of a leaf.
 *
 * @param bytes - The leaf's bytes.
 * @returns {number} One byte for a lone byte under 0x80, the headed length otherwise.
 */
function leafLength(bytes: Uint8Array): number {
  return bytes.length === 1 && bytes[0]! < 0x80 ? 1 : headed(bytes.length);
}

/**
 * Adds to a payload length, refusing one past what a number counts exactly.
 *
 * @param payload - The length so far.
 * @param more - Bytes to add.
 * @returns {number} The new length.
 * @throws {EncodingError} Past `Number.MAX_SAFE_INTEGER`, where a list shared over and over lands.
 */
function grown(payload: number, more: number): number {
  const total = payload + more;
  if (total > Number.MAX_SAFE_INTEGER) {
    throw new EncodingError(
      `rlp: the encoding takes over ${Number.MAX_SAFE_INTEGER} bytes, more than fits in memory`,
    );
  }
  return total;
}

/**
 * Measures each list's payload on a stack of its own, so deep nesting costs memory, not stack.
 *
 * @param root - A list.
 * @returns {Map<readonly RlpInput[], number>} Payload length of each list, the root included.
 */
function measure(root: readonly RlpInput[]): Map<readonly RlpInput[], number> {
  const sizes = new Map<readonly RlpInput[], number>();
  const open = new Set<readonly RlpInput[]>([root]);
  const stack: Measuring[] = [{ list: root, next: 0, payload: 0 }];
  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.next === frame.list.length) {
      stack.pop();
      open.delete(frame.list);
      sizes.set(frame.list, frame.payload);
      const parent = stack.at(-1);
      if (parent) parent.payload = grown(parent.payload, headed(frame.payload));
      continue;
    }
    const child = frame.list[frame.next++]!;
    if (!isList(child)) {
      frame.payload = grown(frame.payload, leafLength(leafBytes(child)));
    } else if (open.has(child)) {
      throw new EncodingError("rlp: a list contains itself, and RLP has no end for that");
    } else if (sizes.has(child)) {
      frame.payload = grown(frame.payload, headed(sizes.get(child)!));
    } else {
      open.add(child);
      stack.push({ list: child, next: 0, payload: 0 });
    }
  }
  return sizes;
}

/** Writes RLP into one buffer sized up front, with the list sizes `measure` found. */
class Writer {
  readonly out: Uint8Array;
  private offset = 0;
  private readonly sizes: Map<readonly RlpInput[], number>;

  constructor(length: number, sizes = new Map<readonly RlpInput[], number>()) {
    this.out = Writer.allocate(length);
    this.sizes = sizes;
  }

  /**
   * Allocates the output, which a list shared many times over can make larger than memory.
   *
   * @param length - Bytes the encoding takes.
   * @returns {Uint8Array} A buffer of that size.
   * @throws {EncodingError} When the runtime can't allocate it.
   */
  private static allocate(length: number): Uint8Array {
    try {
      return new Uint8Array(length);
    } catch {
      throw new EncodingError(`rlp: the encoding takes ${length} bytes, more than fits in memory`);
    }
  }

  /**
   * Writes a header: one byte for a short payload, the length's own bytes after it for a long one.
   *
   * @param base - 0x80 for bytes, 0xc0 for a list.
   * @param payload - Payload length.
   */
  header(base: number, payload: number): void {
    if (payload < 56) {
      this.out[this.offset++] = base + payload;
      return;
    }
    const count = lengthBytes(payload);
    this.out[this.offset++] = base + 55 + count;
    let rest = payload;
    for (let index = count - 1; index >= 0; index--) {
      this.out[this.offset + index] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    this.offset += count;
  }

  /**
   * Writes a leaf, a lone byte under 0x80 as itself.
   *
   * @param bytes - The leaf's bytes.
   */
  leaf(bytes: Uint8Array): void {
    if (bytes.length !== 1 || bytes[0]! >= 0x80) this.header(0x80, bytes.length);
    this.out.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Writes a measured list, depth first, without recursion.
   *
   * @param root - The list.
   */
  list(root: readonly RlpInput[]): void {
    this.header(0xc0, this.sizes.get(root)!);
    const stack: Writing[] = [{ list: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      if (frame.next === frame.list.length) {
        stack.pop();
        continue;
      }
      const child = frame.list[frame.next++]!;
      if (isList(child)) {
        this.header(0xc0, this.sizes.get(child)!);
        stack.push({ list: child, next: 0 });
      } else {
        this.leaf(leafBytes(child));
      }
    }
  }
}

/**
 * Reads a length in the long form as a `bigint`, so a message about eight bytes stays exact.
 *
 * @param bytes - The input.
 * @param at - Index of the prefix byte.
 * @param limit - Where the enclosing payload ends.
 * @returns {bigint} The payload length.
 */
function longLength(bytes: Uint8Array, at: number, limit: number): bigint {
  const count = (bytes[at]! & 0x3f) - 55;
  if (at + count >= limit) {
    throw new DecodeError("rlp", `header at index ${at} needs ${count} length bytes`, at);
  }
  if (bytes[at + 1] === 0) {
    throw new DecodeError("rlp", `length at index ${at + 1} starts with a zero byte`, at + 1);
  }
  let length = 0n;
  for (let index = 1; index <= count; index++) length = (length << 8n) | BigInt(bytes[at + index]!);
  if (length < 56n) {
    throw new DecodeError("rlp", `length ${length} at index ${at} belongs in the short form`, at);
  }
  return length;
}

/**
 * Reads the header at `at`, whose payload has to end by `limit`.
 *
 * @param bytes - The input.
 * @param at - Index of the prefix byte.
 * @param limit - Where the enclosing payload ends.
 * @returns {Header} What the item is and where its payload sits.
 */
function readHeader(bytes: Uint8Array, at: number, limit: number): Header {
  const prefix = bytes[at]!;
  if (prefix < 0x80) return { list: false, start: at, end: at + 1 };
  const list = prefix >= 0xc0;
  const short = prefix - (list ? 0xc0 : 0x80);
  const length = short < 56 ? BigInt(short) : longLength(bytes, at, limit);
  const start = at + 1 + (short < 56 ? 0 : short - 55);
  const over = BigInt(start) + length - BigInt(limit);
  if (over > 0n) {
    throw new DecodeError("rlp", `length ${length} at index ${at} runs ${over} past the end`, at);
  }
  const end = start + Number(length);
  if (!list && end === start + 1 && bytes[start]! < 0x80) {
    throw new DecodeError("rlp", `header at index ${at} wraps a single byte under 0x80`, at);
  }
  return { list, start, end };
}

/** Recursive Length Prefix (Yellow Paper, appendix B), decoded as canonically as geth does. */
export const rlp = {
  /**
   * Writes an item as RLP.
   *
   * @param input - Bytes, a non-negative `bigint` (`0n` is no bytes) or a list, nested freely.
   * @returns {Uint8Array} The encoding.
   * @throws {EncodingError} For a negative integer, a value that is no item, or a list in itself.
   */
  encode(input: RlpInput): Uint8Array {
    if (!isList(input)) {
      const bytes = leafBytes(input);
      const writer = new Writer(leafLength(bytes));
      writer.leaf(bytes);
      return writer.out;
    }
    const sizes = measure(input);
    const writer = new Writer(headed(sizes.get(input)!), sizes);
    writer.list(input);
    return writer.out;
  },

  /**
   * Reads one item, written the one canonical way, with nothing after it.
   *
   * @param bytes - The encoding.
   * @returns {RlpItem} The item, its bytes copied out of the input.
   * @throws {DecodeError} At the byte `index` that breaks the canonical form, or on empty input.
   */
  decode(bytes: Uint8Array): RlpItem {
    requireBytes("rlp: decode", bytes);
    if (bytes.length === 0) throw new DecodeError("rlp", "no item in an empty input");
    const root: RlpItem[] = [];
    const stack: Reading[] = [{ items: root, end: bytes.length }];
    let offset = 0;
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      if (offset === frame.end) {
        stack.pop();
        continue;
      }
      if (stack.length === 1 && root.length === 1) {
        throw new DecodeError("rlp", `extra bytes from index ${offset} after the item`, offset);
      }
      const head = readHeader(bytes, offset, frame.end);
      if (head.list) {
        const items: RlpItem[] = [];
        frame.items.push(items);
        stack.push({ items, end: head.end });
        offset = head.start;
      } else {
        frame.items.push(new Uint8Array(bytes.subarray(head.start, head.end)));
        offset = head.end;
      }
    }
    return root[0]!;
  },
} as const;
