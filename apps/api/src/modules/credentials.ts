import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function encryptCredential(
  plaintext: string,
  keyHex: string,
  context: string,
) {
  if (!/^[a-f\d]{64}$/i.test(keyHex))
    throw new Error("Credential key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  });
}
export function decryptCredential(
  envelope: string,
  keyHex: string,
  context: string,
) {
  const value = JSON.parse(envelope);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(value.iv, "hex"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
