#!/usr/bin/env node
/**
 * I18N-F1 — user_locale_prefs migration'ı geçici embedded-postgres üzerinde (sentetik veri; prod'a temas YOK).
 * CI regresyon listesi için sarmalayıcı: pg-migration-check'i --twice ile koşar ve "N PASS / M FAIL" özeti basar.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const r = spawnSync(process.execPath, [
  "scripts/final-hardening/pg-migration-check.mjs",
  "--fixture", "scripts/i18n/pg/user-locale-prefs-fixture.sql",
  "--migration", "supabase/migrations/20280126000000_user_locale_prefs.sql",
  "--twice",
  "--assert", "scripts/i18n/pg/user-locale-prefs-assert.sql",
], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
const ok = r.status === 0 && /RESULT: PASS/.test(r.stdout ?? "");
console.log(`\n=== user_locale_prefs migration: ${ok ? 1 : 0} PASS / ${ok ? 0 : 1} FAIL ===`);
process.exit(ok ? 0 : 1);
