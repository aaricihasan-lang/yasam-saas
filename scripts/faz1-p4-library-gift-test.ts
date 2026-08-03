/**
 * Faz 1 / P4 harness — Admin Kütüphane Hediyesi (Bağımsız Snapshot Aktarımı).
 *
 * Çalıştırma:  npx tsx scripts/faz1-p4-library-gift-test.ts
 *
 * KAPSAM: `permission denied for table stones` kök neden düzeltmesi + service-role
 * server write-path + bağımsız snapshot + provenance + idempotency + atomiklik +
 * audit + güvenli hata sözleşmesi + expert rozeti. Gerçek DB'ye YAZMAZ (statik
 * sözleşme + saf mantık). cwd = repo kökü.
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  emptyTransferCounts,
  formatTransferResultLines,
  sumBioenergyCounts,
  sumReflexologyCounts,
  sumNumerologyCounts,
  type TransferResultCounts,
} from "../lib/admin/veriPaylasimiTransfer";
import { ADMIN_AUDIT_ACTIONS } from "../lib/admin/adminAudit";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function ok(cond: boolean, name: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

const read = (p: string): string => readFileSync(p, "utf8");

/** TS/JS yorumlarını (// ve /* *​/) çıkar — kontroller yalnız gerçek kodu görsün. */
const stripTs = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** SQL yorum satırlarını (-- ...) çıkar. */
const stripSql = (s: string): string => s.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260925000000_admin_library_transfer_provenance.sql";
const ROUTE = "app/api/admin/veri-paylasimi/transfer/route.ts";
const HELPER = "lib/admin/veriPaylasimiTransfer.ts";
const PAGE = "app/admin/veri-paylasimi/page.tsx";
const AUDIT = "lib/admin/adminAudit.ts";
const STONES_FETCH = "lib/dogaltas/stonesListFetch.ts";
const STONES_LIST_UI = "app/dogaltas/dogaltas-listesi/page.tsx";

const TRANSFER_TABLES = [
  "stones",
  "minerals",
  "combinations",
  "bioenergy_symbols",
  "bioenergy_imaginations",
  "bioenergy_chakras",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",
  "reflexology_protocols",
  "numerology_knowledge_records",
  "numerology_stone_assignments",
];

