#!/usr/bin/env node
// Gökyüzü Atlası — JPL DE440 veri dosyasını RESMÎ kaynaktan indirir ve doğrular (derleme öncesi; `npm run build` → prebuild).
//
// • Dosya DEĞİŞTİRİLMEZ (NAIF "Rules Regarding Use of SPICE": değiştirilmemiş kernel yeniden dağıtılabilir; ticari kullanım serbest,
//   ücret/lisans yok). Depoya KONMAZ (.gitignore: /data/ephemeris/); yalnız sunucu fonksiyon paketine girer.
// • Doğrulama: bayt sayısı + SHA-256 (iki resmî aynadan — NAIF ve JPL SSD — 03.11.2026'da birebir aynı ölçüldü; MD5 NAIF
//   aa_checksums.txt ile eşleşir). Uyuşmazsa dosya YAZILMAZ.
// • Var olan doğru dosya yeniden indirilmez. ATLAS_DE440_SOURCE_FILE=<yol> verilirse ağ yerine o yerel kopya doğrulanıp kopyalanır.
// • Zorunluluk: Vercel production derlemesinde (VERCEL_ENV=production) ya da DE440_REQUIRED=1 iken başarısızlık derlemeyi DURDURUR
//   (eski sürüm yayında kalır). Diğer ortamlarda uyarı basılır ve çıkış 0 olur; o zaman çalışma anında efemeris uçları AÇIK HATA
//   (EPHEMERIS_ENGINE_UNAVAILABLE) döner — eski motora sessiz düşüş yok.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const FILE = {
  bytes: 119_799_808,
  sha256: "a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5",
  urls: ["https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp", "https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440.bsp"],
};
const target = process.env.ATLAS_DE440_PATH || join(process.cwd(), "data", "ephemeris", "de440.bsp");
const required = process.env.VERCEL_ENV === "production" || process.env.DE440_REQUIRED === "1";

async function sha256Of(path) {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), h);
  return h.digest("hex");
}
async function valid(path) {
  return existsSync(path) && statSync(path).size === FILE.bytes && (await sha256Of(path)) === FILE.sha256;
}

async function main() {
  if (await valid(target)) {
    console.log(`[de440] mevcut dosya doğrulandı (SHA-256 eşleşti): ${target}`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.indiriliyor`;
  const errors = [];
  const local = process.env.ATLAS_DE440_SOURCE_FILE;
  const sources = local ? [`file:${local}`] : FILE.urls;
  for (const src of sources) {
    try {
      rmSync(tmp, { force: true });
      if (src.startsWith("file:")) await copyFile(src.slice(5), tmp);
      else {
        const res = await fetch(src, { redirect: "follow" });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      }
      const size = statSync(tmp).size;
      if (size !== FILE.bytes) throw new Error(`boyut ${size} ≠ ${FILE.bytes}`);
      const sum = await sha256Of(tmp);
      if (sum !== FILE.sha256) throw new Error(`SHA-256 uyuşmadı (${sum})`);
      renameSync(tmp, target);
      console.log(`[de440] indirildi ve doğrulandı: ${src} → ${target}`);
      return;
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
      rmSync(tmp, { force: true });
    }
  }
  const msg = `[de440] DOĞRULANMIŞ DE440 dosyası alınamadı:\n  ${errors.join("\n  ")}`;
  if (required) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`${msg}\n[de440] UYARI: zorunlu değil (VERCEL_ENV≠production, DE440_REQUIRED≠1) → derleme sürüyor; efemeris uçları çalışma anında açık hata döner.`);
}

main().catch((e) => {
  console.error(`[de440] beklenmeyen hata: ${e.stack ?? e}`);
  process.exit(required ? 1 : 0);
});
