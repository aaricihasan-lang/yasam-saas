/**
 * 9. aşama — TEST projesine VERİ KORUYAN, TEKRAR ÇALIŞTIRILABİLİR düzeltme (yalnız guard'lı test projesi).
 *   --step=p0     : düzeltilmiş migration'daki TÜM `CREATE OR REPLACE FUNCTION` bloklarını yeniden kurar
 *                   (PT409 çakışma kodu). Tablo/indeks/veri DEĞİŞMEZ; tetikleyiciler aynı fonksiyon adını kullanır.
 *   --step=grants : migration'ın "Erişim" DO bloğunu yeniden çalıştırır (service_role yazma yetkisi daraltma).
 * Her adım tek işlem; öncesi/sonrası 6 V2 tablosunun satır sayısı + md5 özeti BİREBİR olmalı (aksi → ROLLBACK).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/apply-fix.mts --step=p0|grants
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { connectTestDb, redact } from "./guard";

const step = (process.argv.find((a) => a.startsWith("--step=")) ?? "").slice(7);
if (step !== "p0" && step !== "grants") {
  console.error("kullanım: --step=p0 | --step=grants");
  process.exit(2);
}
const TABLES = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map"];
const MIG = readFileSync(path.resolve("supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql"), "utf8");

async function digest(c: pg.Client): Promise<string> {
  await c.query("SET LOCAL TimeZone = 'UTC'");
  const parts: string[] = [];
  for (const t of TABLES) {
    const r = await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x`);
    parts.push(`${t}:${r.rows[0].n}:${r.rows[0].h}`);
  }
  return parts.join(" ");
}

const c = await connectTestDb();
try {
  const missing = (await c.query(`select t from unnest($1::text[]) t where to_regclass('public.' || t) is null`, [TABLES])).rows;
  if (missing.length) throw new Error(`DUR: V2 tabloları eksik: ${missing.map((m) => m.t).join(",")}`);
  await c.query("BEGIN");
  const before = await digest(c);
  if (step === "p0") {
    const fns = MIG.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g) ?? [];
    if (fns.length < 12) throw new Error(`beklenmeyen fonksiyon sayısı ${fns.length}`);
    for (const f of fns) await c.query(f);
    const bad = (await c.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sifa%' and prosrc like '%40001%'`)).rows[0].n;
    const good = (await c.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'sifa_v2__apply' and prosrc like '%PT409%'`)).rows[0].n;
    if (bad !== 0 || good !== 1) throw new Error(`doğrulama: 40001 kalan=${bad}, PT409=${good}`);
    console.log(`p0: ${fns.length} fonksiyon yeniden kuruldu; 40001 kalan 0; sifa_v2__apply PT409 içeriyor`);
  } else {
    const a = MIG.indexOf("-- ── Erişim:");
    const b = MIG.lastIndexOf("COMMIT;");
    if (a < 0 || b < a) throw new Error("Erişim bloğu bulunamadı");
    await c.query(MIG.slice(a, b));
    console.log("grants: Erişim bloğu yeniden çalıştırıldı");
  }
  // Fonksiyonların yetkileri CREATE OR REPLACE ile korunur; yine de son durumu migration'la hizalamak için
  // p0 adımında da Erişim bloğu çalıştırılmaz (yetki değişikliği ayrı, önce/sonra testli adımdır).
  const after = await digest(c);
  if (before !== after) throw new Error("VERİ ÖZETİ DEĞİŞTİ → ROLLBACK");
  await c.query("COMMIT");
  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log("veri özeti öncesi = sonrası (6 tablo, satır + md5) ✓");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(redact((e as Error).message));
  process.exitCode = 1;
} finally {
  await c.end();
}
