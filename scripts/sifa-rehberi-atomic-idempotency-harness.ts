/**
 * Şifa Rehberi — FAZ 1 ATOMİKLİK + IDEMPOTENCY regresyon harness'i.
 * (Ağ/DB YOK: statik kaynak-kontrat kontrolleri + model-seviyesi karar mantığı.)
 * Çalıştır: npx tsx scripts/sifa-rehberi-atomic-idempotency-harness.ts
 *
 * NOT: RPC gövdesi SQL'dir ve gerçek transaction davranışı YALNIZ izole bir Supabase
 * test DB'sinde uçtan uca doğrulanabilir (bkz. rapor: BLOCKED — CLI/Docker yok).
 * Bu harness, migration/route/client/page sözleşmelerini statik olarak kilitler ve
 * idempotency KARAR mantığını (aynı içerik → replay; farklı içerik → conflict)
 * model düzeyinde doğrular.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
  }
}
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MIGRATION = "supabase/migrations/20270108000000_sifa_create_healing_guide_with_sections.sql";
const migration = read(MIGRATION);
const route = read("app/api/sifa-rehberi/guides/route.ts");
const client = read("lib/sifa-rehberi/healingGuideLiveData.ts");
const page = read("app/sifa-rehberi/page.tsx");

// ── MIGRATION: güvenlik + atomiklik + idempotency sözleşmesi ──────────────────
ok(/create or replace function\s+public\.create_healing_guide_with_sections/i.test(migration), "migration: create RPC tanımlı");
ok(/security definer/i.test(migration), "migration: SECURITY DEFINER");
ok(/set search_path\s*=\s*''/i.test(migration), "migration: search_path='' (shadowing yok)");
ok(/revoke all on function public\.create_healing_guide_with_sections[\s\S]*from public/i.test(migration), "migration: REVOKE PUBLIC");
ok(/revoke all on function public\.create_healing_guide_with_sections[\s\S]*from anon/i.test(migration), "migration: REVOKE anon");
ok(/revoke all on function public\.create_healing_guide_with_sections[\s\S]*from authenticated/i.test(migration), "migration: REVOKE authenticated");
ok(/grant execute on function public\.create_healing_guide_with_sections[\s\S]*to service_role/i.test(migration), "migration: yalnız service_role EXECUTE");
// Atomiklik: guide + sections + idempotency TEK fonksiyon gövdesinde (implicit tx) + subtransaction guard.
ok(/insert into public\.healing_guides/i.test(migration), "migration: guide insert RPC içinde");
ok(/insert into public\.healing_guide_sections/i.test(migration), "migration: sections insert RPC içinde");
ok(/exception\s+when\s+unique_violation/i.test(migration), "migration: unique_violation race guard");
// Kolon allow-list + tenant zorlaması (enjeksiyon yok).
ok(/v_guide_id,\s*p_tenant_id,\s*v_name/i.test(migration), "migration: tenant_id ZORLA + name allow-list ile yazılır");
ok(/source_kind/.test(migration) && /expert_note/.test(migration) && /attention/.test(migration), "migration: provenance kolonları (source_kind/expert_note/attention) yazılır");
ok(/with ordinality/i.test(migration), "migration: sort_order ordinality'den deterministik");
// section_type allow-list + guard'lar.
ok(/invalid_section_type/.test(migration), "migration: section_type allow-list");
ok(/name_required/.test(migration), "migration: name zorunlu (defense-in-depth)");
// Idempotency defteri + karar.
ok(/create table if not exists public\.healing_guide_create_idempotency/i.test(migration), "migration: idempotency tablosu");
ok(/primary key\s*\(tenant_id,\s*request_id\)/i.test(migration), "migration: PK (tenant_id, request_id)");
ok(/enable row level security/i.test(migration), "migration: idempotency tablosu RLS açık");
ok(/idempotency_key_conflict/.test(migration), "migration: farklı içerik → conflict outcome");
ok(/idempotent_replay/.test(migration), "migration: aynı içerik → replay bayrağı");
ok(/references public\.healing_guides\s*\(id\)\s*on delete cascade/i.test(migration), "migration: idempotency guide_id FK cascade");
// Mevcut şemaya dokunmama.
ok(!/alter table public\.healing_guides/i.test(migration), "migration: healing_guides ALTER YOK (additive)");
ok(!/drop\s+/i.test(migration.split("ROLLBACK")[0] ?? migration), "migration: gövdede DROP yok (rollback notu hariç)");

// ── ROUTE: RPC kullanımı + conflict + tenant + eski akışın kaldırılması ───────
ok(/create_healing_guide_with_sections/.test(route), "route: atomik RPC çağrılıyor");
ok(/p_tenant_id:\s*tenantId/.test(route), "route: tenant server'dan (p_tenant_id)");
ok(/p_request_id/.test(route), "route: request_id RPC'ye geçiyor");
ok(/normalizeReplaceSections\s*\(/.test(route), "route: sections canonical serileştirici");
ok(/status:\s*409/.test(route) && /conflict:\s*true/.test(route), "route: idempotency çakışması → 409 conflict");
ok(/UUID_RE/.test(route), "route: request_id biçim guard'ı");
ok(!/from\(\s*["']healing_guides["']\s*\)\s*\.insert/.test(route), "route: eski elle guide insert kaldırıldı");
ok(!/from\(\s*["']healing_guide_sections["']\s*\)\.insert/.test(route), "route: eski elle sections insert kaldırıldı");
ok(/requireModuleAccess\(req,\s*["']sifa_rehberi["']\)/.test(route), "route: requireModuleAccess korunur");
ok(/is_demo_account/.test(route), "route: demo yazma bloğu korunur");

// ── CLIENT: idempotency alanları + conflict ───────────────────────────────────
ok(/idempotentReplay/.test(client), "client: idempotentReplay taşınır");
ok(/conflict/.test(client) && /409/.test(client), "client: 409 conflict ayrı sinyal");

// ── PAGE: request_id yaşam döngüsü ────────────────────────────────────────────
ok(/createRequestIdRef/.test(page), "page: create request_id ref");
ok(/request_id:\s*createRequestIdRef\.current/.test(page), "page: request_id create çağrısına geçiyor");
ok(/createRequestIdRef\.current\s*=\s*null/.test(page), "page: başarı/yeni-formda anahtar sıfırlanır (bilinçli mükerrer serbest)");

// ── MODEL-SEVİYESİ: idempotency karar mantığı (aynı içerik → replay; farklı → conflict) ──
// RPC md5(guide::text || '§' || sections::text) imzasını model düzeyinde taklit eder.
// (Gerçek jsonb kanonikleştirme SQL'dedir; burada KARAR tablosu doğrulanır.)
function sig(guide: unknown, sections: unknown): string {
  return createHash("md5").update(JSON.stringify(guide) + "§" + JSON.stringify(sections)).digest("hex");
}
type Decision = "replay" | "conflict" | "create";
function decide(storedHash: string | null, incomingHash: string): Decision {
  if (storedHash === null) return "create";
  return storedHash === incomingHash ? "replay" : "conflict";
}
const g = { name: "Migren", category: "Sinir" };
const s = [{ section_type: "reasons", mode: "tibbi", note: "x", expert_note: "gözlem", attention: "dikkat", source_kind: "Kitap" }];
const h1 = sig(g, s);
const h1again = sig({ name: "Migren", category: "Sinir" }, [{ section_type: "reasons", mode: "tibbi", note: "x", expert_note: "gözlem", attention: "dikkat", source_kind: "Kitap" }]);
const h2 = sig(g, [{ ...s[0], note: "DEĞİŞTİ" }]);
ok(h1 === h1again, "idempotency: aynı payload → aynı imza");
ok(h1 !== h2, "idempotency: farklı içerik → farklı imza");
ok(decide(null, h1) === "create", "karar: anahtar yok → create");
ok(decide(h1, h1again) === "replay", "karar: aynı anahtar + aynı içerik → replay (mükerrer YOK)");
ok(decide(h1, h2) === "conflict", "karar: aynı anahtar + farklı içerik → conflict (sessiz eski-kayıt DÖNMEZ)");

// ── SONUÇ ─────────────────────────────────────────────────────────────────────
if (fail > 0) {
  console.log("\nFAIL detayları:");
  for (const f of failures) console.log("  ❌", f);
}
console.log(`\nŞifa Rehberi ATOMİK+IDEMPOTENCY harness: ${pass} PASS / ${fail} FAIL`);
console.log(`OVERALL: ${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
