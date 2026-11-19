import assert from "node:assert/strict"
import { createHash } from "node:crypto"

export function approvedSource(bytes, expected) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).replaceAll("\r\n", "\n")
  // The approved receipts were produced on Windows. Check the same bytes apart from Git's line ending conversion.
  const digest = createHash("sha256").update(text.replaceAll("\n", "\r\n")).digest("hex")
  assert.equal(digest, expected, "Fonte homologada divergente")
  return text
}
