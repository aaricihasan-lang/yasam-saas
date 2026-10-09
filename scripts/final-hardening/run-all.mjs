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
  // Ayarlar > Admin ile İrtibat: WhatsApp click-to-chat + telefon (merkezî numara kaynağı).
  ["settings-contact", "npx", ["tsx", "scripts/final-hardening/settings-contact.harness.ts"]],
  ["word-tz", "npx", ["tsx", "scripts/final-hardening/word-tz.harness.ts"]],
  ["word-static-gate", "npx", ["tsx", "scripts/final-hardening/word-static-gate.harness.ts"]],
  ["dy", "npx", ["tsx", "scripts/final-hardening/dy.harness.ts"]],
  ["lists", "npx", ["tsx", "scripts/final-hardening/lists.harness.ts"]],
  ["hday", "npx", ["tsx", "scripts/final-hardening/hday.harness.ts"]],
  ["infra", "npx", ["tsx", "scripts/final-hardening/infra.harness.ts"]],
  ["httponly-h1h4", "npx", ["tsx", "scripts/final-hardening/httponly-h1h4.harness.ts"]],
  // F-1: outbox RPC güvenli hata kategorisi + yalnız sweep için tek jitter retry.
  ["outbox-sweep-retry", "npx", ["tsx", "scripts/final-hardening/outbox-sweep-retry.harness.ts"]],
  // Satış öncesi kapanış (2026-10): yeni kapsam harness'ları.
  ["beslenme-membership", "npx", ["tsx", "scripts/final-hardening/beslenme-membership.harness.ts"]],
  ["admin-hygiene", "npx", ["tsx", "scripts/final-hardening/admin-hygiene.harness.ts"]],
  ["analytics-consent", "npx", ["tsx", "scripts/final-hardening/analytics-consent.harness.ts"]],
  ["output-visibility", "npx", ["tsx", "scripts/final-hardening/output-visibility.harness.ts"]],
  ["notifications", "npx", ["tsx", "scripts/notifications/unit.harness.ts"]],
  ["anamnez-filled-pdf", "npx", ["tsx", "scripts/anamnez/filled-pdf.harness.ts"]],
  ["urun-stok-diger", "npx", ["tsx", "scripts/urun-stok/select-other.harness.ts"]],
  ["clients-list-filter", "npx", ["tsx", "scripts/clients-list-filter.harness.ts"]],
  ["password-policy", "npx", ["tsx", "scripts/final-hardening/password-policy.harness.ts"]],
  ["session-expiry-ux", "npx", ["tsx", "scripts/final-hardening/session-expiry-ux.harness.ts"]],
  ["admin-pending-ux", "npx", ["tsx", "scripts/final-hardening/admin-pending-ux.harness.ts"]],
  ["pg:auth-m1", ...pg([F("auth-fixture.sql")],
    ["20270129000000_auth_login_throttle.sql", "20270129000100_auth_grants_password_hash_only.sql", "20270129000200_user_sessions_expiry_touch.sql",
     "20271001000000_auth_password_session_hardening.sql"],
    ["auth-m1-assert.sql"])],
  // Ayarlar nihai denetim (2026-10-03): parola değişimi → diğer cihaz token'ları sunucuda reddedilir.
  ["pg:settings-password-revoke", ...pg([F("auth-fixture.sql")],
    ["20270129000000_auth_login_throttle.sql", "20270129000100_auth_grants_password_hash_only.sql", "20270129000200_user_sessions_expiry_touch.sql",
     "20271001000000_auth_password_session_hardening.sql"],
    ["settings-password-revoke-assert.sql"])],
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
  // Anamnez V1 (Danışan Yolculuğu): saf sözleşmeler + gerçek route/IDOR + migration doğrulaması.
  ["anamnez-pure", "npx", ["tsx", "scripts/anamnez/pure.harness.ts"]],
  ["anamnez-routes", "npx", ["tsx", "scripts/anamnez/routes.harness.ts"]],
  ["pg:anamnesis", ...pg([F("anamnesis-fixture.sql")],
    ["20270202000000_client_anamnesis.sql", "20270202000100_client_anamnesis_storage.sql"], ["anamnesis-assert.sql"])],
  // P1-1 / M2: Ajanda "Genel" (danışansız) randevu → client outbox no-op; diğer 5 tablo fail-closed.
  ["pg:yh-null-client", ...pg([F("yh-null-client-fixture.sql"), M("20261218000200_yh_client_cdc_outbox.sql"),
    M("20261220000000_yh_client_outbox_activation_boundary.sql"), F("yh-null-client-acl-snapshot.sql")],
    ["20271001000100_yh_client_outbox_appointments_null_client.sql"], ["yh-null-client-assert.sql"])],
  // OTURUM MODELİ v2: admin web onay / tek admin Android / uzman limitleri / test istisnası / değişmezlik.
  ["pg:session-model", ...pg([F("session-model-fixture.sql")],
    ["20270129000200_user_sessions_expiry_touch.sql", "20271003200000_session_model_v2.sql", "20271003200100_admin_audit_session_actions.sql"],
    ["session-model-assert.sql"])],
  ["session-model-concurrency", "node", ["scripts/session-model/pg-concurrency.mjs"]],
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
