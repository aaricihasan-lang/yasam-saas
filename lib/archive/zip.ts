/**
 * lib/archive/zip.ts — Bağımlılıksız, akış dostu ZIP yazıcısı (SAF; tarayıcı + sunucu).
 *
 * - Yalnız STORE (sıkıştırmasız): Word (.docx) ve görseller zaten sıkıştırılmıştır; ek sıkıştırma kazanç
 *   getirmez, bellek ve CPU harcar. Her dosya eklendiği anda yerel başlık + veri olarak parçalara yazılır;
 *   arşiv Blob olarak birleştirilir (tarayıcı büyük Blob'ları belleğe tek parça kopyalamadan tutar).
 * - Dosya adları UTF-8 (genel amaçlı bit 11) → Türkçe karakterler Windows / macOS'ta doğru görünür.
 * - ZIP64 YOK: tek dosya ve toplam arşiv 4 GB'tan küçük olmalı; aşılırsa açık hata (sessiz bozuk arşiv yok).
 * - Yol güvenliği: "..", mutlak yol, ters bölü ve kontrol karakterleri reddedilir / temizlenir.
 */

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const ZIP_MAX_BYTES = 0xffffffff - 1;
export const ZIP_MAX_ENTRIES = 0xffff - 1;

export class ZipLimitError extends Error {}

/** Arşiv içi yol: klasör parçaları güvenli dosya adına çevrilir, ".." / mutlak yol oluşamaz. */
export function safeZipPath(parts: readonly string[]): string {
  return parts.map((p) => safeFileName(p)).filter(Boolean).join("/");
}

/** Tek dosya / klasör adı: Windows'ta geçersiz karakterler ve kontrol karakterleri çıkarılır (Türkçe korunur). */
export function safeFileName(name: string, maxLen = 120): string {
  let s = String(name ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^\.+/, "").replace(/[. ]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `_${s}`;
  if (s.length > maxLen) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 8 ? s.slice(dot) : "";
    s = s.slice(0, maxLen - ext.length).trimEnd() + ext;
  }
  return s || "adsiz";
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f),
  };
}

type CentralRecord = { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number };

/** ZIP yazıcısı: `add()` ile dosya eklenir, `finish()` merkezi dizini yazar. Parçalar `parts` dizisinde birikir. */
export class ZipWriter {
  readonly parts: Uint8Array[] = [];
  private central: CentralRecord[] = [];
  private offset = 0;
  private names = new Set<string>();
  private finished = false;
  private readonly encoder = new TextEncoder();
  constructor(private readonly now: Date = new Date()) {}

  get bytesWritten(): number {
    return this.offset;
  }

  get entryCount(): number {
    return this.central.length;
  }

  /** Aynı ad varsa " (2)", " (3)" … eklenir (dosyalar birbirinin üzerine yazılmaz). */
  uniqueName(path: string): string {
    if (!this.names.has(path)) return path;
    const slash = path.lastIndexOf("/");
    const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
    const base = path.slice(dir.length);
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    for (let i = 2; ; i++) {
      const cand = `${dir}${stem} (${i})${ext}`;
      if (!this.names.has(cand)) return cand;
    }
  }

  add(path: string, data: Uint8Array, mtime: Date = this.now): string {
    if (this.finished) throw new Error("ZIP tamamlandı; yeni dosya eklenemez.");
    const clean = path.split("/").map((p) => safeFileName(p)).join("/");
    const name = this.uniqueName(clean);
    if (this.central.length >= ZIP_MAX_ENTRIES) throw new ZipLimitError("Arşivdeki dosya sayısı sınırı aşıldı.");
    if (this.offset + data.length + 30 + name.length * 3 > ZIP_MAX_BYTES) {
      throw new ZipLimitError("Arşiv 4 GB sınırını aşıyor; lütfen kapsamı daraltın.");
    }
    this.names.add(name);
    const nameBytes = this.encoder.encode(name);
    const crc = crc32(data);
    const { time, date } = dosDateTime(mtime);
    const h = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // sürüm
    v.setUint16(6, 0x0800, true); // UTF-8 adlar
    v.setUint16(8, 0, true); // STORE
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    h.set(nameBytes, 30);
    this.central.push({ name: nameBytes, crc, size: data.length, offset: this.offset, time, date });
    this.parts.push(h, data);
    this.offset += h.length + data.length;
    return name;
  }

  addText(path: string, text: string): string {
    return this.add(path, this.encoder.encode(text));
  }

  finish(): Uint8Array[] {
    if (this.finished) return this.parts;
    this.finished = true;
    const start = this.offset;
    let size = 0;
    for (const c of this.central) {
      const r = new Uint8Array(46 + c.name.length);
      const v = new DataView(r.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, c.time, true);
      v.setUint16(14, c.date, true);
      v.setUint32(16, c.crc, true);
      v.setUint32(20, c.size, true);
      v.setUint32(24, c.size, true);
      v.setUint16(28, c.name.length, true);
      v.setUint16(30, 0, true);
      v.setUint16(32, 0, true);
      v.setUint16(34, 0, true);
      v.setUint16(36, 0, true);
      v.setUint32(38, 0, true);
      v.setUint32(42, c.offset, true);
      r.set(c.name, 46);
      this.parts.push(r);
      size += r.length;
    }
    if (start + size > ZIP_MAX_BYTES) throw new ZipLimitError("Arşiv 4 GB sınırını aşıyor; lütfen kapsamı daraltın.");
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.central.length, true);
    v.setUint16(10, this.central.length, true);
    v.setUint32(12, size, true);
    v.setUint32(16, start, true);
    this.parts.push(end);
    this.offset += size + 22;
    return this.parts;
  }
}
