#!/usr/bin/env node
/**
 * FAZ1 Final Hardening — tüm yeni harness'ler + migration doğrulamaları (prod'a temas YOK).
 * Kullanım: node scripts/final-hardening/run-all.mjs [--only <ad>]
 *
 * Not: saat dilimi duyarlı harness'ler ek olarak FH_TZ_MATRIX=1 ile
 * UTC + America/Los_Angeles altında tekrar koşulur (Git Bash TZ'yi aktarmadığı için env
 * doğrudan alt sürece verilir).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = (n) => `supabase/migrations/${n}`;
const F = (n) => `scripts/final-hardening/fixtures/${n}`;
const nutritionBase = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => /^20261228000[0-6]00_nutrition_.*\.sql$/.test(f))
  .sort()
  .flatMap((f) => ["--fixture", M(f)]);

const pg = (fixtures, migrations, asserts) => [
  "node",
  [
    "scripts/final-hardening/pg-migration-check.mjs",
    ...fixtures.flatMap((f) => ["--fixture", f]),
    ...migrations.flatMap((m) => ["--migration", M(m)]),
    "--twice",
    ...asserts.flatMap((a) => ["--assert", F(a)]),
  ],
];

const TZ_SENSITIVE = new Set(["foundation", "word-tz", "dy", "backup", "hday"]);

const STEPS = [
  ["foundation", "npx", ["tsx", "scripts/final-hardening/foundation.harness.ts"]],
  ["auth", "npx", ["tsx", "scripts/final-hardening/auth.harness.ts"]],
  ["auth-routes", "npx", ["tsx", "scripts/final-hardening/auth-routes.harness.ts"]],
  ["auth-video", "npx", ["tsx", "scripts/final-hardening/auth-video.harness.ts"]],
  ["refleks", "npx", ["tsx", "scripts/final-hardening/refleks.harness.ts"]],
  ["backup", "npx", ["tsx", "scripts/final-hardening/backup.harness.ts"]],
  ["word-tz", "npx", ["tsx", "scripts/final-hardening/word-tz.harness.ts"]],
  ["word-static-gate", "npx", ["tsx", "scripts/final-hardening/word-static-gate.harness.ts"]],
  ["dy", "npx", ["tsx", "scripts/final-hardening/dy.harness.ts"]],
  ["lists", "npx", ["tsx", "scripts/final-hardening/lists.harness.ts"]],
  ["hday", "npx", ["tsx", "scripts/final-hardening/hday.harness.ts"]],
  ["infra", "npx", ["tsx", "scripts/final-hardening/infra.harness.ts"]],
  ["pg:auth", ...pg([F("auth-fixture.sql")],
    ["20270129000000_auth_login_throttle.sql", "20270129000100_auth_grants_password_hash_only.sql", "20270129000200_user_sessions_expiry_touch.sql"],
    ["auth-assert.sql"])],
  ["pg:video", ...pg([F("auth-video-fixture.sql")], ["20270129001000_video_temp_storage_lockdown.sql"], ["auth-video-assert.sql"])],
  ["pg:dy-a", ...pg([F("dy-a.sql")],
    ["20270129000300_clients_create_request_id.sql", "20270129000400_client_notes_unique.sql", "20270129000500_yh_snapshot_client_fk.sql"],
    ["dy-a.assert.sql"])],
  ["pg:dy-b", ...pg([F("dyb-allergens-fixture.sql")], ["20270129000600_nutrition_replace_client_allergens.sql"], ["dyb-allergens-assert.sql"])],
  ["pg:nutrition-names", "node", [
    "scripts/final-hardening/pg-migration-check.mjs", "--fixture", F("infra-nutrition-fixture.sql"), ...nutritionBase,
    "--fixture", F("infra-nutrition-owner-edit.sql"),
    "--migration", M("20270129000700_nutrition_names_tr.sql"), "--twice", "--assert", F("infra-nutrition-assert.sql"),
  ]],
  ["pg:aroma", ...pg([F("hday-aroma-0800-fixture.sql"), M("20260830000000_aromatherapy_content_audit_foundation.sql")],
    ["20270129000800_aromatherapy_delete_source.sql"], ["hday-aroma-0800-assert.sql"])],
  ["pg:consents", ...pg([F("infra-consents-fixture.sql")], ["20270129000900_client_consents.sql"], ["infra-consents-assert.sql"])],
  ["pg:grants", ...pg([F("infra-grants-fixture.sql")], ["20270129001100_legacy_grants_lockdown.sql"], ["infra-grants-assert.sql"])],
];

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const tzMatrix = process.env.FH_TZ_MATRIX === "1" || process.argv.includes("--tz-matrix");
const results = [];

function run(label, cmd, args, extraEnv = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, shell: process.platform === "win32", encoding: "utf8", env: { ...process.env, ...extraEnv } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const tail = out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "";
  const ok = r.status === 0;
  results.push({ label, ok, secs: ((Date.now() - t0) / 1000).toFixed(1), tail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} ${tail}`);
  if (!ok) console.log(out.split(/\r?\n/).slice(-25).join("\n"));
}

for (const [name, cmd, args] of STEPS) {
  if (only && name !== only) continue;
  run(name, cmd, args);
  if (tzMatrix && TZ_SENSITIVE.has(name)) {
    run(`${name} [TZ=UTC]`, cmd, args, { TZ: "UTC" });
    run(`${name} [TZ=America/Los_Angeles]`, cmd, args, { TZ: "America/Los_Angeles" });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nfinal-hardening run-all: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
