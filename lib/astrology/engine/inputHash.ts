// Astroloji — deterministik önbellek anahtarı + satır kimliği (SAF; node:crypto).
//
// Anahtar = sağlayıcı + sağlayıcı API sürümü + adaptör sürümü + endpoint + dil + NORMALİZE gövde
// (anahtarları sıralı). Profil/danışan kimliği anahtara GİRMEZ: aynı doğum verisi + aynı yöntem
// = aynı hesap (iki ayrı profil aynı sonucu paylaşabilir). Doğum verisi değişince gövde değişir →
// yeni anahtar (eski kayıt silinmez). Zamana bağlı tekniklerde hedef tarih/saat gövdenin
// parçasıdır → anahtara otomatik girer.

import { createHash } from "node:crypto";

function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("canonicalJson: sonlu olmayan sayı");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export type CalcIdentity = {
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  endpoint: string;
  lang: string;
  body: Record<string, unknown>;
};

export function calcInputHash(i: CalcIdentity): string {
  const canonical = canonicalJson([i.provider, i.providerApiVersion, i.adapterVersion, i.endpoint, i.lang, i.body]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** (tenant, input_hash) → deterministik UUID (v5 biçimi) — eşzamanlı ikinci INSERT PK/UNIQUE ile reddedilir. */
export function resultIdFor(tenantId: string, inputHash: string): string {
  const h = createHash("sha1").update(["yasam-astro-result", tenantId, inputHash].join("\u001f"), "utf8").digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
