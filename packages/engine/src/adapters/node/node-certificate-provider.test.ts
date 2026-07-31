import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encodeDerInteger,
  NodeCertificateProvider,
} from "./node-certificate-provider.js";

describe("DER INTEGER encoding", () => {
  it.each([
    ["an empty value as zero", [], "020100"],
    ["a redundant leading zero", [0x00, 0x01], "020101"],
    ["multiple redundant leading zeros", [0x00, 0x00, 0x7f], "02017f"],
    ["a required positive padding byte", [0x00, 0x80], "02020080"],
    ["padding for a high-bit first byte", [0x80], "02020080"],
  ])("encodes %s canonically", (_description, input, expected) => {
    expect(
      Buffer.from(encodeDerInteger(new Uint8Array(input))).toString("hex"),
    ).toBe(expected);
  });
});

describe("NodeCertificateProvider", () => {
  it("generates a valid self-signed certificate", async () => {
    const provider = new NodeCertificateProvider();
    const { cert, key } = await provider.generateSelfSigned();

    const certStr = new TextDecoder().decode(cert);
    const keyStr = new TextDecoder().decode(key);
    expect(certStr).toContain("-----BEGIN CERTIFICATE-----");
    expect(certStr).toContain("-----END CERTIFICATE-----");
    expect(keyStr).toContain("-----BEGIN PRIVATE KEY-----");
    expect(keyStr).toContain("-----END PRIVATE KEY-----");

    const x509 = new crypto.X509Certificate(certStr);
    expect(x509.subject).toContain("ok200");
    expect(x509.issuer).toBe(x509.subject);

    // SAN should contain default entries
    expect(x509.subjectAltName).toContain("DNS:localhost");
    expect(x509.subjectAltName).toContain("IP Address:127.0.0.1");

    // Key pair should match: sign with private key, verify with cert's public key
    const testData = Buffer.from("test");
    const sig = crypto.sign("SHA256", testData, keyStr);
    const valid = crypto.verify("SHA256", testData, x509.publicKey, sig);
    expect(valid).toBe(true);
  });

  it("respects custom SAN entries", async () => {
    const provider = new NodeCertificateProvider();
    const { cert } = await provider.generateSelfSigned({
      san: ["myhost.local", "192.168.1.1"],
    });

    const x509 = new crypto.X509Certificate(new TextDecoder().decode(cert));
    expect(x509.subjectAltName).toContain("DNS:myhost.local");
    expect(x509.subjectAltName).toContain("IP Address:192.168.1.1");
  });

  it("sets validity period correctly", async () => {
    const provider = new NodeCertificateProvider();
    const { cert } = await provider.generateSelfSigned({ validityDays: 30 });

    const x509 = new crypto.X509Certificate(new TextDecoder().decode(cert));
    const notAfter = new Date(x509.validTo);
    const diffDays = (notAfter.getTime() - Date.now()) / 86400000;
    expect(diffDays).toBeGreaterThan(28);
    expect(diffDays).toBeLessThan(32);
  });

  it("generates unique serial numbers", async () => {
    const provider = new NodeCertificateProvider();
    const [a, b] = await Promise.all([
      provider.generateSelfSigned(),
      provider.generateSelfSigned(),
    ]);

    const x509a = new crypto.X509Certificate(new TextDecoder().decode(a.cert));
    const x509b = new crypto.X509Certificate(new TextDecoder().decode(b.cert));
    expect(x509a.serialNumber).not.toBe(x509b.serialNumber);
  });
});
