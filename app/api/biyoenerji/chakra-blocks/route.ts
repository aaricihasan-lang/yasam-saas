import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/chakra-blocks?chakraId=<uuid> — bir çakranın rich içerik
 * bloklarını OKU (READ-ONLY). FAZ 3.2C foundation.
 *
 * Güvenlik (proje standardı):
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - IDOR: chakra_id önce tenant'a aitlik doğrulanır; sonra bloklar tenant+chakra
 *     scoped okunur. Rastgele tenant/chakra için blok döndürülmez.
 *   - Ham service_role hatası tarayıcıya sızmaz (maskeli mesaj + server log).
 *   - Yazma yok (create/update/delete/reorder FAZ 3.4).
 *
 * NOT: migration production'da DORMANT; tablo yoksa maskeli 500 döner
 * (çağıran taraf graceful boş listeye düşer).
 */

const BLOCK_COLUMNS = [
  "id",
  "chakra_id",
  "section_key",
  "block_type",
  "block_title",
  "sort_order",
  "source_excerpt",
  "source_translation",
  "editorial_explanation",
  "editorial_interpretation",
  "expert_note",
  "source_title",
  "source_author",
  "source_ref",
  "source_url",
  "tradition_frame",
  "created_at",
  "updated_at",
].join(", ");

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const chakraId = (new URL(req.url).searchParams.get("chakraId") ?? "").trim();
  if (!chakraId) {
    return NextResponse.json({ ok: false, error: "chakraId gerekli." }, { status: 400 });
  }

  // IDOR: chakra bu tenant'a mı ait?
  const owner = await db
    .from("bioenergy_chakras")
    .select("id")
    .eq("id", chakraId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (owner.error) {
    console.error("[chakra-blocks] ownership check:", owner.error.message);
    return NextResponse.json({ ok: false, error: "Bloklar okunamadı." }, { status: 500 });
  }
  if (!owner.data) {
    return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 404 });
  }

  const { data, error } = await db
    .from("bioenergy_chakra_blocks")
    .select(BLOCK_COLUMNS)
    .eq("chakra_id", chakraId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[chakra-blocks] read:", error.message);
    return NextResponse.json({ ok: false, error: "Bloklar okunamadı." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, blocks: data ?? [] });
}
