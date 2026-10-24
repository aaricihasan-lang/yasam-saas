/**
 * GA-P2-05 (c) — EKSİK SAĞLAYICI YORUMU GERİ DOLDURMA (owner betiği; YALNIZ SUNUCU; varsayılan DRY-RUN; 0 sağlayıcı isteği).
 *
 * Sorun: sonuç kaydı başarılı + yorum kaydı kalıcı başarısız → sonraki çalıştırmalar önbellekten gelir, yorum bir daha
 * üretilmez (ham yanıt astro_provider_results.raw_response'ta duruyor).
 *
 * Yöntem: sonucu olup (result_id, projection_version) yorumu EKSİK satırlar için raw_response GÜNCEL adaptörle yeniden
 * projekte edilir ve yalnız şu koşulların HEPSİ sağlanırsa yorum INSERT edilir (`--apply`):
 *   1) projeksiyon bağlamı bulunur — öncelik: karantina satırı (reason = interp_write_failed; motor yazar), sonra aynı
 *      sonuca bağlı kayıtlı analizin technique_params'ı (yalnız OKUNUR),
 *   2) projeksiyon başarılı ve projection_version sonuç satırıyla EŞİT,
 *   3) yeniden üretilen teknik katman kayıtlı teknik katmanla BİREBİR aynı (bağlamın doğru olduğunun kanıtı),
 *   4) teknik bir yorum üretiyor (interpretation ≠ null).
 * Kayıtlı analiz snapshot'larına (astro_analyses / astro_analysis_notes) DOKUNMAZ; sonuç satırını DEĞİŞTİRMEZ; yalnız
 * astro_provider_interpretations INSERT (23505 = zaten var) + kullanılan karantina bağlam satırı DELETE.
 *
 * Kullanım (owner; bu PR'da production'da ÇALIŞTIRILMADI):
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/interp-backfill.ts [--tenant <uuid>] [--limit N] [--apply]
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertInterpretation, isUniqueViolation } from "@/lib/astrology/persistence/repo";
import { canonical, cliDb, defaultResolver, isObj, parseCliArgs, short, unitFromContext, unitFromResultRow, type TechniqueResolver } from "./recovery-common";

export type BackfillStatus =
  | "would_insert"
  | "inserted"
  | "skipped_no_context"
  | "skipped_projection_failed"
  | "skipped_projection_version"
  | "skipped_context_mismatch"
  | "skipped_no_interpretation"
  | "insert_failed";

export type BackfillItem = { resultId: string; technique: string; hash: string; source: "quarantine" | "analysis" | "none"; status: BackfillStatus; code?: string };

export type BackfillOptions = { apply: boolean; tenantId?: string | null; limit?: number; resolveTechnique?: TechniqueResolver };

type ResRow = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  technique: string;
  provider: string;
  provider_api_version: string;
  adapter_version: string;
  endpoint: string;
  input: unknown;
  input_hash: string;
  technical: unknown;
  projection_version: string;
};

const RES_COLS = "id, tenant_id, owner_user_id, technique, provider, provider_api_version, adapter_version, endpoint, input, input_hash, technical, projection_version";

export async function backfillInterpretations(db: SupabaseClient, opts: BackfillOptions): Promise<{ items: BackfillItem[]; providerCalls: 0 }> {
  const resolve = opts.resolveTechnique ?? defaultResolver;
  let rq = db.from("astro_provider_results").select(RES_COLS);
  if (opts.tenantId) rq = rq.eq("tenant_id", opts.tenantId);
  const res = await rq.order("created_at", { ascending: true }).limit(opts.limit ?? 200);
  if (res.error) throw new Error(`sonuçlar okunamadı (kod ${res.error.code ?? "unknown"})`);
  const rows = (res.data as ResRow[] | null) ?? [];
  if (rows.length === 0) return { items: [], providerCalls: 0 };
  const ids = rows.map((r) => r.id);
  const it = await db.from("astro_provider_interpretations").select("tenant_id, owner_user_id, result_id, projection_version").in("result_id", ids);
  if (it.error) throw new Error(`yorumlar okunamadı (kod ${it.error.code ?? "unknown"})`);
  const have = new Set(((it.data as { tenant_id: string; owner_user_id: string; result_id: string; projection_version: string }[] | null) ?? []).map((x) => `${x.tenant_id}|${x.owner_user_id}|${x.result_id}|${x.projection_version}`));
  const missing = rows.filter((r) => !have.has(`${r.tenant_id}|${r.owner_user_id}|${r.id}|${r.projection_version}`));
  if (missing.length === 0) return { items: [], providerCalls: 0 };

  // Bağlam kaynakları (yalnız OKUMA): karantina (interp_write_failed) + kayıtlı analizler.
  const pqRes = await db.from("astro_provider_quarantine").select("id, tenant_id, owner_user_id, input_hash, adapter_version, context").eq("reason", "interp_write_failed").in("input_hash", [...new Set(missing.map((r) => r.input_hash))]);
  const pqRows = pqRes.error ? [] : ((pqRes.data as { id: string; tenant_id: string; owner_user_id: string; input_hash: string; adapter_version: string; context: unknown }[] | null) ?? []);
  const anRes = await db.from("astro_analyses").select("tenant_id, owner_user_id, technique, result_id, result_ids, technique_params").in("tenant_id", [...new Set(missing.map((r) => r.tenant_id))]);
  const anRows = anRes.error ? [] : ((anRes.data as { tenant_id: string; owner_user_id: string; technique: string; result_id: string | null; result_ids: string[] | null; technique_params: unknown }[] | null) ?? []);

  const items: BackfillItem[] = [];
  for (const r of missing) {
    const base = { resultId: r.id, technique: r.technique, hash: short(r.input_hash) };
    const pq = pqRows.find((q) => q.tenant_id === r.tenant_id && q.owner_user_id === r.owner_user_id && q.input_hash === r.input_hash && q.adapter_version === r.adapter_version);
    const fromPq = pq ? unitFromContext(pq.context, r.input_hash, r.adapter_version) : null;
    const an = fromPq
      ? null
      : anRows.find((a) => a.tenant_id === r.tenant_id && a.owner_user_id === r.owner_user_id && isObj(a.technique_params) && (a.result_id === r.id || (Array.isArray(a.result_ids) && a.result_ids.includes(r.id))));
    const unit = fromPq?.unit ?? (an ? unitFromResultRow(r) : null);
    const options = fromPq?.options ?? (an ? (an.technique_params as Record<string, unknown>) : null);
    const selTech = fromPq?.selectionTechnique ?? an?.technique ?? r.technique;
    const source = fromPq ? "quarantine" : an ? "analysis" : "none";
    const def = resolve(selTech) ?? resolve(r.technique);
    if (!unit || !options || !def) {
      items.push({ ...base, source, status: "skipped_no_context" });
      continue;
    }
    // Ham yanıt yalnız bu satır için, yalnız sunucuda okunur; çıktıya/loga yazılmaz.
    const rawRes = await db.from("astro_provider_results").select("raw_response").eq("tenant_id", r.tenant_id).eq("owner_user_id", r.owner_user_id).eq("id", r.id).maybeSingle();
    const raw = (rawRes.data as { raw_response?: unknown } | null)?.raw_response;
    if (rawRes.error || raw === undefined) {
      items.push({ ...base, source, status: "skipped_projection_failed", code: String(rawRes.error?.code ?? "no_raw") });
      continue;
    }
    const proj = def.project(unit, raw, options);
    if (!proj.ok) {
      items.push({ ...base, source, status: "skipped_projection_failed" });
      continue;
    }
    if (proj.projectionVersion !== r.projection_version) {
      items.push({ ...base, source, status: "skipped_projection_version" });
      continue;
    }
    if (canonical(JSON.parse(JSON.stringify(proj.technical))) !== canonical(r.technical)) {
      items.push({ ...base, source, status: "skipped_context_mismatch" });
      continue;
    }
    if (proj.interpretationSchema === null || proj.interpretation === null || proj.interpretation === undefined) {
      items.push({ ...base, source, status: "skipped_no_interpretation" });
      continue;
    }
    if (!opts.apply) {
      items.push({ ...base, source, status: "would_insert" });
      continue;
    }
    const ins = await insertInterpretation(db, r.tenant_id, r.owner_user_id, r.id, unit.provider, unit.lang, proj.interpretationSchema, proj.projectionVersion, proj.interpretation);
    if (ins.error && !isUniqueViolation(ins.error)) {
      items.push({ ...base, source, status: "insert_failed", code: String(ins.error.code ?? "unknown") });
      continue;
    }
    if (pq) await db.from("astro_provider_quarantine").delete().eq("tenant_id", r.tenant_id).eq("owner_user_id", r.owner_user_id).eq("id", pq.id);
    items.push({ ...base, source, status: "inserted" });
  }
  return { items, providerCalls: 0 };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const db = await cliDb();
  console.log(`yorum geri doldurma — ${args.apply ? "UYGULA (--apply)" : "DRY-RUN (yazım yok)"}; sağlayıcı isteği: 0; analiz snapshot'larına dokunulmaz`);
  const r = await backfillInterpretations(db, { apply: args.apply, tenantId: args.tenantId, limit: args.limit });
  for (const i of r.items) console.log(`${i.resultId}  ${i.technique}  ${i.hash}  [${i.source}]  → ${i.status}${i.code ? ` (${i.code})` : ""}`);
  const by = r.items.reduce<Record<string, number>>((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {});
  console.log(`özet: ${JSON.stringify(by)} · eksik yorumlu sonuç ${r.items.length}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("yorum geri doldurma hatası:", (e as Error).message);
    process.exit(1);
  });
}
