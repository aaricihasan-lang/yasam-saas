// Gökyüzü Atlası — DE440 veri dosyası erişimi (YALNIZ sunucu). Dosya depoda DEĞİLDİR: derleme öncesi
// scripts/astrology/de440/fetch-de440.mjs resmî NASA/JPL kaynağından indirir ve SHA-256 ile doğrular (değiştirilmemiş kernel).
//
// Yol: ATLAS_DE440_PATH (varsa) ya da <proje kökü>/data/ephemeris/de440.bsp. Çalışma anında boyut + DAF başlığı + kapsam doğrulanır;
// uymazsa kaynak KULLANILAMAZ sayılır ve hesap AÇIK HATA ile durur (eski motora SESSİZ düşüş YOK).

import { statSync } from "node:fs";
import { join } from "node:path";
import { SpkFile } from "./spk";

/** Resmî dosya kimliği (NAIF generic_kernels/spk/planets/de440.bsp = JPL SSD ftp/eph/planets/bsp/de440.bsp). */
export const DE440_FILE = {
  name: "de440.bsp",
  bytes: 119_799_808,
  sha256: "a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5",
  md5: "c9d581bfd84209dbeee8b1583939b148", // NAIF aa_checksums.txt
  coverage: "1549-12-31 – 2650-01-25 (TDB)",
  citation: "Park, R.S., Folkner, W.M., Williams, J.G., Boggs, D.H. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, AJ 161:105",
} as const;

export class De440UnavailableError extends Error {
  readonly code = "EPHEMERIS_ENGINE_UNAVAILABLE" as const;
  constructor(reason: string) {
    super(`Yüksek hassasiyetli efemeris verisi (JPL DE440) kullanılamıyor: ${reason}`);
  }
}

export const de440Path = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_DE440_PATH || join(process.cwd(), "data", "ephemeris", DE440_FILE.name);

let cached: { path: string; spk: SpkFile } | null = null;
let failure: { path: string; reason: string } | null = null;

/** Açık DE440 dosyası; yoksa/bozuksa De440UnavailableError. Sonuç süreç boyunca önbellekte tutulur. */
export function de440(env: NodeJS.ProcessEnv = process.env): SpkFile {
  const path = de440Path(env);
  if (cached && cached.path === path) return cached.spk;
  if (failure && failure.path === path) throw new De440UnavailableError(failure.reason);
  try {
    // turbopackIgnore: yol değişkenden geldiği için Turbopack aksi hâlde TÜM projeyi fonksiyona izler (≈154 MB). Dosya pakete
    // next.config.ts → outputFileTracingIncludes ile AÇIKÇA girer; çalışma davranışı değişmez.
    const st = statSync(/*turbopackIgnore: true*/ path);
    if (st.size !== DE440_FILE.bytes) throw new Error(`dosya boyutu beklenen değil (${st.size} bayt)`);
    const spk = new SpkFile(path);
    for (const [c, t] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [3, 301], [3, 399]] as const) {
      if (!spk.has(c, t)) throw new Error(`${c}→${t} segmenti eksik`);
    }
    cached = { path, spk };
    return spk;
  } catch (e) {
    const reason = (e as NodeJS.ErrnoException).code === "ENOENT" ? "veri dosyası bulunamadı" : (e as Error).message;
    failure = { path, reason };
    throw new De440UnavailableError(reason);
  }
}

/** Test/teşhis: dosyaya erişilebiliyor mu (hata fırlatmaz). */
export function de440Status(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; reason: string } {
  try {
    de440(env);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
