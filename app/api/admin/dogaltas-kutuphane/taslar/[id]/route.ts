import type { NextRequest } from "next/server";
import { ownerRpc, ownerRpcList } from "@/lib/stone-library/import/ownerRpc";
import { buildOwnerCompare, type OwnerRecordRow } from "@/lib/stone-library/ownerCompare";
import { isUuid, ownerBadRequest, ownerJson, pickEnum, pickObject, pickString, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET — owner taş ayrıntısı: tüm sürümler, facet'ler, adlar, görseller, TR/EN karşılaştırma, uzmana giden yayın belgesi,
 * yayına hazırlık kontrolü (engeller / uyarılar) ve kaynak metin bütünlüğü (ham yanıtla birebir + SHA-256).
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const [stone, images, readiness, integrity, licenses] = await Promise.all([
      ownerRpc<Record<string, unknown> | null>(db, "stone_library_owner_stone", { p_actor: ownerId, p_stone_id: id }),
      ownerRpcList(db, "stone_library_owner_images", { p_actor: ownerId, p_stone_id: id }),
      ownerRpc(db, "stone_library_owner_readiness", { p_actor: ownerId, p_stone_id: id }),
      ownerRpc(db, "stone_library_owner_integrity", { p_actor: ownerId, p_stone_id: id }),
      ownerRpc<{ grants?: { id: string; scope: string; evidence_status: string }[] } | null>(db, "stone_library_owner_licenses", { p_actor: ownerId }),
    ]);
    if (!stone) return ownerBadRequest("NOT_FOUND", "Taş bulunamadı.", 404);
    const compare = buildOwnerCompare((stone.records ?? []) as OwnerRecordRow[]);
    // Görsel izinlerinin YALNIZ durumu (kimlik + kapsam + kanıt durumu): editör "uzmana gösterilir mi" bilgisini buradan verir.
    const image_licenses = (licenses?.grants ?? []).map((g) => ({ id: g.id, scope: g.scope, evidence_status: g.evidence_status }));
    return ownerJson({ ok: true, ...stone, images, compare, readiness, integrity, image_licenses });
  });
}

const ACTIONS = ["edit", "review", "ready", "publish", "withdraw", "draft", "unpublish", "hide", "health_allow", "health_revoke"] as const;
const STATUS_OF: Record<string, string> = {
  review: "review", ready: "ready", publish: "published", withdraw: "hidden", hide: "hidden", draft: "draft", unpublish: "draft",
};

/**
 * POST
 *   { action: "review" | "ready" | "publish" | "withdraw" | "draft", note? }   durum geçişi (yayına hazır / yayın: hazırlık
 *       kontrolü DB'de; yayın yalnız "yayına hazır" ya da "yayından kaldırılmış" durumundan). withdraw = yayından kaldır.
 *       Uyumluluk: "hide" = withdraw, "unpublish" = taslağa çek.
 *   { action: "health_allow", note } | { action: "health_revoke", note? }       taş bazında owner sağlık yayın kararı
 *       (yalnız owner_decision modunda ve genel kilit açıkken etkili; hukuki onay yerine geçmez).
 *   { action: "edit", data: { slug?, expected_version?, name_tr?, name_en? } }  sağlayıcı kaynağına bağlı kartın adı
 *       DEĞİŞTİRİLEMEZ (DB: SL039); yalnız owner'ın kendi oluşturduğu kartın adı / bağlantısı düzenlenir.
 * Silme / geri alma: /silme ucu (geri alınabilir, bağımlılık kontrollü).
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ACTIONS);
    const note = pickString(body, "note", 2000);
    if (action === "edit") {
      await ownerRpc(db, "stone_library_stone_save", { p_actor: ownerId, p_stone_id: id, p_data: pickObject(body, "data") });
    } else if (action === "health_allow" || action === "health_revoke") {
      await ownerRpc(db, "stone_library_health_decision", {
        p_actor: ownerId, p_stone_id: id, p_action: action === "health_allow" ? "allow" : "revoke", p_note: note,
      });
    } else {
      await ownerRpc(db, "stone_library_stone_set_status", { p_actor: ownerId, p_stone_id: id, p_status: STATUS_OF[action], p_note: note });
    }
    const readiness = await ownerRpc(db, "stone_library_owner_readiness", { p_actor: ownerId, p_stone_id: id });
    return ownerJson({ ok: true, readiness });
  });
}
