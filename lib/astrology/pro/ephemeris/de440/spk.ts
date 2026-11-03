// Gökyüzü Atlası — JPL DE440 okuyucu: DAF/SPK Tip 2 (Chebyshev konum) çözümleyici. SAF sunucu kodu; bağımlılık YOK, ağ YOK.
//
// Biçim: NAIF "DAF Required Reading" + "SPK Required Reading" (Tip 2). Dosya DEĞİŞTİRİLMEZ, yalnız okunur; tümü belleğe alınmaz —
// gereken kayıt (bir Chebyshev aralığı) `readSync` ile okunur ve küçük bir önbellekte tutulur. Konum km, hız km/s, çerçeve ICRF (J2000),
// zaman TDB saniyesi (J2000'den).

import { closeSync, openSync, readSync } from "node:fs";

type Segment = { target: number; center: number; start: number; end: number; a0: number; init: number; intlen: number; rsize: number; n: number; ncoef: number };

const RECORD_CACHE_PER_SEGMENT = 64;

export class SpkFile {
  private readonly fd: number;
  private readonly segs = new Map<string, Segment[]>();
  private readonly cache = new Map<Segment, Map<number, Float64Array>>();
  /** Dosyadaki her (merkez→hedef) çiftinin ortak kapsamı (TDB s). */
  readonly coverage: { start: number; end: number };

  constructor(path: string) {
    this.fd = openSync(path, "r");
    try {
      const fr = Buffer.alloc(1024);
      readSync(this.fd, fr, 0, 1024, 0);
      if (fr.toString("latin1", 0, 8) !== "DAF/SPK ") throw new Error("DE440: dosya DAF/SPK değil");
      if (fr.toString("latin1", 88, 96) !== "LTL-IEEE") throw new Error("DE440: yalnız küçük-endian (LTL-IEEE) dosya desteklenir");
      const nd = fr.readInt32LE(8);
      const ni = fr.readInt32LE(12);
      if (nd !== 2 || ni !== 6) throw new Error("DE440: beklenmeyen özet yapısı");
      const ss = nd + Math.floor((ni + 1) / 2);
      let rec = fr.readInt32LE(76);
      const buf = Buffer.alloc(1024);
      const tail = Buffer.alloc(32);
      let cs = -Infinity;
      let ce = Infinity;
      while (rec > 0) {
        readSync(this.fd, buf, 0, 1024, (rec - 1) * 1024);
        const next = buf.readDoubleLE(0);
        const nsum = buf.readDoubleLE(16);
        for (let i = 0; i < nsum; i++) {
          const o = 24 + i * ss * 8;
          const start = buf.readDoubleLE(o);
          const end = buf.readDoubleLE(o + 8);
          const target = buf.readInt32LE(o + 16);
          const center = buf.readInt32LE(o + 20);
          const type = buf.readInt32LE(o + 28);
          const a0 = buf.readInt32LE(o + 32);
          const a1 = buf.readInt32LE(o + 36);
          if (type !== 2) throw new Error(`DE440: segment tipi ${type} desteklenmiyor`);
          readSync(this.fd, tail, 0, 32, (a1 - 4) * 8);
          const rsize = tail.readDoubleLE(16);
          const seg: Segment = { target, center, start, end, a0, init: tail.readDoubleLE(0), intlen: tail.readDoubleLE(8), rsize, n: tail.readDoubleLE(24), ncoef: (rsize - 2) / 3 };
          const k = `${center}>${target}`;
          const list = this.segs.get(k) ?? [];
          list.push(seg);
          list.sort((a, b) => a.start - b.start);
          this.segs.set(k, list);
        }
        rec = next;
      }
      for (const list of this.segs.values()) {
        cs = Math.max(cs, list[0].start);
        ce = Math.min(ce, list[list.length - 1].end);
      }
      this.coverage = { start: cs, end: ce };
    } catch (e) {
      closeSync(this.fd);
      throw e;
    }
  }

  has(center: number, target: number): boolean {
    return this.segs.has(`${center}>${target}`);
  }

  private record(seg: Segment, idx: number): Float64Array {
    let c = this.cache.get(seg);
    if (!c) this.cache.set(seg, (c = new Map()));
    const hit = c.get(idx);
    if (hit) return hit;
    const bytes = seg.rsize * 8;
    const b = Buffer.alloc(bytes);
    readSync(this.fd, b, 0, bytes, (seg.a0 - 1) * 8 + idx * bytes);
    const r = new Float64Array(b.buffer, b.byteOffset, seg.rsize);
    if (c.size >= RECORD_CACHE_PER_SEGMENT) c.clear();
    c.set(idx, r);
    return r;
  }

  /** (merkez → hedef) konum [km] ve hız [km/s]; et = TDB saniye (J2000'den). Kapsam dışı: RangeError. */
  state(center: number, target: number, et: number): { p: [number, number, number]; v: [number, number, number] } {
    const list = this.segs.get(`${center}>${target}`);
    if (!list) throw new Error(`DE440: ${center}→${target} segmenti yok`);
    const seg = list.find((s) => et >= s.start && et <= s.end);
    if (!seg) throw new RangeError("DE440: an efemeris kapsamı dışında");
    let idx = Math.floor((et - seg.init) / seg.intlen);
    if (idx >= seg.n) idx = seg.n - 1;
    if (idx < 0) idx = 0;
    const r = this.record(seg, idx);
    const mid = r[0];
    const rad = r[1];
    const n = seg.ncoef;
    const s = (et - mid) / rad;
    // Chebyshev T_k(s) ve türevi T'_k(s) (özyineleme).
    let t0 = 1;
    let t1 = s;
    let d0 = 0;
    let d1 = 1;
    const p: [number, number, number] = [0, 0, 0];
    const v: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const off = 2 + c * n;
      p[c] = r[off] * t0 + (n > 1 ? r[off + 1] * t1 : 0);
      v[c] = n > 1 ? r[off + 1] * d1 : 0;
    }
    for (let k = 2; k < n; k++) {
      const t2 = 2 * s * t1 - t0;
      const d2 = 2 * t1 + 2 * s * d1 - d0;
      for (let c = 0; c < 3; c++) {
        const coef = r[2 + c * n + k];
        p[c] += coef * t2;
        v[c] += coef * d2;
      }
      t0 = t1;
      t1 = t2;
      d0 = d1;
      d1 = d2;
    }
    v[0] /= rad;
    v[1] /= rad;
    v[2] /= rad;
    return { p, v };
  }

  close(): void {
    closeSync(this.fd);
  }
}
