// HD-25 — BodyGraph PNG ↔ harita BAĞLAMASI (SAF, isomorfik: tarayıcı + sunucu).
//
// SORUN: Word'e giden BodyGraph PNG'si tarayıcıda (resmî Roxy renderer'ı, kayıtlı yapısal yükten)
// üretilir; sunucu yalnız PNG biçimini doğruluyordu. Başka bir haritanın (ör. önceki açık
// analiz, eşzamanlı sekme) ya da keyfi bir görselin bu rapora girmesi engellenmiyordu.
//
// ÇÖZÜM (en az riskli): Yakalama (bodygraphCapture) PNG'ye standart bir `tEXt` parçası ekler:
//   anahtar "yasam-hd-bodygraph", değer "v1|<chartId>|<parmak izi>"
// Parmak izi, ÇİZİMİN gerçekten doğrulandığı (drawingMatches) iki yapısal özelliktir:
//   aktif kapı kümesi + tanımlı merkez sayısı. Sunucu aynı parmak izini KAYITLI haritadan
// (donmuş snapshot) kendisi üretir ve birebir eşleşme ister; eşleşmeyen/eksik PNG reddedilir.
// Piksel içeriği değişmez; tEXt yardımcı (ancillary) parçadır, Word/görüntüleyiciler yok sayar.
//
// SINIR (dürüst): PNG istemcide üretildiği için kötü niyetli bir uzman kendi raporuna doğru
// etiketli ama farklı pikselli bir görsel koyabilir (yalnız KENDİ raporunu etkiler; başka
// kişinin verisine erişim sağlamaz). Bu katman kaza/yarış kaynaklı yanlış eşleşmeyi ve başka
// haritaya ait görseli kesin olarak engeller. Tam koruma sunucu-taraflı render gerektirir.

export const HD_BODYGRAPH_BIND_KEYWORD = "yasam-hd-bodygraph";
const BIND_VERSION = "v1";

/** Parmak izi: sıralı benzersiz aktif kapılar + tanımlı merkez sayısı. */
export function bodygraphFingerprint(gates: Iterable<number>, definedCenterCount: number): string {
  const g = [...new Set([...gates].filter((n) => Number.isInteger(n) && n >= 1 && n <= 64))].sort((a, b) => a - b);
  return `g:${g.join(",")}|c:${Math.max(0, Math.trunc(definedCenterCount))}`;
}

export function bodygraphBindingText(chartId: string, fingerprint: string): string {
  return `${BIND_VERSION}|${chartId.toLowerCase()}|${fingerprint}`;
}

/** Kayıtlı Roxy render yükünden (roxy_render) parmak izi — yakalama ile AYNI veri. */
export function fingerprintFromRoxyRender(data: Record<string, unknown>): string {
  const gates: number[] = [];
  for (const a of Array.isArray(data.gates) ? data.gates : []) {
    const n = (a as { gate?: unknown })?.gate;
    if (typeof n === "number") gates.push(n);
  }
  const defined = (Array.isArray(data.centers) ? data.centers : []).filter((c) => (c as { defined?: unknown })?.defined === true).length;
  return bodygraphFingerprint(gates, defined);
}

// ── PNG parçası yardımcıları (Uint8Array; Node Buffer da Uint8Array'dir) ────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0x7e || code < 0x20) throw new Error("binding text must be printable ASCII");
    out[i] = code;
  }
  return out;
}

function u32(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

/** IHDR'nin hemen ardına bir `tEXt` parçası ekler (yeni dizi döner; girdi değişmez). */
export function insertPngTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // imza + uzunluk + tip + IHDR verisi + CRC
  if (png.length < ihdrEnd) throw new Error("not a png");
  const data = new Uint8Array([...latin1(keyword), 0, ...latin1(text)]);
  const typeAndData = new Uint8Array([...latin1("tEXt"), ...data]);
  const chunk = new Uint8Array([...u32(data.length), ...typeAndData, ...u32(crc32(typeAndData))]);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/** Tüm `tEXt` parçalarını okur (bozuk yapıda boş döner; biçim doğrulaması ayrı yapılır). */
export function readPngTextChunks(png: Uint8Array): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let off = 8;
  while (off + 12 <= png.length) {
    const len = ((png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3]) >>> 0;
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const start = off + 8;
    const end = start + len;
    if (end + 4 > png.length) break;
    if (type === "tEXt") {
      const d = png.subarray(start, end);
      const z = d.indexOf(0);
      if (z > 0) {
        const k = String.fromCharCode(...d.subarray(0, z));
        const v = String.fromCharCode(...d.subarray(z + 1));
        out.set(k, [...(out.get(k) ?? []), v]);
      }
    }
    if (type === "IEND") break;
    off = end + 4;
  }
  return out;
}

export type BodygraphBindingCheck =
  | { ok: true }
  | { ok: false; code: "BODYGRAPH_UNBOUND" | "BODYGRAPH_MISMATCH"; error: string };

/**
 * Sunucu kontrolü: PNG'de TAM OLARAK bir bağlama metni olmalı ve beklenenle birebir aynı olmalı.
 * `expected` — kayıtlı haritadan sunucuda türetilen bodygraphBindingText(chartId, parmak izi).
 */
export function verifyBodygraphBinding(png: Uint8Array, expected: string): BodygraphBindingCheck {
  const values = readPngTextChunks(png).get(HD_BODYGRAPH_BIND_KEYWORD) ?? [];
  if (values.length !== 1) {
    return {
      ok: false,
      code: "BODYGRAPH_UNBOUND",
      error: "BodyGraph görseli bu analize bağlı değil. Sayfayı yenileyip raporu yeniden oluşturun.",
    };
  }
  if (values[0] !== expected) {
    return {
      ok: false,
      code: "BODYGRAPH_MISMATCH",
      error: "BodyGraph görseli bu analize ait değil. Analizi yeniden açıp raporu tekrar oluşturun.",
    };
  }
  return { ok: true };
}
