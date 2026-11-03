#!/usr/bin/env node
/**
 * Gökyüzü Atlası teknik izinleri — migration 20271230000000 provası (geçici gömülü PostgreSQL; prod'a temas YOK).
 * Fixture (prod şemasının minimal kopyası) → migration İKİ kez (idempotency) → assert (backfill, biçim CHECK, atomik kayıt
 * fonksiyonu, denetim farkı, yetkiler, kısmi kayıt yok). CI regresyon listesi için "N PASS / M FAIL" özeti yazar.
 *
 *   node scripts/astrology/pg/technique-grants.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const r = spawnSync(
  process.execPath,
  [
    "scripts/final-hardening/pg-migration-check.mjs",
    "--fixture", "scripts/astrology/pg/technique-grants-fixture.sql",
    "--migration", "supabase/migrations/20271230000000_astrology_technique_grants.sql",
    "--twice",
    "--assert", "scripts/astrology/pg/technique-grants-assert.sql",
  ],
  { cwd: ROOT, encoding: "utf8", timeout: 6 * 60_000 },
);
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
const ok = r.status === 0 && /RESULT: PASS/.test(r.stdout ?? "");
console.log(ok ? "PASS technique-grants migration provası" : "FAIL technique-grants migration provası");
console.log(`${ok ? 1 : 0} PASS / ${ok ? 0 : 1} FAIL`);
process.exit(ok ? 0 : 1);
