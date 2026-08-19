import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateChakraBlockInput, chakraChildBreakdown } from "@/lib/bioenergy/chakraBlockCrud";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/chakra-blocks — bir çakranın GÖRÜNÜR rich içerik blokları.
 *   GET  ?chakraId=<uuid>  → blokları oku (READ; source-evidence dahil döner,
 *                            gizleme sunum katmanında yapılır).
 *   POST { chakraId, ...visibleFields } → yeni GÖRÜNÜR block oluştur (FAZ 2).
 *
 * Güvenlik (proje standardı):
 *   - requireModuleAccess("energy_body") → x-user-id + x-session-token + binding
 *     (admin VEYA energy_body modüllü uzman; rol değil tenant sahipliği).
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - IDOR: chakra_id önce tenant'a aitlik doğrulanır; sonra tenant+chakra scoped işlem.
 *   - Demo hesap: yazma yapılmaz.
 *   - Kullanıcı yalnız GÖRÜNÜR block yazar; source-evidence + gizli provenance alanları
 *     validateChakraBlockInput ile REDDEDİLİR (verbatim provenance korunur).
 *   - Ham service_role hatası tarayıcıya sızmaz.
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

  // FAZ 2 — silme güvenliği için hafif child sayımı (?count=1): total/visible/evidence
  if (new URL(req.url).searchParams.get("count") === "1") {
    const total = await db
      .from("bioenergy_chakra_blocks")
      .select("id", { count: "exact", head: true })
      .eq("chakra_id", chakraId)
      .eq("tenant_id", tenantId);
    const evidence = await db
      .from("bioenergy_chakra_blocks")
      .select("id", { count: "exact", head: true })
      .eq("chakra_id", chakraId)
      .eq("tenant_id", tenantId)
      .eq("block_type", "source-evidence");
    if (total.error || evidence.error) {
      console.error("[chakra-blocks] count:", total.error?.message || evidence.error?.message);
      return NextResponse.json({ ok: false, error: "Sayım yapılamadı." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...chakraChildBreakdown(total.count ?? 0, evidence.count ?? 0) });
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

/** Verilen chakra bu tenant'a mı ait? (IDOR guard) — true/false döner. */
async function assertChakraOwned(
  db: SupabaseClient,
  chakraId: string,
  tenantId: string,
): Promise<boolean> {
  const owner = await db
    .from("bioenergy_chakras")
    .select("id")
    .eq("id", chakraId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (owner.error) {
    console.error("[chakra-blocks] ownership:", owner.error.message);
    return false;
  }
  return Boolean(owner.data);
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, block: null });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const chakraId = typeof body["chakraId"] === "string" ? (body["chakraId"] as string).trim() : "";
  if (!chakraId) return NextResponse.json({ ok: false, error: "chakraId gerekli." }, { status: 400 });

  // IDOR: chakra tenant'a ait mi? (aksi halde 404, sızıntı yok)
  if (!(await assertChakraOwned(db, chakraId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 404 });
  }

  const v = validateChakraBlockInput(body, "create");
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.status });

  // sort_order verilmediyse: section içinde max+10 (deterministik, tenant+chakra scoped)
  let sortOrder = v.fields.sort_order;
  if (sortOrder === undefined) {
    const maxRes = await db
      .from("bioenergy_chakra_blocks")
      .select("sort_order")
      .eq("tenant_id", tenantId)
      .eq("chakra_id", chakraId)
      .eq("section_key", v.fields.section_key as string)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cur = (maxRes.data as { sort_order?: number } | null)?.sort_order;
    sortOrder = (typeof cur === "number" ? cur : 0) + 10;
  }

  const { data, error } = await db
    .from("bioenergy_chakra_blocks")
    .insert({
      tenant_id: tenantId,
      chakra_id: chakraId,
      section_key: v.fields.section_key,
      block_type: v.fields.block_type,
      block_title: v.fields.block_title ?? null,
      sort_order: sortOrder,
      editorial_explanation: v.fields.editorial_explanation ?? null,
      // gizli provenance/kaynak alanları: NULL. Yeni kullanıcı içeriği → origin_type expert_created.
      source_translation: null,
      editorial_interpretation: null,
      expert_note: null,
      origin_type: "expert_created",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[chakra-blocks] create:", error.message);
    return NextResponse.json({ ok: false, error: "Blok oluşturulamadı." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
