import { DatabentoError } from "./errors.js";

/**
 * Turn a byte stream of JSON Lines into parsed objects, one per line, without
 * buffering the whole body. Handles records split across chunks and a missing
 * trailing newline.
 */
export async function* parseJsonLines<T>(body: ReadableStream<Uint8Array> | null): AsyncGenerator<T, void, undefined> {
  if (body === null) return;
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let buffer = "";
  let lineNumber = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        lineNumber += 1;
        const record = parseLine<T>(line, lineNumber);
        if (record !== undefined) yield record;
      }
      if (done) break;
    }
    if (buffer.trim() !== "") {
      lineNumber += 1;
      const record = parseLine<T>(buffer, lineNumber);
      if (record !== undefined) yield record;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine<T>(line: string, lineNumber: number): T | undefined {
  const trimmed = line.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as T;
  } catch (cause) {
    throw new DatabentoError(`invalid JSON on line ${lineNumber}: ${trimmed.slice(0, 120)}`, { cause });
  }
}

/** Collect an async iterable into an array. Convenient for small requests; do not use on multi-gigabyte ranges. */
export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}
