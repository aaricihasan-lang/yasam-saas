import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerBadRequest, ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dogaltas-kutuphane/aktarim — owner kontrollü kristal aktarımı.
 *   F6-A (raw_put güvenlik kapatması): web uygulaması ham sağlayıcı yanıtı YAZAMAZ — raw_put service_role'e kapalı,
 *   yalnız `stone_library_importer` rolü + DB'de ayrılmış ve tüketilmemiş çağrıyla çalışır.
 *   { action: "run", … }   → 410 IMPORT_OFFLINE_ONLY (ücretli çağrı başlatılmaz, kredi ayrılmaz). Aktarım yalnız güvenilir
 *                             çevrimdışı betikten yapılır: scripts/stone-library/f6-offline-import.ts (ayrı aktarım kimliği).
 *   { action: "recover", batch_id, note? }  takılı ('running' kalan) paketi 'stopped' yapar.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ["run", "recover"] as const);
    if (action === "recover") {
      const status = await ownerRpc<string>(db, "stone_library_batch_recover", { p_actor: ownerId, p_batch_id: pickUuid(body, "batch_id"), p_note: pickString(body, "note", 500) });
      return ownerJson({ ok: true, status });
    }
    return ownerBadRequest("IMPORT_OFFLINE_ONLY", "Aktarım web üzerinden yapılamaz; güvenli çevrimdışı aktarım akışı kullanılmalıdır.", 410);
  });
}
