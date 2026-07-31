/**
 * Self-signed X.509 certificate generation using only node:crypto.
 * Zero external dependencies. RSA-2048 + SHA-256.
 */

import * as crypto from "node:crypto";
import type {
  ICertificateProvider,
  TlsOptions,
} from "../../interfaces/certificate.js";

// ---- ASN.1 DER encoding helpers ----

function derLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len < 0x100) return new Uint8Array([0x81, len]);
  if (len < 0x10000)
    return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  return new Uint8Array([
    0x83,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ]);
}

function derTag(tag: number, ...contents: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const c of contents) totalLen += c.length;
  const lenBytes = derLength(totalLen);
  const result = new Uint8Array(1 + lenBytes.length + totalLen);
  result[0] = tag;
  result.set(lenBytes, 1);
  let offset = 1 + lenBytes.length;
  for (const c of contents) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

function derSequence(...items: Uint8Array[]): Uint8Array {
  return derTag(0x30, ...items);
}

function derSet(...items: Uint8Array[]): Uint8Array {
  return derTag(0x31, ...items);
}

// Exported from this module for deterministic DER regression coverage. It is
// not part of the package's public entry-point exports.
export function encodeDerInteger(value: Uint8Array): Uint8Array {
  // DER INTEGERs must use the shortest possible encoding. Preserve one
  // leading zero only when it is required to keep a positive value positive.
  let start = 0;
  while (
    start < value.length - 1 &&
    value[start] === 0 &&
    (value[start + 1] & 0x80) === 0
  ) {
    start += 1;
  }

  const normalized =
    value.length === 0 ? new Uint8Array([0]) : value.subarray(start);
  if (normalized[0] & 0x80) {
    const padded = new Uint8Array(normalized.length + 1);
    padded.set(normalized, 1);
    return derTag(0x02, padded);
  }
  return derTag(0x02, normalized);
}

function derBitString(data: Uint8Array): Uint8Array {
  // Bit string with 0 unused bits
  const inner = new Uint8Array(data.length + 1);
  inner[0] = 0x00; // unused bits
  inner.set(data, 1);
  return derTag(0x03, inner);
}

function derOctetString(data: Uint8Array): Uint8Array {
  return derTag(0x04, data);
}

function derOid(oid: number[]): Uint8Array {
  const bytes: number[] = [];
  // First two components encoded as 40*a + b
  bytes.push(40 * oid[0] + oid[1]);
  for (let i = 2; i < oid.length; i++) {
    let val = oid[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const encoded: number[] = [];
      encoded.push(val & 0x7f);
      val >>= 7;
      while (val > 0) {
        encoded.push((val & 0x7f) | 0x80);
        val >>= 7;
      }
      encoded.reverse();
      bytes.push(...encoded);
    }
  }
  return derTag(0x06, new Uint8Array(bytes));
}

function derUtf8String(str: string): Uint8Array {
  return derTag(0x0c, new TextEncoder().encode(str));
}

function derUtcTime(date: Date): Uint8Array {
  const y = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return derTag(0x17, new TextEncoder().encode(`${y}${m}${d}${h}${min}${s}Z`));
}

function derExplicit(tag: number, content: Uint8Array): Uint8Array {
  return derTag(0xa0 | tag, content);
}

// ---- Well-known OIDs ----

const OID_SHA256_RSA = [1, 2, 840, 113549, 1, 1, 11]; // sha256WithRSAEncryption
const OID_COMMON_NAME = [2, 5, 4, 3];
const OID_SUBJECT_ALT_NAME = [2, 5, 29, 17];

const SHA256_RSA_ALGORITHM = derSequence(
  derOid(OID_SHA256_RSA),
  new Uint8Array([0x05, 0x00]), // NULL
);

// ---- Certificate building ----

function buildRdnSequence(cn: string): Uint8Array {
  return derSequence(
    derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(cn))),
  );
}

function isIPAddress(name: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
}

function buildSanExtension(names: string[]): Uint8Array {
  const entries: Uint8Array[] = [];
  for (const name of names) {
    if (isIPAddress(name)) {
      // IP address: context tag [7], 4 bytes
      const parts = name.split(".").map(Number);
      entries.push(derTag(0x87, new Uint8Array(parts)));
    } else {
      // DNS name: context tag [2]
      entries.push(derTag(0x82, new TextEncoder().encode(name)));
    }
  }
  return derSequence(
    derOid(OID_SUBJECT_ALT_NAME),
    derOctetString(derSequence(...entries)),
  );
}

function buildTbsCertificate(params: {
  serialNumber: Uint8Array;
  issuerCN: string;
  notBefore: Date;
  notAfter: Date;
  subjectCN: string;
  publicKeyDer: Uint8Array;
  san: string[];
}): Uint8Array {
  return derSequence(
    // version [0] EXPLICIT INTEGER 2 (v3)
    derExplicit(0, encodeDerInteger(new Uint8Array([2]))),
    // serial number
    encodeDerInteger(params.serialNumber),
    // signature algorithm
    SHA256_RSA_ALGORITHM,
    // issuer
    buildRdnSequence(params.issuerCN),
    // validity
    derSequence(derUtcTime(params.notBefore), derUtcTime(params.notAfter)),
    // subject
    buildRdnSequence(params.subjectCN),
    // subjectPublicKeyInfo (already DER-encoded SPKI from node:crypto)
    params.publicKeyDer,
    // extensions [3] EXPLICIT
    derExplicit(3, derSequence(buildSanExtension(params.san))),
  );
}

// ---- PEM encoding ----

function pemEncode(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

// ---- Public API ----

export class NodeCertificateProvider implements ICertificateProvider {
  async generateSelfSigned(options?: {
    san?: string[];
    validityDays?: number;
  }): Promise<TlsOptions> {
    const san = options?.san ?? ["localhost", "127.0.0.1"];
    const validityDays = options?.validityDays ?? 365;

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    const publicKeyDer = publicKey.export({ type: "spki", format: "der" });

    const now = new Date();
    const notAfter = new Date(now.getTime() + validityDays * 86400000);
    const serialNumber = crypto.randomBytes(16);
    // Ensure positive (clear high bit)
    serialNumber[0] &= 0x7f;

    const tbsCert = buildTbsCertificate({
      serialNumber: new Uint8Array(serialNumber),
      issuerCN: "ok200 self-signed",
      notBefore: now,
      notAfter,
      subjectCN: "ok200 self-signed",
      publicKeyDer: new Uint8Array(publicKeyDer),
      san,
    });

    const signer = crypto.createSign("SHA256");
    signer.update(tbsCert);
    const signature = signer.sign(privateKey);

    const certDer = derSequence(
      tbsCert,
      SHA256_RSA_ALGORITHM,
      derBitString(new Uint8Array(signature)),
    );

    const certPem = pemEncode(new Uint8Array(certDer), "CERTIFICATE");
    const keyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    const encoder = new TextEncoder();
    return {
      cert: encoder.encode(certPem),
      key: encoder.encode(keyPem),
    };
  }
}
