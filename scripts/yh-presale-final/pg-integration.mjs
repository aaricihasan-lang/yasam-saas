#!/usr/bin/env node
/**
 * Yaşam Hafızası™ satış öncesi nihai — GERÇEK PostgreSQL (embedded, geçici) entegrasyon testi.
 * Prod'a temas YOK. Minimal legacy fixture → mevcut YH migration zinciri → M1/M2/M3 → assert'ler.
 * `--twice` ile tüm migration'lar ikinci kez uygulanır (idempotency).
 * Çalıştırma: node scripts/yh-presale-final/pg-integration.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = (f) => `supabase/migrations/${f}`;
const F = (f) => `scripts/yh-presale-final/fixtures/${f}`;

const migrations = [
  M("20260710000000_yasam_hafizasi_index.sql"),
  M("20260712000000_yasam_hafizasi_lexical_infra.sql"),
  M("20260724000000_yh_search_candidates_rpc.sql"),
  M("20260815000000_yasam_hafizasi_outbox.sql"),
  M("20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql"),
  M("20260901000000_yasam_hafizasi_reconcile_enqueue.sql"),
  M("20260923000000_yasam_hafizasi_client_memory_core.sql"),
  M("20260925000000_yh_deferred_sources_foundation.sql"),
  M("20260927000000_yh_source_activation_control.sql"),
  M("20261210000000_yh_worker_v2_shared_section_sources.sql"),
  F("mid-prod-activation.sql"),
  M("20261212000000_yh_worker_v2_null_sentinel_fix.sql"),
  M("20261218000000_yh_client_index_private_reclassify.sql"),
  M("20261218000100_yh_search_tenant_client_candidates.sql"),
  M("20261218000200_yh_client_cdc_outbox.sql"),
  M("20261218000300_yh_client_outbox_state_machine.sql"),
  M("20261220000000_yh_client_outbox_activation_boundary.sql"),
  M("20271001000100_yh_client_outbox_appointments_null_client.sql"),
  M("20271004000000_yh_presale_final_infra.sql"),
  M("20271004000100_yh_beslenme_professional_cdc.sql"),
  M("20271004000200_yh_presale_final_activation.sql"),
];

const args = ["scripts/final-hardening/pg-migration-check.mjs", "--fixture", F("base.sql")];
for (const m of migrations) args.push("--migration", m);
if (process.argv.includes("--twice")) args.push("--twice");
args.push("--assert", F("assert-replay-outcome.sql"), "--assert", F("assert-search-beslenme.sql"));

const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 1);
