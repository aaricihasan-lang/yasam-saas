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

// GİRİŞ GÜVENLİĞİ F2 zinciri: ortak fixture tabanı ve migration sırası (F2-E kontrolleri).
const F2_BASE_FIXTURES = [F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"),
  F("session-f2c-fixture.sql"), F("session-f2d-fixture.sql"),
  M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"), M("20271003200100_admin_audit_session_actions.sql")];
const F2_ALL_MIGRATIONS = ["20280103000000_auth_session_hardening_f2a.sql", "20280103000100_auth_mfa_core_f2b.sql",
  "20280103000200_auth_session_insert_lock_f2b.sql", "20280103000300_auth_trusted_devices_qr_f2c.sql",
  "20280103000400_auth_email_otp_f2d.sql", "20280103000500_auth_account_recovery_f2e.sql"];
const F2F_MIGRATION = "20280103000600_auth_purge_audit_retention_f2f.sql";
const F2G_MIGRATION = "20280103000700_auth_owner_step_up_f2g.sql";
const F2H_MIGRATION = "20280103000800_auth_audit_retention_disposal_f2h.sql";

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
  ["httponly-h5", "npx", ["tsx", "scripts/final-hardening/httponly-h5.harness.ts"]],
  ["httponly-h6a", "npx", ["tsx", "scripts/final-hardening/httponly-h6a.harness.ts"]],
  ["httponly-h6b", "npx", ["tsx", "scripts/final-hardening/httponly-h6b.harness.ts"]],
  ["csp-c1v2", "npx", ["tsx", "scripts/final-hardening/csp-c1v2.harness.ts"]],
  ["csp-c3-mode", "npx", ["tsx", "scripts/final-hardening/csp-c3-mode.harness.ts"]],
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
  // Satış öncesi AŞAMA 1 (2026-10-20): AUTH-01 hedefli kilit DoS + demo/oturum/destek/kayıt sertleştirmesi.
  ["pg:auth-lockout-dos", ...pg([F("auth-fixture.sql"), F("auth-lockout-dos-fixture.sql")],
    ["20270129000000_auth_login_throttle.sql", "20270129000100_auth_grants_password_hash_only.sql", "20270129000200_user_sessions_expiry_touch.sql",
     "20271001000000_auth_password_session_hardening.sql", "20271120001000_auth_login_lockout_dos_hardening.sql"],
    ["auth-m1-assert.sql", "auth-lockout-dos-assert.sql"])],
  ["asama1-auth-demo", "npx", ["tsx", "scripts/final-hardening/asama1-auth-demo.harness.ts"]],
  // AŞAMA 1-B: stone-photos private (DY-05/DB-03), YH, migration adları (DB-02). Kişisel Arşiv kotası (DIJ-03) satış sonrasına ertelendi.
  ["pg:stone-photos-private", ...pg([F("stone-photos-private-fixture.sql")], ["20271120001100_stone_photos_private_bucket.sql"], ["stone-photos-private-assert.sql"])],
  ["pg:stone-photos-fresh", ...pg([], ["20271120001100_stone_photos_private_bucket.sql"], ["stone-photos-fresh-assert.sql"])],
  ["asama1-depolama-yh", "npx", ["tsx", "scripts/final-hardening/asama1-depolama-yh.harness.ts"]],
  ["migration-naming", "node", ["scripts/ci/migration-naming-check.mjs"]],
  // AŞAMA 1 devam (owner ek kararları 2026-10-20): M2 paylaşımlı politika, YH-02 benzersizlik.
  ["stone-photos-shared-policy", "node", ["scripts/final-hardening/stone-photos-shared-policy-check.mjs"]],
  ["yh-promote-unique", "node", ["scripts/final-hardening/yh-promote-unique-concurrency.mjs"]],
  // AŞAMA 1-C (M5'ten bağımsız): 12 tablo TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (SEC-NEW-03a), geniş politikalar (MI-P08).
  ["pg:db-privileges-m6m7", ...pg([F("db-privileges-fixture.sql")],
    ["20271120001500_revoke_client_truncate_references.sql", "20271120001600_drop_broad_client_policies.sql"],
    ["db-privileges-m6m7-assert.sql", "db-privileges-maintain-assert.sql"])],
  ["db-privileges-drift", "node", ["scripts/final-hardening/db-privileges-drift-check.mjs"]],
  ["migration-inventory", "node", ["scripts/final-hardening/migration-inventory-check.mjs"]],
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
  // GİRİŞ GÜVENLİĞİ F2-A: süreli yeni android oturumu (eski süresiz korunur) / pasif kullanıcı / token_hash / Owner işareti.
  //   Eski zincir fixture olarak (bir kez) → eski RPC ile süresiz android tohumu → F2-A migration (iki kez).
  ["pg:session-f2a", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), F("session-f2a-legacy-seed.sql")],
    ["20280103000000_auth_session_hardening_f2a.sql"],
    ["session-f2a-assert.sql"])],
  // GİRİŞ GÜVENLİĞİ F2-B: ortak MFA (challenge → finalize_login), DB seviyesinde atlatma engeli, INSERT kilidi.
  ["pg:session-f2b", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), M("20280103000000_auth_session_hardening_f2a.sql")],
    ["20280103000100_auth_mfa_core_f2b.sql", "20280103000200_auth_session_insert_lock_f2b.sql"],
    ["session-f2b-assert.sql"])],
  ["session-f2b-concurrency", "node", ["scripts/session-model/f2b-finalize-concurrency.mjs"]],
  ["session-f2e-concurrency", "node", ["scripts/session-model/f2e-recovery-concurrency.mjs"]],
  ["session-f2g-concurrency", "node", ["scripts/session-model/f2g-step-up-concurrency.mjs"]],
  ["session-f2h-concurrency", "node", ["scripts/session-model/f2h-retention-concurrency.mjs"]],
  // GİRİŞ GÜVENLİĞİ F2-C: güvenilir Android cihazı (Owner onayı + cihaz imzası) + QR onay durum makinesi.
  ["pg:session-f2c", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"), F("session-f2c-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), M("20280103000000_auth_session_hardening_f2a.sql"),
    M("20280103000100_auth_mfa_core_f2b.sql"), M("20280103000200_auth_session_insert_lock_f2b.sql")],
    ["20280103000300_auth_trusted_devices_qr_f2c.sql"],
    ["session-f2c-assert.sql"])],
  // GİRİŞ GÜVENLİĞİ F2-D: e-posta OTP (kod özeti, sınırlar, kilit, kota, Owner uyarısı, yalıtım, yetkiler).
  ["pg:session-f2d", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"), F("session-f2c-fixture.sql"),
    F("session-f2d-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), M("20280103000000_auth_session_hardening_f2a.sql"),
    M("20280103000100_auth_mfa_core_f2b.sql"), M("20280103000200_auth_session_insert_lock_f2b.sql"),
    M("20280103000300_auth_trusted_devices_qr_f2c.sql")],
    ["20280103000400_auth_email_otp_f2d.sql"],
    ["session-f2d-assert.sql"])],
  // GİRİŞ GÜVENLİĞİ F2-E: hesap kurtarma (kodlar, kilit/sınır, Owner kiti, e-posta/telefon değişimi, 72 saat,
  // atomiklik, yalıtım, yetkiler) + F2-D sözleşmesi 000500 üstünde aynen (f2d assert'i yeniden koşar).
  ["pg:session-f2e", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"), F("session-f2c-fixture.sql"),
    F("session-f2d-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), M("20280103000000_auth_session_hardening_f2a.sql"),
    M("20280103000100_auth_mfa_core_f2b.sql"), M("20280103000200_auth_session_insert_lock_f2b.sql"),
    M("20280103000300_auth_trusted_devices_qr_f2c.sql"), M("20280103000400_auth_email_otp_f2d.sql")],
    ["20280103000500_auth_account_recovery_f2e.sql"],
    ["session-f2e-assert.sql"])],
  ["pg:session-f2d-on-f2e", ...pg([F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"), F("session-f2c-fixture.sql"),
    F("session-f2d-fixture.sql"),
    M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"),
    M("20271003200100_admin_audit_session_actions.sql"), M("20280103000000_auth_session_hardening_f2a.sql"),
    M("20280103000100_auth_mfa_core_f2b.sql"), M("20280103000200_auth_session_insert_lock_f2b.sql"),
    M("20280103000300_auth_trusted_devices_qr_f2c.sql")],
    ["20280103000400_auth_email_otp_f2d.sql", "20280103000500_auth_account_recovery_f2e.sql"],
    ["session-f2d-assert.sql"])],
  // F2-A/B/C sözleşmeleri de bütün zincir (000500 dahil) üstünde aynen geçer.
  ...["f2a", "f2b", "f2c"].map((x) => [`pg:session-${x}-on-f2e`, ...pg([...F2_BASE_FIXTURES, ...(x === "f2a" ? [F("session-f2a-legacy-seed.sql")] : [])],
    F2_ALL_MIGRATIONS, [`session-${x}-assert.sql`])]),
  // YAYIN SIRASI: 000200 (service_role INSERT kilidi) EN SONDA. Ara durumda eski kod çalışır + MFA atlatılamaz;
  // 000200 sonrası yeni kodun bütün oturum yolları çalışır, doğrudan INSERT kapanır.
  // F2-F (000600): 000500 bu dosyadan sonra yeniden çalıştırılamaz (eski kolon adı) → önceki zincir FİXTURE (bir kez),
  // 000600 migration (iki kez). Ara durum: 000200 YOK; son durum: 000200 EN SONDA (000600'dan da sonra).
  ["pg:deploy-order-f2-pre", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.filter((m) => !m.startsWith("20280103000200")).map(M)],
    [F2F_MIGRATION], ["deploy-order-f2-pre-assert.sql"])],
  ["pg:deploy-order-f2-post", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.filter((m) => !m.startsWith("20280103000200")).map(M), M(F2F_MIGRATION)],
    ["20280103000200_auth_session_insert_lock_f2b.sql"], ["deploy-order-f2-post-assert.sql"])],
  // GİRİŞ GÜVENLİĞİ F2-F: silme × denetim saklama + Owner taze MFA; önceki satırların taşınması (seed) dahil.
  ["pg:session-f2f", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.map(M), F("session-f2f-seed.sql")], [F2F_MIGRATION], ["session-f2f-assert.sql"])],
  // F2-A…F2-D sözleşmeleri 000600 üstünde aynen (Owner taze-MFA sarmalayıcıları eski ret kodlarını korur).
  ...["f2a", "f2b", "f2c", "f2d"].map((x) => [`pg:session-${x}-on-f2f`, ...pg(
    [...F2_BASE_FIXTURES, ...(x === "f2a" ? [F("session-f2a-legacy-seed.sql")] : []), ...F2_ALL_MIGRATIONS.map(M)],
    [F2F_MIGRATION], [`session-${x}-assert.sql`])]),
  // GERİ DÖNÜŞ: bütün zincir + 000200 en sonda; ardından eski koda dönüş taklidi (erişim kaybı / MFA atlatma / oturumlar).
  ["pg:deploy-order-f2-rollback", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.filter((m) => !m.startsWith("20280103000200")).map(M), M(F2F_MIGRATION)],
    [F2G_MIGRATION, "20280103000200_auth_session_insert_lock_f2b.sql"], ["deploy-order-f2-rollback-assert.sql"])],
  // GİRİŞ GÜVENLİĞİ F2-G: Owner işleme özel yeniden doğrulama (çalınmış taze oturum saldırısı) + saklama politikası kaydı.
  ["pg:session-f2g", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.map(M), M(F2F_MIGRATION)], [F2G_MIGRATION], ["session-f2g-assert.sql"])],
  // Owner kritik işlemlerine DOKUNMAYAN önceki sözleşmeler 000700 üstünde aynen (F2-C / F2-E / F2-F'nin Owner onay
  // senaryoları bilinçli olarak değişti — kanıt şartı; bunlar session-f2g'de yeniden sınanır).
  ...["f2a", "f2b", "f2d"].map((x) => [`pg:session-${x}-on-f2g`, ...pg(
    [...F2_BASE_FIXTURES, ...(x === "f2a" ? [F("session-f2a-legacy-seed.sql")] : []), ...F2_ALL_MIGRATIONS.map(M), M(F2F_MIGRATION)],
    [F2G_MIGRATION], [`session-${x}-assert.sql`])]),
  // GİRİŞ GÜVENLİĞİ F2-H: denetim kayıtları kontrollü imha / anonimleştirme (sentetik süre / gerekçe).
  ["pg:session-f2h", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.map(M), M(F2F_MIGRATION), M(F2G_MIGRATION)], [F2H_MIGRATION], ["session-f2h-assert.sql"])],
  // F2-G sözleşmesi (Owner kanıtı, saklama politikası kaydı) 000800 üstünde aynen. (F2-F'nin Owner senaryoları
  // 000700'de bilinçli olarak değişti → session-f2f yalnız kendi zincirinde koşar.)
  ["pg:session-f2g-on-f2h", ...pg([...F2_BASE_FIXTURES, ...F2_ALL_MIGRATIONS.map(M), M(F2F_MIGRATION)], [F2G_MIGRATION, F2H_MIGRATION], ["session-f2g-assert.sql"])],
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
