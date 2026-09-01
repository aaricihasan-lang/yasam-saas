/**
 * Yaşam Hafızası™ — Event-Driven Outbox Webhook Bridge harness.
 * ====================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, AĞ'SIZ. Gerçek Supabase / Inngest cloud'a
 * BAĞLANMAZ. GERÇEK modül import edilir (kopya YOK):
 *   - lib/yasam-hafizasi/outbox/webhookBridge.ts  (decideWebhookAction — LOOP KORUMASI)
 *   - lib/inngest/events.ts                        (canonical event adları)
 *
 * server-only route (app/api/internal/yh/outbox-webhook/route.ts) IMPORT EDİLMEZ;
 * yalnız METİN olarak statik doğrulanır (R kategorisi — güvenlik yüzeyi).
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-outbox-webhook-harness.mjs
 * Herhangi bir FAIL → exit 1. Son satır: `yh-outbox-webhook-harness: X/X PASS`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decideWebhookAction } from "../lib/yasam-hafizasi/outbox/webhookBridge.ts";
import {
  YH_OUTBOX_ENQUEUED_EVENT,
  YH_CLIENT_OUTBOX_ENQUEUED_EVENT,
} from "../lib/inngest/events.ts";

let pass = 0;
let fail = 0;
const fails = [];
const cats = {};
function check(cat, desc, cond) {
  cats[cat] = (cats[cat] ?? 0) + 1;
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    fails.push(`[${cat}] ${desc}`);
    console.error(`  FAIL  [${cat}] ${desc}`);
  }
}

const PRO = "yasam_hafizasi_outbox";
const CLI = "yasam_hafizasi_client_outbox";

// ── A: canonical event adları ────────────────────────────────────────────────
check("A", "1 professional event adı canonical", YH_OUTBOX_ENQUEUED_EVENT === "yasam-hafizasi/outbox.enqueued");
check("A", "2 client event adı canonical", YH_CLIENT_OUTBOX_ENQUEUED_EVENT === "yasam-hafizasi/client-outbox.enqueued");
check("A", "3 iki event adı farklı (fiziksel ayrım)", YH_OUTBOX_ENQUEUED_EVENT !== YH_CLIENT_OUTBOX_ENQUEUED_EVENT);

// ── B: payload doğrulama / fail-closed reddetme ──────────────────────────────
check("B", "4 non-object payload → reject", decideWebhookAction(null).kind === "reject" && decideWebhookAction("x").kind === "reject");
check("B", "5 unexpected schema → reject", decideWebhookAction({ schema: "auth", table: PRO, type: "INSERT" }).reason === "unexpected-schema");
check("B", "6 missing table → reject", decideWebhookAction({ schema: "public", type: "INSERT" }).reason === "missing-table");
check("B", "7 unknown table → reject", decideWebhookAction({ schema: "public", table: "stones", type: "INSERT" }).reason === "unknown-table");
check("B", "8 missing type → reject", decideWebhookAction({ schema: "public", table: PRO }).reason === "missing-type");
check("B", "9 unexpected type → reject", decideWebhookAction({ schema: "public", table: PRO, type: "SELECT" }).reason === "unexpected-type");
check("B", "10 reject status daima 400", (() => {
  const r = decideWebhookAction({ table: "nope", type: "INSERT" });
  return r.kind === "reject" && r.status === 400;
})());

// ── C: INSERT enqueue → doğru event GÖNDER ───────────────────────────────────
{
  const d = decideWebhookAction({ schema: "public", table: PRO, type: "INSERT", record: { id: "a", event_version: 1 }, old_record: null });
  check("C", "11 professional INSERT → send + professional event", d.kind === "send" && d.event === YH_OUTBOX_ENQUEUED_EVENT && d.table === PRO);
}
{
  const d = decideWebhookAction({ schema: "public", table: CLI, type: "INSERT", record: { id: "a", event_version: 1 }, old_record: null });
  check("C", "12 client INSERT → send + client event", d.kind === "send" && d.event === YH_CLIENT_OUTBOX_ENQUEUED_EVENT && d.table === CLI);
}
check("C", "13 INSERT schema alanı opsiyonel (yoksa da kabul)", decideWebhookAction({ table: PRO, type: "INSERT", record: { event_version: 1 } }).kind === "send");
check("C", "14 INSERT queue durumundan bağımsız (idempotent karar; duplicate webhook güvenli)", (() => {
  const p = { schema: "public", table: PRO, type: "INSERT", record: { event_version: 7 }, old_record: null };
  const a = decideWebhookAction(p);
  const b = decideWebhookAction(p);
  return a.kind === "send" && b.kind === "send" && a.event === b.event;
})());

// ── D: UPDATE — LOOP KORUMASI (event_version delta) ──────────────────────────
{
  // Gerçek re-enqueue: event_version arttı → GÖNDER.
  const d = decideWebhookAction({ schema: "public", table: PRO, type: "UPDATE", record: { event_version: 2 }, old_record: { event_version: 1 } });
  check("D", "15 UPDATE (version 1→2) gerçek re-enqueue → send", d.kind === "send" && d.reason === "reenqueue-version-bump");
}
{
  // WORKER STATE TRANSITION: pending→processing, event_version DEĞİŞMEDİ → NO-OP (loop imkânsız).
  const d = decideWebhookAction({ schema: "public", table: PRO, type: "UPDATE", record: { status: "processing", event_version: 5 }, old_record: { status: "pending", event_version: 5 } });
  check("D", "16 worker claim transition (version aynı) → NO-OP (LOOP KORUMASI)", d.kind === "noop");
}
{
  // WORKER complete: processing→succeeded, version aynı → NO-OP.
  const d = decideWebhookAction({ schema: "public", table: CLI, type: "UPDATE", record: { status: "succeeded", event_version: 9 }, old_record: { status: "processing", event_version: 9 } });
  check("D", "17 worker complete transition (version aynı) → NO-OP (LOOP KORUMASI)", d.kind === "noop");
}
{
  // WORKER fail/backoff: processing→pending, version aynı → NO-OP.
  const d = decideWebhookAction({ schema: "public", table: PRO, type: "UPDATE", record: { status: "pending", event_version: 3 }, old_record: { status: "processing", event_version: 3 } });
  check("D", "18 worker fail/backoff transition (version aynı) → NO-OP", d.kind === "noop");
}
check("D", "19 UPDATE version azalış (imkânsız/bozuk) → NO-OP fail-safe", decideWebhookAction({ table: PRO, type: "UPDATE", record: { event_version: 1 }, old_record: { event_version: 4 } }).kind === "noop");
check("D", "20 UPDATE old_record.event_version yok → NO-OP fail-safe", decideWebhookAction({ table: PRO, type: "UPDATE", record: { event_version: 4 }, old_record: {} }).kind === "noop");
check("D", "21 UPDATE record.event_version yok → NO-OP fail-safe", decideWebhookAction({ table: PRO, type: "UPDATE", record: {}, old_record: { event_version: 1 } }).kind === "noop");
check("D", "22 bigint string event_version ('1'→'2') → send", decideWebhookAction({ table: PRO, type: "UPDATE", record: { event_version: "2" }, old_record: { event_version: "1" } }).kind === "send");
check("D", "23 event_version eşit → NO-OP (no bump)", decideWebhookAction({ table: PRO, type: "UPDATE", record: { event_version: 5 }, old_record: { event_version: 5 } }).kind === "noop");

// ── E: DELETE → NO-OP (yeni iş değil) ────────────────────────────────────────
check("E", "24 DELETE → NO-OP", decideWebhookAction({ schema: "public", table: PRO, type: "DELETE", record: null, old_record: { event_version: 2 } }).reason === "outbox-row-delete-ignored");

// ── R: ROUTE GÜVENLİK YÜZEYİ (statik metin) ──────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const routeSrc = readFileSync(join(repo, "app/api/internal/yh/outbox-webhook/route.ts"), "utf8");

check("R", "25 yalnız POST export (GET/PUT/DELETE/PATCH export YOK)", /export\s+async\s+function\s+POST/.test(routeSrc) && !/export\s+(async\s+)?function\s+(GET|PUT|DELETE|PATCH)/.test(routeSrc));
check("R", "26 runtime nodejs", /export\s+const\s+runtime\s*=\s*"nodejs"/.test(routeSrc));
check("R", "27 server-only import", /^import\s+"server-only";/m.test(routeSrc));
check("R", "28 constant-time compare (timingSafeEqual)", /timingSafeEqual/.test(routeSrc));
check("R", "29 secret server-only env (NEXT_PUBLIC değil)", /process\.env\[SECRET_ENV\]/.test(routeSrc) && /YH_OUTBOX_WEBHOOK_SECRET/.test(routeSrc) && !/NEXT_PUBLIC_.*WEBHOOK/.test(routeSrc));
check("R", "30 env yoksa 503 fail-closed", /status:\s*503/.test(routeSrc));
check("R", "31 yetkisiz → 401", /status:\s*401/.test(routeSrc));
check("R", "32 malformed json → 400", /status:\s*400/.test(routeSrc));
check("R", "33 inngest.send başarısız → 502", /status:\s*502/.test(routeSrc));
check("R", "34 minimum event data (source: supabase-webhook; PII yok)", /source:\s*"supabase-webhook"/.test(routeSrc));
check("R", "35 karar saf modülden (decideWebhookAction import)", /decideWebhookAction/.test(routeSrc) && /webhookBridge/.test(routeSrc));
// Ham payload/secret loglama YOK: console çağrılarında payload/record/old_record/provided/expected argümanı geçmemeli.
check("R", "36 ham payload/secret loglanmıyor", !/console\.[a-z]+\([^)]*\b(payload|record|old_record|provided|expected)\b/.test(routeSrc));
check("R", "37 route inngest.send kullanıyor (event-driven dispatch)", /inngest\.send\(/.test(routeSrc));

// ── S: WORKER SÖZLEŞMESİ (statik; event-driven + safety cron + semantik korundu) ──
const proWorker = readFileSync(join(repo, "lib/inngest/functions/yhOutboxWorker.ts"), "utf8");
const cliWorker = readFileSync(join(repo, "lib/inngest/functions/yhClientOutboxWorker.ts"), "utf8");
for (const [name, w, ev, safety] of [
  ["professional", proWorker, "YH_OUTBOX_EVENT_NAME", "YH_OUTBOX_SAFETY_CRON"],
  ["client", cliWorker, "YH_CLIENT_OUTBOX_EVENT_NAME", "YH_CLIENT_OUTBOX_SAFETY_CRON"],
]) {
  check("S", `38 ${name} 15dk safety cron`, new RegExp(`${safety}\\s*=\\s*"\\*/15 \\* \\* \\* \\*"`).test(w));
  check("S", `39 ${name} event + safety cron trigger array`, new RegExp(`triggers:\\s*\\[\\s*\\{\\s*event:\\s*${ev}\\s*\\}\\s*,\\s*\\{\\s*cron:\\s*${safety}\\s*\\}\\s*\\]`).test(w));
  check("S", `40 ${name} her-dakika cron string literal YOK`, !/"\*\s\*\s\*\s\*\s\*"/.test(w));
  check("S", `41 ${name} processing semantiği korundu (sweep+claim+enable gate)`, /sweep/.test(w) && /claim/i.test(w) && /=== "true"/.test(w) && /retries:\s*YH_(CLIENT_)?OUTBOX_RETRIES/.test(w));
  check("S", `42 ${name} triggerSource yalnız gözlemlenebilirlik`, /triggerSource/.test(w));
}

// ─── Özet ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log("");
console.log("── Kategori dağılımı ──");
for (const c of Object.keys(cats).sort()) console.log(`  ${c}: ${cats[c]} assertion`);
if (fails.length > 0) {
  console.log("");
  console.log("── FAIL ──");
  for (const f of fails) console.log(`  ${f}`);
}
console.log("");
console.log(`yh-outbox-webhook-harness: ${pass}/${total} PASS`);
if (fail > 0) process.exit(1);