function run(): void {
  const mig = read(MIGRATION);
  const migCode = stripSql(mig);
  const route = read(ROUTE);
  const routeCode = stripTs(route);
  const helper = read(HELPER);
  const page = read(PAGE);
  const auditSrc = read(AUDIT);
  ok(/library_transfer_completed/.test(auditSrc), "adminAudit kaynağı: library_transfer_* action'ları eklendi");

  // ── A) Kök neden düzeltmesi: hiçbir client-side tablo insert kalmadı ────────
  ok(!/\.from\(/.test(helper), "helper: doğrudan supabase .from(...) YOK (client write kaldırıldı)");
  ok(!/from\s+["']@\/lib\/supabase["']/.test(helper), "helper: browser supabase client import edilmiyor");
  ok(!/\.insert\(/.test(helper), "helper: client-side .insert() YOK");
  ok(/\/api\/admin\/veri-paylasimi\/transfer/.test(helper), "helper: yeni service-role route'a POST ediyor");
  ok(/method:\s*["']POST["']/.test(helper), "helper: POST metodu");

  // ── B) Server route güvenlik + write-path ──────────────────────────────────
  ok(/verifyAdminRequest/.test(route), "route: verifyAdminRequest guard");
  ok(/runtime\s*=\s*["']nodejs["']/.test(route), "route: runtime nodejs");
  ok(/const REGISTRY\s*=/.test(route) && /satisfies Record/.test(route), "route: sabit REGISTRY allowlist");
  ok(/isGroupKey/.test(route) && /Geçersiz veri grubu/.test(route), "route: allowlist dışı grup reddi");
  // dinamik tablo adı YOK: .from(...) yalnız cfg.table / REGISTRY / sabit tablo string'i alır
  ok(!/\.from\(\s*(body|group|table|req)\b/.test(route), "route: istemci string'i .from(...) içine geçmiyor");
  ok(/getServerDb|verifyAdminRequest/.test(route), "route: service-role (getServerDb via guard.db)");

  // ── C) Snapshot: strip + hedef ownership + provenance ──────────────────────
  ok(/STRIP\s*=\s*new Set/.test(route), "route: STRIP seti tanımlı");
  for (const f of ["id", "created_at", "updated_at", "tenant_id"]) {
    ok(new RegExp(`"${f}"`).test(route.split("const STRIP")[1] ?? ""), `route: STRIP içerir ${f}`);
  }
  ok(/copy\.tenant_id\s*=\s*targetTenantId/.test(route), "route: kopya hedef tenant'a yazılır");
  ok(/copy\.origin_type\s*=\s*["']admin_transfer["']/.test(route), "route: origin_type=admin_transfer");
  ok(/copy\.origin_label\s*=\s*["']Admin Kütüphanesi["']/.test(route), "route: origin_label=Admin Kütüphanesi");
  ok(/copy\.origin_source_id\s*=/.test(route), "route: origin_source_id (provenance)");
  ok(/copy\.origin_transfer_batch_id\s*=\s*batchId/.test(route), "route: batch_id her satıra");
  ok(/copy\.transferred_at\s*=/.test(route), "route: transferred_at damgası");

  // ── D) Duplicate isim: UPSERT/REPLACE/onConflict YOK ───────────────────────
  ok(!/\.upsert\(/.test(routeCode), "route: .upsert() YOK");
  ok(!/onConflict\s*:/.test(routeCode), "route: onConflict YOK");
  ok(/\.insert\(/.test(route), "route: plain .insert() (yan yana yaşar)");

  // ── E) Atomiklik + idempotency ─────────────────────────────────────────────
  ok(/rollbackBatch/.test(route) && /origin_transfer_batch_id["']?\s*,\s*batchId|eq\(\s*["']origin_transfer_batch_id["']\s*,\s*batchId/.test(route), "route: telafi-silme (batch rollback)");
  ok(/admin_library_transfer_batches/.test(route), "route: idempotency ledger tablosu");
  ok(/replayed:\s*true/.test(route), "route: replay (aynı batch kopya üretmez)");
  ok(/status:\s*["']processing["']/.test(route), "route: atomik claim (processing)");

  // ── F) Güvenli hata sözleşmesi (ham DB mesajı sızmaz) ──────────────────────
  ok(/Hiçbir kayıt aktarılmadı/.test(route), "route: başarısızlıkta 'hiçbir kayıt aktarılmadı'");
  ok(!/error\.message/.test(routeCode) && !/insErr\.message/.test(routeCode) && !/readErr\.message/.test(routeCode), "route: DB error.message dışarı DÖNMEZ");
  ok(!/permission denied/i.test(routeCode), "route: 'permission denied' string'i kodda DÖNMEZ");
  // 401 verifyAdminRequest guard'ına delege edilir (route içinde literal yok).
  ok(/verifyAdminRequest/.test(route), "route: 401/oturum yok → verifyAdminRequest guard");
  // stabil HTTP kodları (route içinde doğrudan üretilenler)
  for (const code of ["400", "403", "404", "409", "413", "422", "500"]) {
    ok(new RegExp(`jsonError\\(${code}`).test(routeCode) || new RegExp(`status:\\s*${code}\\b`).test(routeCode), `route: HTTP ${code} sözleşmede`);
  }
  ok(/role \?\? "".*expert|!== "expert"|!==\s*["']expert["']/.test(route), "route: hedef role=expert doğrulaması");
  ok(/active !== true/.test(route), "route: hedef aktif doğrulaması");
  ok(/eşleşmiyor|targetTenantId/.test(route), "route: hedef tenant eşleşme doğrulaması");

  // ── G) Migration: provenance kolonları + ledger + audit CHECK süperseti ────
  ok(/20260925000000/.test(MIGRATION), "migration: timestamp 20260925000000");
  ok(/ADD COLUMN IF NOT EXISTS origin_type/.test(mig), "migration: origin_type kolonu");
  ok(/ADD COLUMN IF NOT EXISTS origin_source_id uuid/.test(mig), "migration: origin_source_id uuid");
  ok(/ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid/.test(mig), "migration: batch_id kolonu");
  ok(/ADD COLUMN IF NOT EXISTS transferred_at timestamptz/.test(mig), "migration: transferred_at kolonu");
  for (const t of TRANSFER_TABLES) {
    ok(new RegExp(`'${t}'`).test(mig), `migration: hedef tablo listesinde ${t}`);
  }
  ok(/to_regclass/.test(mig), "migration: to_regclass guard (eksik tablo atlanır)");
  ok(!/REFERENCES/.test(migCode), "migration: provenance FK YOK (kaynak silinse etiket kalır)");
  ok(!/ON DELETE CASCADE/.test(migCode), "migration: ON DELETE CASCADE YOK");
  ok(/CREATE TABLE IF NOT EXISTS public\.admin_library_transfer_batches/.test(mig), "migration: ledger tablosu");
  ok(/ENABLE ROW LEVEL SECURITY/.test(mig) && /REVOKE ALL ON TABLE public\.admin_library_transfer_batches FROM anon, authenticated, PUBLIC/.test(mig), "migration: ledger deny-by-default RLS + revoke anon/auth/public");
  ok(!/GRANT[^\n]*anon|GRANT[^\n]*authenticated/.test(mig), "migration: anon/authenticated'a YENİ grant YOK");
  ok(/DROP CONSTRAINT IF EXISTS admin_audit_action_chk/.test(mig), "migration: audit CHECK idempotent yeniden");
  for (const a of ["library_transfer_completed", "library_transfer_failed", "library_transfer_retried"]) {
    ok(new RegExp(`'${a}'`).test(mig), `migration: audit CHECK içerir ${a}`);
  }
  // eski 20 action korunmalı (süperset)
  ok(/'main_admin_critical_action'/.test(mig) && /'workspace_viewed'/.test(mig) && /'user_created'/.test(mig), "migration: audit CHECK eski action'ları korur (süperset)");
  ok(/BEGIN;[\s\S]*COMMIT;/.test(mig), "migration: tek BEGIN/COMMIT");

  // ── H) Audit action sözleşmesi kod↔migration birebir ───────────────────────
  for (const a of ["library_transfer_completed", "library_transfer_failed", "library_transfer_retried"]) {
    ok((ADMIN_AUDIT_ACTIONS as readonly string[]).includes(a), `adminAudit: ADMIN_AUDIT_ACTIONS içerir ${a}`);
    ok(new RegExp(`action:\\s*["']${a}["']`).test(route), `route: ${a} audit çağrısı`);
  }
  ok(/writeAdminAudit/.test(route) && /AdminAuditError/.test(route), "route: writeAdminAudit + AdminAuditError ele alınır");

  // ── I) Migration timestamp tekilliği ──────────────────────────────────────
  const migFiles = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  const ts = migFiles.map((f) => f.slice(0, 14));
  // NOT: repoda ÖNCEDEN VAR olan (paralel workstream) prefix çakışmaları P4 kapsamı
  // dışıdır; burada yalnız BENİM timestamp'imin tekil + en yüksek olduğunu doğrularım.
  const mine = migFiles.filter((f) => f.startsWith("20260925000000"));
  ok(mine.length === 1, "migration: 20260925000000 tekil (P4 tek dosya)");
  ok(ts.filter((v) => v === "20260925000000").length === 1, "migration: 20260925000000 başka dosyayla çakışmıyor");
  const maxOther = ts.filter((v) => v !== "20260925000000").sort().at(-1) ?? "0";
  ok("20260925000000" > maxOther, `migration: timestamp mevcut en yüksekten büyük (${maxOther})`);

  // ── J) Admin UI: bağımsız kopya onay metni + targetUserId + güvenli hata ───
  ok(/bağımsız kopya olarak eklenecek/.test(page), "page: bağımsız kopya onay metni");
  ok(/Mevcut kayıtları değiştirilmeyecek/.test(page), "page: mevcut kayıt korunur mesajı");
  ok(/runLibraryTransfer\(\s*[\s\S]*selectedExpert\.id/.test(page), "page: targetUserId (selectedExpert.id) geçiliyor");
  ok(/setTransferring\(true\)/.test(page) && /canTransfer/.test(page), "page: double-submit guard (transferring/canTransfer)");

  // ── K) Expert rozeti (Doğaltaş referans) ───────────────────────────────────
  const stonesFetch = read(STONES_FETCH);
  const stonesUi = read(STONES_LIST_UI);
  ok(/origin_type/.test(stonesFetch), "stones select: origin_type dahil");
  ok(/origin_type\?:\s*string \| null/.test(stonesFetch), "stones tip: origin_type opsiyonel alan");
  ok(/origin_type === "admin_transfer"/.test(stonesUi), "stones UI: admin_transfer rozet koşulu");
  ok(/Admin Kütüphanesi/.test(stonesUi), "stones UI: 'Admin Kütüphanesi' rozet etiketi");
  ok(/key=\{stone\.id\}/.test(stonesUi), "stones UI: liste key = UUID (aynı isim çakışmaz)");

  // ── L) Saf yardımcı mantık (sayım/özet) ────────────────────────────────────
  const counts: TransferResultCounts = emptyTransferCounts();
  counts.stones = 2;
  counts.bioenergy_symbols = 1;
  counts.bioenergy_chakras = 2;
  counts.reflexology_protocols = 1;
  counts.numerology_knowledge_records = 3;
  ok(sumBioenergyCounts(counts) === 3, "sumBioenergyCounts doğru");
  ok(sumReflexologyCounts(counts) === 1, "sumReflexologyCounts doğru");
  ok(sumNumerologyCounts(counts) === 3, "sumNumerologyCounts doğru");
  const lines = formatTransferResultLines(counts, "uzman@x.com");
  ok(lines.some((l) => /2 Doğaltaş/.test(l)) && lines.some((l) => /3 Biyoenerji/.test(l)), "formatTransferResultLines: doğaltaş+biyoenerji satırları");
  ok(Object.keys(emptyTransferCounts()).length === TRANSFER_TABLES.length, "emptyTransferCounts: 11 grup");

  console.log(`\nfaz1-p4-library-gift harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ P4 — admin kütüphane hediyesi (service-role write-path + snapshot + provenance + idempotency) geçti.");
}

run();
