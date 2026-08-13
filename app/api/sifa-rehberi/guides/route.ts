import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateGuideBody, validateSectionsBody } from "@/lib/sifa-rehberi/limits";

export const runtime = "nodejs";

/**
 * /api/sifa-rehberi/guides — uzmanın şifa rehberi kayıtları (healing_guides).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert/update/delete tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * healing_guide_sections JOIN ile okunur; o tablo service_role'lü db üzerinden
 * çekildiği için tarayıcı doğrudan erişmez.
 *
 * Not: GET liste burada; tekil detay için ./[id]/route.ts kullanılır.
 */

// healingGuideLiveData.ts ile aynı select (liste): sections JOIN dahil.
const GUIDE_LIST_SELECT = `
  id,
  tenant_id,
  name,
  category,
  symptoms,
  general_summary,
  medical_causes,
  subconscious_causes,
  temperament_causes,
  other_causes,
  iridology_match,
  hand_analysis_match,
  cupping_leech,
  reflexology,
  diet_recommendations,
  herbal_methods,
  stone_recommendations,
  aromatherapy,
  meditation,
  breathwork,
  bioenergy,
  massage,
  daily_routine,
  sleep_routine,
  supportive_alternative_methods,
  islamic_recommendations,
  created_at,
  updated_at,
  healing_guide_sections (
    id,
    guide_id,
    section_type,
    mode,
    title,
    note,
    source,
    source_kind,
    expert_note,
    attention,
    sort_order,
    images,
    created_at
  )
`;

// Yazılabilir healing_guides kolonları — body'den yalnızca bunlar kabul edilir.
const WRITABLE_GUIDE_KEYS = [
  "name",
  "category",
  "symptoms",
  "general_summary",
  "medical_causes",
  "subconscious_causes",
  "temperament_causes",
  "other_causes",
  "iridology_match",
  "hand_analysis_match",
  "cupping_leech",
  "reflexology",
  "diet_recommendations",
  "herbal_methods",
  "stone_recommendations",
  "aromatherapy",
  "meditation",
  "breathwork",
  "bioenergy",
  "massage",
  "daily_routine",
  "sleep_routine",
  "supportive_alternative_methods",
  "islamic_recommendations",
  "images",
  "related_stones",
  "related_reflexology",
] as const;

function pickWritableFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE_GUIDE_KEYS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

// ─── GET /api/sifa-rehberi/guides ──────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("healing_guides")
    .select(GUIDE_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST /api/sifa-rehberi/guides ─────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, guide: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "Rahatsızlık adı zorunludur." }, { status: 400 });
  }

  // Girdi sertleştirme: alan uzunluk/şekil sınırları (tenant/auth davranışı değişmez).
  const bodyError = validateGuideBody(body);
  if (bodyError) {
    return NextResponse.json({ ok: false, error: bodyError }, { status: 400 });
  }
  const hasSections = "sections" in body && body.sections != null;
  if (hasSections) {
    const secError = validateSectionsBody(body.sections);
    if (secError) {
      return NextResponse.json({ ok: false, error: secError }, { status: 400 });
    }
  }

  // tenant_id payload'dan yok sayılır; server her zaman kendi tenant'ını yazar.
  const fields = pickWritableFields(body);
  fields.name = name;

  const { data, error } = await db
    .from("healing_guides")
    .insert({ ...fields, tenant_id: tenantId, updated_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Canonical model: yeni kayıt section'larla oluşturulduysa onları da yaz.
  // Böylece yeni manuel kayıtlar da healing_guide_sections'a gider (flat-only borç yok).
  const guideId = (data as { id: string }).id;
  if (hasSections && Array.isArray(body.sections) && body.sections.length > 0) {
    const sectionRows = (body.sections as Record<string, unknown>[]).map((s) => ({
      guide_id: guideId,
      section_type: String(s.section_type),
      mode: s.mode == null ? null : String(s.mode),
      title: s.title == null ? null : String(s.title),
      note: s.note == null ? null : String(s.note),
      source: s.source == null ? null : String(s.source),
      images: Array.isArray(s.images) ? s.images : [],
    }));

    const { error: secErr } = await db.from("healing_guide_sections").insert(sectionRows);

    if (secErr) {
      // Section yazımı başarısızsa yeni oluşan guide'ı geri al (yarım kayıt bırakma).
      await db.from("healing_guides").delete().eq("tenant_id", tenantId).eq("id", guideId);
      return NextResponse.json({ ok: false, error: secErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, guide: data });
}

// ─── DELETE /api/sifa-rehberi/guides?ids=a,b,c (toplu silme) ────────────────────
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deletedIds: [] });
  }

  // ids hem query (?ids=) hem body { ids: [] } üzerinden kabul edilir.
  let ids: string[] = [];
  const qsIds = req.nextUrl.searchParams.get("ids");
  if (qsIds) {
    ids = qsIds.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    try {
      const body = (await req.json()) as { ids?: unknown };
      if (Array.isArray(body.ids)) {
        ids = body.ids.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* body yoksa boş kalır */
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt seçilmedi." }, { status: 400 });
  }

  const { data, error } = await db
    .from("healing_guides")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedIds: (data ?? []).map((r) => (r as { id: string }).id),
  });
}
