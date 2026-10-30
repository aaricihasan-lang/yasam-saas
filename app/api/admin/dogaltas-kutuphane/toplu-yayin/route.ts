import type { NextRequest } from "next/server";
import { ownerRpc, ownerRpcList } from "@/lib/stone-library/import/ownerRpc";
import { ownerBadRequest, ownerJson, pickEnum, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";
import { publishGate } from "@/app/admin/dogaltas-kutuphane/_components/publishGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SummaryStone = { id: string; name_tr: string; status: string; deleted: boolean };
type Readiness = { ready: boolean; blockers: string[]; warnings?: string[] };
type ImageRow = { id: string; review_state: string; deleted_at: string | null };
type Grant = { id: string; scope: string; evidence_status: string; document_id: string | null; grantor_label?: string | null; granted_on?: string | null };
type Doc = { id: string; title: string | null; doc_kind: string | null };
const DOC_KIND_TR: Record<string, string> = { correspondence: "yazışma kaydı", contract: "sözleşme", terms_snapshot: "kullanım koşulları kopyası", permission_letter: "izin yazısı", other: "belge" };
type TrPreview = { affected: number; already: number; excluded_fallback: number; excluded_stale: number; scope_total: number };

/**
 * POST /api/admin/dogaltas-kutuphane/toplu-yayin — kütüphaneyi TEK ONAYLA kullanıma açma (YALNIZ OWNER).
 *   { step: "preview" }                                  sayılar + etki (yazma yok)
 *   { step: "apply", expected: { stones, translations } } önizlemedeki sayılar değişmediyse: bekleyen kaynak görselleri
 *        onaylanır (onay ≠ lisans), yayınlanabilir taşlar tek adımda yayınlanır (DB önce bekleyen kayıtları onaylar, sonra
 *        hazırlığı denetler), doğrulanmış çeviriler yayınlanır. Engeli kalan taş yayınlanmaz ve nedeniyle döner.
 *   { step: "revert", expected: { stones } }              geri alma: yayındaki taşlar yayından kaldırılır + çeviri yayını kaldırılır
 *   { step: "license_verify", grant_id }                  görsel izni için OWNER'IN TEK ONAYI: kaynak görseller yetkili uzmanlara
 *        açılır. Kayda yalnız gerçekte olan yazılır (Owner beyanı + sistemde kayıtlı kanıt belgesi); yeni belge / sözleşme istenmez.
 *        DB, mevcut kanıt belgesinin SHA-256 bağını ayrıca zorlar. Bu uç izni KENDİLİĞİNDEN onaylamaz; çağrı yalnız owner düğmesinden.
 * Uzman yetkisi VERİLMEZ (yalnız Uzman erişimi ekranı). Sağlık / hukuk kapıları ve uzman görsel kapısı DB yayın yüzeyinde aynen kalır.
 */
async function preview(db: Parameters<Parameters<typeof withOwner>[1]>[0]["db"], ownerId: string) {
  const summary = await ownerRpc<{ stones?: SummaryStone[] } | null>(db, "stone_library_owner_layer_summary", { p_actor: ownerId });
  const stones = (Array.isArray(summary?.stones) ? summary.stones : []).filter((x) => !x.deleted);
  const toPublish: string[] = [];
  const blocked: { id: string; name: string; blockers: string[] }[] = [];
  for (const st of stones) {
    if (st.status === "published") continue;
    const r = await ownerRpc<Readiness>(db, "stone_library_owner_readiness", { p_actor: ownerId, p_stone_id: st.id });
    const g = publishGate({ ready: !!r?.ready, blockers: Array.isArray(r?.blockers) ? r.blockers : [] });
    if (g.canTry) toPublish.push(st.id);
    else blocked.push({ id: st.id, name: st.name_tr, blockers: g.hard });
  }
  const tr = await ownerRpc<TrPreview>(db, "stone_library_translation_publish", { p_actor: ownerId, p_stone_id: null, p_field: null, p_action: "publish", p_dry_run: true });
  const images = (await ownerRpcList<ImageRow>(db, "stone_library_owner_images", { p_actor: ownerId, p_stone_id: null })).filter((i) => !i.deleted_at);
  const lic = await ownerRpc<{ grants?: Grant[]; documents?: Doc[] } | null>(db, "stone_library_owner_licenses", { p_actor: ownerId });
  const docs = new Map((Array.isArray(lic?.documents) ? lic.documents : []).map((d) => [d.id, d]));
  const grants = (Array.isArray(lic?.grants) ? lic.grants : []).filter((g) => g.scope === "crystal_images").map((g) => ({
    id: g.id, evidence_status: g.evidence_status, granted_on: g.granted_on ?? null, grantor_label: g.grantor_label ?? null,
    document_title: g.document_id ? docs.get(g.document_id)?.title ?? null : null, document_kind: g.document_id ? docs.get(g.document_id)?.doc_kind ?? null : null,
  }));
  return {
    stones_total: stones.length,
    published: stones.filter((x) => x.status === "published").length,
    to_publish: toPublish,
    blocked,
    translations: tr,
    images_total: images.length,
    images_pending: images.filter((i) => i.review_state === "pending").map((i) => i.id),
    image_licenses: grants,
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const step = pickEnum(body, "step", ["preview", "apply", "revert", "license_verify"] as const);
    const exp = (body.expected ?? {}) as Record<string, unknown>;

    if (step === "license_verify") {
      const grantId = pickUuid(body, "grant_id");
      const lic = await ownerRpc<{ grants?: Grant[]; documents?: Doc[] } | null>(db, "stone_library_owner_licenses", { p_actor: ownerId });
      const g = (Array.isArray(lic?.grants) ? lic.grants : []).find((x) => x.id === grantId && x.scope === "crystal_images");
      if (!g) return ownerBadRequest("NOT_FOUND", "Görsel izni kaydı bulunamadı.", 404);
      const doc = g.document_id ? (Array.isArray(lic?.documents) ? lic.documents : []).find((d) => d.id === g.document_id) : undefined;
      const note = `Owner onayı (Kullanıma açma ekranı, tek onay): görsel kullanım izni sağlayıcı tarafından e-postayla verildi; `
        + `kanıt Owner'da saklı, kullanım sorumluluğu Owner'da. Sistemde kayıtlı kanıt: ${doc ? `${DOC_KIND_TR[doc.doc_kind ?? ""] ?? "belge"} (SHA-256 bağlı)` : "yok"}.`;
      await ownerRpc(db, "stone_library_license_grant_set_status", { p_actor: ownerId, p_grant_id: grantId, p_status: "verified", p_note: note });
      return ownerJson({ ok: true });
    }

    const p = await preview(db, ownerId);
    if (step === "preview") {
      return ownerJson({ ok: true, preview: { ...p, to_publish: p.to_publish.length, images_pending: p.images_pending.length } });
    }

    if (step === "apply") {
      if (exp.stones !== p.to_publish.length || exp.translations !== p.translations.affected) {
        return ownerBadRequest("STALE_PREVIEW", "Önizlemeden sonra durum değişti; ekranı yenileyip yeniden onaylayın.", 409);
      }
      let imagesApproved = 0;
      for (const id of p.images_pending) {
        await ownerRpc(db, "stone_library_image_review", { p_actor: ownerId, p_image_id: id, p_action: "approve", p_note: "Owner toplu yayın: kaynak görseli onayı" });
        imagesApproved++;
      }
      const published: string[] = [];
      const failed: { id: string; name: string; error: string }[] = [];
      const names = new Map((await ownerRpc<{ stones?: SummaryStone[] } | null>(db, "stone_library_owner_layer_summary", { p_actor: ownerId }))?.stones?.map((x) => [x.id, x.name_tr]) ?? []);
      for (const id of p.to_publish) {
        try {
          await ownerRpc(db, "stone_library_owner_publish", { p_actor: ownerId, p_stone_id: id, p_note: "Owner toplu yayın" });
          published.push(id);
        } catch (e) {
          const msg = String((e as Error).message ?? e);
          failed.push({ id, name: names.get(id) ?? id, error: /statement timeout|57014/i.test(msg) ? "zaman aşımı" : msg.slice(0, 300) });
        }
      }
      const tr = await ownerRpc<TrPreview>(db, "stone_library_translation_publish", { p_actor: ownerId, p_stone_id: null, p_field: null, p_action: "publish", p_dry_run: false });
      return ownerJson({ ok: true, result: { published: published.length, failed, translations_published: tr?.affected ?? 0, images_approved: imagesApproved } });
    }

    // revert
    const summary = await ownerRpc<{ stones?: SummaryStone[] } | null>(db, "stone_library_owner_layer_summary", { p_actor: ownerId });
    const live = (Array.isArray(summary?.stones) ? summary.stones : []).filter((x) => !x.deleted && x.status === "published");
    if (exp.stones !== live.length) return ownerBadRequest("STALE_PREVIEW", "Yayındaki taş sayısı değişti; ekranı yenileyip yeniden onaylayın.", 409);
    for (const st of live) await ownerRpc(db, "stone_library_stone_set_status", { p_actor: ownerId, p_stone_id: st.id, p_status: "hidden", p_note: "Owner toplu geri alma" });
    const tr = await ownerRpc<TrPreview>(db, "stone_library_translation_publish", { p_actor: ownerId, p_stone_id: null, p_field: null, p_action: "unpublish", p_dry_run: false });
    return ownerJson({ ok: true, result: { unpublished: live.length, translations_unpublished: tr?.affected ?? 0 } });
  });
}
