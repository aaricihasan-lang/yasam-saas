/**
 * GA-P2-05 — KARANTİNA KURTARMA (owner betiği; YALNIZ SUNUCU; varsayılan DRY-RUN; 0 sağlayıcı isteği).
 *
 * Karantinadaki (invalid_response / write_failed) ücretli ham yanıtı GÜNCEL adaptörle (techniques.ts → project) yeniden
 * projekte eder. Başarılıysa (yalnız `--apply`): astro_provider_results INSERT (deterministik kimlik; 23505 = zaten var) +
 * yorum INSERT (23505 = zaten var) + karantina satırı DELETE. Projeksiyon hâlâ geçersizse veya yazım yine başarısızsa satır
 * KORUNUR (negatif önbellek sürer). Süresi dolmuş satırlar onarılmaz; `--apply` ile silinir (KVKK).
 *
 * Sınır: sonuç, yanıtın ALINDIĞI istek anahtarıyla (input_hash + adapter_version) yazılır. Düzeltme adaptör sürümünü
 * değiştirdiyse yeni istekler farklı anahtar üretir ve bu onarılmış satırı kullanmaz (düzeltme projeksiyon sürümüyle
 * yapılmalıdır — mevcut kural). Ham yanıt 2 MB sonuç sınırını aşıyorsa (write_failed / 23514) bu betik onaramaz; satır kalır.
 *
 * Kullanım (owner, production'da yalnız yedekten sonra; bu PR'da ÇALIŞTIRILMADI):
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/quarantine-recover.ts [--tenant <uuid>] [--limit N] [--apply]
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resultIdFor } from "@/lib/astrology/engine/inputHash";
import { insertInterpretation, insertResult, isUniqueViolation } from "@/lib/astrology/persistence/repo";
import { cliDb, defaultResolver, parseCliArgs, short, unitFromContext, type TechniqueResolver } from "./recovery-common";

export type RecoverStatus =
  | "would_recover"
  | "recovered"
  | "still_invalid"
  | "write_failed_again"
  | "interp_failed"
  | "bad_context"
  | "expired"
  | "expired_purged";

export type RecoverItem = { id: string; technique: string; hash: string; reason: string; status: RecoverStatus; code?: string };

export type RecoverOptions = { apply: boolean; tenantId?: string | null; limit?: number; now?: Date; resolveTechnique?: TechniqueResolver };

type QRow = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  profile_id: string;
  profile_revision: number;
  partner_profile_id: string | null;
  partner_profile_revision: number | null;
  technique: string;
  provider: string;
  endpoint: string;
  adapter_version: string;
  input_hash: string;
  reason: string;
  raw_response: unknown;
  context: unknown;
  expires_at: string;
};

const COLS =
  "id, tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, technique, provider, endpoint, adapter_version, input_hash, reason, raw_response, context, expires_at";

export async function recoverQuarantine(db: SupabaseClient, opts: RecoverOptions): Promise<{ items: RecoverItem[]; providerCalls: 0 }> {
  const resolve = opts.resolveTechnique ?? defaultResolver;
  const now = (opts.now ?? new Date()).getTime();
  let q = db.from("astro_provider_quarantine").select(COLS).in("reason", ["invalid_response", "write_failed"]);
  if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(opts.limit ?? 200);
  if (error) throw new Error(`karantina okunamadı (kod ${error.code ?? "unknown"})`);
  const items: RecoverItem[] = [];
  const del = (r: QRow) => db.from("astro_provider_quarantine").delete().eq("tenant_id", r.tenant_id).eq("owner_user_id", r.owner_user_id).eq("id", r.id);
  for (const r of (data as QRow[] | null) ?? []) {
    const base = { id: r.id, technique: r.technique, hash: short(r.input_hash), reason: r.reason };
    if (!(Date.parse(r.expires_at) > now)) {
      if (opts.apply) await del(r);
      items.push({ ...base, status: opts.apply ? "expired_purged" : "expired" });
      continue;
    }
    const c = unitFromContext(r.context, r.input_hash, r.adapter_version);
    const def = c ? resolve(c.selectionTechnique) ?? resolve(r.technique) : null;
    if (!c || !def) {
      items.push({ ...base, status: "bad_context" });
      continue;
    }
    const proj = def.project(c.unit, r.raw_response, c.options);
    if (!proj.ok) {
      items.push({ ...base, status: "still_invalid", code: `${proj.errors.length} hata` });
      continue;
    }
    if (!opts.apply) {
      items.push({ ...base, status: "would_recover" });
      continue;
    }
    const id = resultIdFor(r.tenant_id, r.input_hash, r.owner_user_id);
    const ins = await insertResult(db, r.tenant_id, r.owner_user_id, {
      id,
      profileId: r.profile_id,
      profileRevision: r.profile_revision,
      partnerProfileId: r.partner_profile_id,
      partnerProfileRevision: r.partner_profile_revision,
      technique: c.unit.technique,
      provider: c.unit.provider,
      providerApiVersion: c.unit.providerApiVersion,
      adapterVersion: c.unit.adapterVersion,
      endpoint: c.unit.endpoint,
      input: c.unit.query ? { ...c.unit.body, lang: c.unit.lang, query: c.unit.query } : { ...c.unit.body, lang: c.unit.lang },
      inputHash: r.input_hash,
      raw: r.raw_response,
      technical: proj.technical,
      technicalSchema: proj.technicalSchema,
      projectionVersion: proj.projectionVersion,
      unmappedFields: [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)],
    });
    if (ins.error && !isUniqueViolation(ins.error)) {
      items.push({ ...base, status: "write_failed_again", code: String(ins.error.code ?? "unknown") });
      continue;
    }
    const it = await insertInterpretation(db, r.tenant_id, r.owner_user_id, id, c.unit.provider, c.unit.lang, proj.interpretationSchema, proj.projectionVersion, proj.interpretation);
    if (it.error && !isUniqueViolation(it.error)) {
      items.push({ ...base, status: "interp_failed", code: String(it.error.code ?? "unknown") });
      continue;
    }
    await del(r);
    items.push({ ...base, status: "recovered" });
  }
  return { items, providerCalls: 0 };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const db = await cliDb();
  console.log(`karantina kurtarma — ${args.apply ? "UYGULA (--apply)" : "DRY-RUN (yazım yok)"}; sağlayıcı isteği: 0`);
  const r = await recoverQuarantine(db, { apply: args.apply, tenantId: args.tenantId, limit: args.limit });
  for (const i of r.items) console.log(`${i.id}  ${i.technique}  ${i.hash}  ${i.reason}  → ${i.status}${i.code ? ` (${i.code})` : ""}`);
  const by = r.items.reduce<Record<string, number>>((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {});
  console.log(`özet: ${JSON.stringify(by)} · toplam ${r.items.length}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("karantina kurtarma hatası:", (e as Error).message);
    process.exit(1);
  });
}
