/**
 * GİRİŞ GÜVENLİĞİ — F2 test veritabanı DÜZEY koruması (yalnız test altyapısı; ürün kodu / migration DEĞİL).
 *
 * Sorun (23.11 ölçümü): tarayıcı CI'ı (ci-f2-tarayici.mjs) test veritabanını sabit `F2_TEST_DB_WITH_F2K=1` ile kuruyordu.
 * F2-M (001200) eklenince CI 001100 düzeyinde koşmaya devam etti ve SESSİZCE yeşil kaldı.
 *
 * Kural: "en güncel F2 düzeyi" TEK kaynaktan gelir → F2_STAGES'in son öğesi (f2-migration-guard.mjs; denetleyicisi zaten
 * her 20280103* dosyasının bu listede olmasını şart koşar). Üç kaynak birbirini tutmak ZORUNDA:
 *   1) supabase/migrations/20280103*_*.sql içindeki en son doğrusal F2 dosyası,
 *   2) F2_STAGES son öğesi,
 *   3) testDb.ts'nin uyguladığı dosyalar + `F2_TEST_DB_LATEST=1` eşlemesi.
 * Yeni bir F2 migration'ı eklenip testDb.ts'ye eklenmezse statik denetim FAIL verir; eşleme unutulursa testDb kurulumdan
 * sonra okuduğu gerçek düzey en güncel düzeyle uyuşmaz ve test BAŞLAMADAN durur (testDb.ts).
 *
 * Dinamik kanıt: testDb kurulumdan sonra iki BAĞIMSIZ kaynaktan düzeyi okur ve şu satırı yazar:
 *   [f2-test-db] düzey kayıt=<auth_f2_schema_level() | yok> katalog=<parmak izinden> en-güncel=<F2_STAGES son düzeyi>
 * Tarayıcı koşucusu bu satırı her testin günlüğünde arar; yoksa veya beklenen düzey değilse test FAIL sayılır.
 */
import fs from "node:fs";
import path from "node:path";
import { F2_STAGES, LOCK_FILE } from "./f2-migration-guard.mjs";

export const LEVEL_LINE_PREFIX = "[f2-test-db]";

/** F2_STAGES son öğesi = en güncel F2 düzeyi. */
export function latestStage(stages = F2_STAGES) {
  return stages[stages.length - 1];
}

/** Negatif kontrol düzeyi: F2-K'dan (1100) hemen önceki aşama (F2-K kuralları YOK). */
export function stageBefore(level, stages = F2_STAGES) {
  const i = stages.findIndex((s) => s.level === level);
  if (i <= 0) throw new Error(`F2_STAGES içinde ${level} düzeyinden önce aşama yok`);
  return stages[i - 1];
}

/** Migration klasöründeki doğrusal F2 dosyalarının sürümleri (000200 kilit dosyası zincir dışıdır). */
export function linearVersions(dirFiles) {
  return [...new Set(dirFiles.filter((f) => /^20280103\d{6}_.*\.sql$/.test(f)).map((f) => f.slice(0, 14)))]
    .filter((v) => v !== LOCK_FILE).sort();
}

/** testDb.ts kaynağında geçen doğrusal F2 migration sürümleri. */
export function testDbVersions(testDbSource) {
  return [...new Set([...testDbSource.matchAll(/supabase\/migrations\/(20280103\d{6})_/g)].map((m) => m[1]))]
    .filter((v) => v !== LOCK_FILE).sort();
}

/** Statik kapsam denetimi. Dönen dizi boşsa PASS; her öğe bir FAIL gerekçesidir. */
export function checkCoverage({ stages = F2_STAGES, dirFiles, testDbSource, runAllSource }) {
  const problems = [];
  const dir = linearVersions(dirFiles);
  const tdb = testDbVersions(testDbSource);
  const latest = latestStage(stages);
  const lastDir = dir[dir.length - 1];
  if (!lastDir) problems.push("migration klasöründe F2 dosyası yok");
  else if (lastDir !== latest.file) {
    problems.push(`en son F2 migration'ı ${lastDir}, F2_STAGES son aşaması ${latest.file} (${latest.level}) — F2_STAGES güncel değil`);
  }
  for (const v of dir) if (!stages.some((s) => s.file === v)) problems.push(`F2_STAGES listesinde olmayan F2 migration'ı: ${v}`);
  const missing = dir.filter((v) => !tdb.includes(v));
  if (missing.length) problems.push(`testDb.ts bu F2 migration'larını UYGULAMIYOR: ${missing.join(", ")} (test DB eski düzeyde kalır)`);
  if (!/process\.env\.F2_TEST_DB_LATEST === "1"/.test(testDbSource)) problems.push("testDb.ts'de F2_TEST_DB_LATEST=1 (en güncel zincir) eşlemesi yok");
  // İkinci elle tutulan zincir: final-hardening/run-all.mjs (deploy-order *-full + f2-postflight). 23.11 F2-N'de bu liste 001200'de
  // kaldı ve postflight 1300 beklediği için FAIL verdi; deploy-order testleri ise sessizce eski zincirle geçiyordu.
  if (typeof runAllSource === "string" && lastDir && !runAllSource.includes(`"${lastDir}_`)) {
    problems.push(`final-hardening/run-all.mjs en son F2 migration'ını (${lastDir}) içermiyor (deploy-order / postflight zinciri eski kalır)`);
  }
  return problems;
}

/** Depodan statik denetim girdileri. */
export function readRepo(root) {
  return {
    stages: F2_STAGES,
    dirFiles: fs.readdirSync(path.join(root, "supabase", "migrations")),
    testDbSource: fs.readFileSync(path.join(root, "scripts", "giris-guvenligi", "testDb.ts"), "utf8"),
    runAllSource: fs.readFileSync(path.join(root, "scripts", "final-hardening", "run-all.mjs"), "utf8"),
  };
}

/** Günlükteki düzey satırları → [{ registry: number|null, catalog: number, latest: number }]. */
export function parseLevelLines(text) {
  return [...String(text).matchAll(/\[f2-test-db\] düzey kayıt=(-?\d+|yok) katalog=(-?\d+) en-güncel=(\d+)/g)].map((m) => ({
    registry: m[1] === "yok" ? null : Number(m[1]), catalog: Number(m[2]), latest: Number(m[3]),
  }));
}

/**
 * Bir test koşusunun DB düzeyi kanıtı. En az bir satır olmalı ve HER satırda kayıt = katalog = beklenen.
 * Dönen { ok, levels, reason }.
 */
export function judgeLevels(text, expected) {
  const levels = parseLevelLines(text);
  if (!levels.length) return { ok: false, levels, reason: "günlükte [f2-test-db] düzey satırı YOK (test DB düzeyi kanıtlanamadı)" };
  const bad = levels.filter((l) => l.registry !== expected || l.catalog !== expected);
  if (bad.length) {
    return { ok: false, levels, reason: `test DB düzeyi beklenen ${expected} değil: ${bad.map((l) => `kayıt=${l.registry ?? "yok"}/katalog=${l.catalog}`).join(", ")}` };
  }
  return { ok: true, levels, reason: "" };
}
