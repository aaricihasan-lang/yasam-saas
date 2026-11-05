/**
 * H1 (owner 2026-11-05 kesin kararı) — sağlık notu GERÇEK PostgreSQL aramasında bulunur.
 * Geçici embedded-postgres (prod'a SIFIR temas): mevcut YH migration zinciri → gerçek index
 * oluşturucu (buildClientIndexUnit + toClientIndexDbRow) çıktısı → gerçek search_tsv tetikleyicisi →
 * gerçek arama RPC'leri (danışan + tenant geneli). Sorgu = uygulamanın kendi tsquery hattı.
 *
 *   npx tsx scripts/dy-canli-denetim/h1-search-pg.harness.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { YH_CLIENT_INDEX_SOURCES } from "../../lib/yasam-hafizasi/client/clientSources";
import { buildClientIndexUnit, toClientIndexDbRow } from "../../lib/yasam-hafizasi/client/clientIndexUnit";
import { buildRetrievalDescriptor } from "../../lib/yasam-hafizasi/search/queryPipeline";

const M = (f: string) => `supabase/migrations/${f}`;
const F = (f: string) => `scripts/yh-presale-final/fixtures/${f}`;
const CHAIN = [
  "20260710000000_yasam_hafizasi_index.sql", "20260712000000_yasam_hafizasi_lexical_infra.sql",
  "20260724000000_yh_search_candidates_rpc.sql", "20260815000000_yasam_hafizasi_outbox.sql",
  "20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql", "20260901000000_yasam_hafizasi_reconcile_enqueue.sql",
  "20260923000000_yasam_hafizasi_client_memory_core.sql", "20260925000000_yh_deferred_sources_foundation.sql",
  "20260927000000_yh_source_activation_control.sql", "20261210000000_yh_worker_v2_shared_section_sources.sql",
].map(M).concat([F("mid-prod-activation.sql")]).concat([
  "20261212000000_yh_worker_v2_null_sentinel_fix.sql", "20261218000000_yh_client_index_private_reclassify.sql",
  "20261218000100_yh_search_tenant_client_candidates.sql", "20261218000200_yh_client_cdc_outbox.sql",
  "20261218000300_yh_client_outbox_state_machine.sql", "20261220000000_yh_client_outbox_activation_boundary.sql",
  "20271001000100_yh_client_outbox_appointments_null_client.sql", "20271004000000_yh_presale_final_infra.sql",
  "20271004000100_yh_beslenme_professional_cdc.sql", "20271004000200_yh_presale_final_activation.sql",
  // M6 adayı da zincirde (idempotency --twice ile); vault/pg_net yok → yalnız şema adımı.
  "20271010000000_yh_outbox_webhook_vault_secret.sql", "20271231000100_yh_client_outbox_webhook_trigger.sql",
].map(M));

const TA = "a1a1a1a1-0000-4000-8000-00000000000a";
const TB = "b2b2b2b2-0000-4000-8000-00000000000b";
const C1 = "c1c1c1c1-0000-4000-8000-000000000001"; // TA — migren / baş ağrısı
const C2 = "c2c2c2c2-0000-4000-8000-000000000002"; // TA — bel fıtığı
const C3 = "c3c3c3c3-0000-4000-8000-000000000003"; // TB — migren (başka tenant)
const N1 = "d1d1d1d1-0000-4000-8000-000000000001";
const N2 = "d2d2d2d2-0000-4000-8000-000000000002";
const N3 = "d3d3d3d3-0000-4000-8000-000000000003";
const S1 = "e1e1e1e1-0000-4000-8000-000000000001";

const cfg = (k: string) => YH_CLIENT_INDEX_SOURCES.find((s) => s.sourceKey === k)!;
const units = [
  [cfg("danisan:notes"), { id: N1, saglik_notu: "Migren atakları ve baş ağrısı; hekim takibinde.", adres: "ZZ Mah. Sokak No:5", oneriler: "Günlük su tüketimi artırılmalı.", notlar: "" }, TA, C1],
  [cfg("danisan:notes"), { id: N2, saglik_notu: "Bel fıtığı öyküsü.", adres: null, oneriler: null, notlar: "" }, TA, C2],
  [cfg("danisan:notes"), { id: N3, saglik_notu: "Migren (başka tenant).", adres: null, oneriler: null, notlar: "" }, TB, C3],
  [cfg("danisan:sessions"), { id: S1, session_type: "Refleksoloji", session_note: "Seans sonrası rahatlama", session_date: "2026-11-04" }, TA, C1],
] as const;

const rows = units.map(([c, r, t, cl]) => {
  const u = buildClientIndexUnit(c, r as Record<string, unknown>, { tenantId: t, clientId: cl });
  if (!u) throw new Error(`index unit üretilemedi: ${r.id}`);
  return toClientIndexDbRow(u);
});
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const insertRow = (r: Record<string, unknown>) => {
  const cols = Object.keys(r);
  return `INSERT INTO public.yasam_hafizasi_client_index (${cols.join(", ")})
  SELECT ${cols.join(", ")} FROM jsonb_populate_record(NULL::public.yasam_hafizasi_client_index, ${lit(JSON.stringify(r))}::jsonb);`;
};
const tsq = (q: string) => {
  const { descriptor } = buildRetrievalDescriptor({ rawQuery: q, sessionTenantId: TA, allowShared: false });
  if (descriptor.kind !== "query") throw new Error(`boş sorgu: ${q}`);
  return { tsquery: descriptor.tsquery, w: `ARRAY[${[descriptor.ranking.weights.A, descriptor.ranking.weights.B, descriptor.ranking.weights.C, descriptor.ranking.weights.D].join(",")}]::float4[]` };
};
const Q = { migren: tsq("migren"), basAgrisi: tsq("baş ağrısı"), su: tsq("su tüketimi"), bel: tsq("bel fıtığı"), adres: tsq("Sokak"), refleks: tsq("Refleksoloji") };

const one = (label: string, call: string, expect: string) => `
  SELECT count(*) INTO v_n FROM ${call} r WHERE ${expect};
  SELECT count(*) INTO v_all FROM ${call} r;
  IF v_n <> v_all OR v_all <> 1 THEN RAISE EXCEPTION 'ASSERT ${label}: tam 1 doğru sonuç beklenir (eşleşen=%, toplam=%)', v_n, v_all; END IF;
  RAISE NOTICE 'PASS ${label}';`;
const none = (label: string, call: string) => `
  SELECT count(*) INTO v_all FROM ${call} r;
  IF v_all <> 0 THEN RAISE EXCEPTION 'ASSERT ${label}: 0 beklenir (%)', v_all; END IF;
  RAISE NOTICE 'PASS ${label}';`;
const cli = (q: { tsquery: string; w: string }, t: string, c: string) => `public.yh_search_client_candidates_v2(${lit(q.tsquery)}, ${lit(t)}::uuid, ${lit(c)}::uuid, ${q.w}, 50, NULL, NULL, NULL)`;
const ten = (q: { tsquery: string; w: string }, t: string) => `public.yh_search_tenant_client_candidates_v2(${lit(q.tsquery)}, ${lit(t)}::uuid, ${q.w}, 50, NULL, NULL, NULL)`;

const sql = `-- ÜRETİLDİ: scripts/dy-canli-denetim/h1-search-pg.harness.ts (geçici)
INSERT INTO public.tenants (id) VALUES (${lit(TA)}), (${lit(TB)}) ON CONFLICT DO NOTHING;
INSERT INTO public.clients (id, tenant_id, ad, soyad) VALUES (${lit(C1)}, ${lit(TA)}, 'ZZ', 'Bir'), (${lit(C2)}, ${lit(TA)}, 'ZZ', 'İki'), (${lit(C3)}, ${lit(TB)}, 'ZZ', 'Üç') ON CONFLICT DO NOTHING;
DELETE FROM public.yasam_hafizasi_client_index WHERE tenant_id IN (${lit(TA)}, ${lit(TB)});
${rows.map(insertRow).join("\n")}
DO $h1$
DECLARE v_n int; v_all int; v_snip text;
BEGIN
  ${one("h1-migren-dogru-danisan-kayit", cli(Q.migren, TA, C1), `r.source_id = ${lit(N1)}::uuid AND r.source_table = 'client_notes'`)}
  ${one("h1-bas-agrisi-ifadesi", cli(Q.basAgrisi, TA, C1), `r.source_id = ${lit(N1)}::uuid`)}
  ${one("h1-oneri-aranmaya-devam", cli(Q.su, TA, C1), `r.source_id = ${lit(N1)}::uuid`)}
  ${one("h1-seans-aranmaya-devam", cli(Q.refleks, TA, C1), `r.source_id = ${lit(S1)}::uuid AND r.source_table = 'client_sessions'`)}
  ${none("h1-baska-danisan-migren-yok", cli(Q.migren, TA, C2))}
  ${one("h1-baska-danisan-kendi-sagligi", cli(Q.bel, TA, C2), `r.source_id = ${lit(N2)}::uuid`)}
  ${none("h1-baska-tenant-danisani-gorunmez", cli(Q.migren, TB, C1))}
  ${none("h1-adres-aranmaz", cli(Q.adres, TA, C1))}
  ${one("h1-tenant-geneli-yalniz-kendi-tenanti", ten(Q.migren, TA), `r.source_id = ${lit(N1)}::uuid AND r.client_id = ${lit(C1)}::uuid`)}
  ${one("h1-tenant-B-yalniz-kendi-kaydi", ten(Q.migren, TB), `r.source_id = ${lit(N3)}::uuid AND r.client_id = ${lit(C3)}::uuid`)}
  SELECT r.snippet INTO v_snip FROM ${cli(Q.migren, TA, C1)} r LIMIT 1;
  IF v_snip IS DISTINCT FROM 'Migren atakları ve baş ağrısı; hekim takibinde.' THEN RAISE EXCEPTION 'ASSERT h1-onizleme: sağlık notu önizlemesi beklenir (%)', v_snip; END IF;
  RAISE NOTICE 'PASS h1-onizleme-saglik-notu';
  IF EXISTS (SELECT 1 FROM public.yasam_hafizasi_client_index WHERE search_text ILIKE '%Sokak No:5%' OR evidence_fields::text ILIKE '%Sokak No:5%') THEN RAISE EXCEPTION 'ASSERT h1-adres-index-disi'; END IF;
  RAISE NOTICE 'PASS h1-adres-index-disi';
END
$h1$;
`;

const dir = path.join(os.tmpdir(), "dy-h1-search-pg");
mkdirSync(dir, { recursive: true });
const assertFile = path.join(dir, "assert-h1-search.sql");
writeFileSync(assertFile, sql);
const args = ["scripts/final-hardening/pg-migration-check.mjs", "--fixture", F("base.sql")];
for (const m of CHAIN) args.push("--migration", m);
args.push("--twice", "--assert", assertFile);
const run = (a: string[]) => spawnSync(process.execPath, a, { cwd: process.cwd(), encoding: "utf8" });
const r = run(args);
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
const assertOk = out.split(/\r?\n/).some((l) => l.startsWith("OK") && l.includes("assert-h1-search.sql"));
const pass = r.status === 0 && out.includes("RESULT: PASS") && assertOk;
const labels = Array.from(sql.matchAll(/PASS (h1-[\w-]+)/g)).map((m) => m[1]);
if (pass) for (const l of labels) console.log(`  PASS  ${l}`);
else console.log(out.split(/\r?\n/).filter((l) => /ASSERT|ERROR|FAIL|error/i.test(l)).slice(0, 15).join("\n"));

// Negatif kontrol: başka danışanın migren araması için 0 yerine 1 bekleyen BİLEREK yanlış assert → FAIL olmalı.
const marker = "IF v_all <> 0 THEN RAISE EXCEPTION 'ASSERT h1-baska-danisan-migren-yok";
if (!sql.includes(marker)) throw new Error("negatif kontrol işareti bulunamadı");
const bad = path.join(dir, "assert-h1-negatif.sql");
writeFileSync(bad, sql.replace(marker, "IF v_all <> 1 THEN RAISE EXCEPTION 'ASSERT h1-NEGATIF"));
const neg = run(args.filter((x) => x !== "--twice").map((x) => (x === assertFile ? bad : x)));
const negOk = neg.status !== 0 && `${neg.stdout ?? ""}${neg.stderr ?? ""}`.includes("h1-NEGATIF");
console.log(`  ${negOk ? "PASS" : "FAIL"}  negatif kontrol: bilerek yanlış beklenti FAIL verdi (test boşa geçmiyor)`);

// Regresyon koşucusunun okuduğu standart özet: "<n> PASS / <m> FAIL" (assert'ler + negatif kontrol).
const okCount = (pass ? labels.length : 0) + (negOk ? 1 : 0);
console.log(`\nH1 GERÇEK PG ARAMA HARNESS: ${okCount} PASS / ${labels.length + 1 - okCount} FAIL (${labels.length} assert + negatif kontrol; zincir 2 kez uygulandı)`);
console.log(pass && negOk ? "RESULT: PASS" : "RESULT: FAIL");
if (!(pass && negOk)) process.exit(1);
