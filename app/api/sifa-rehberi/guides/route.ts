import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateGuideBody, validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import { normalizeReplaceSections } from "@/lib/sifa-rehberi/sectionModel";
import {
  parseGuideSearchParams,
  encodeCursor,
  BadCursorError,
} from "@/lib/sifa-rehberi/searchParams";
import { foldTr } from "@/lib/sifa-rehberi/normalizeTr";
import { UUID_RE, isSifaUuid } from "@/lib/sifa-rehberi/ids";
import { serverErrorResponse, publicErrorResponse } from "@/lib/sifa-rehberi/publicApiError";

export const runtime = "nodejs";

// RPC (SETOF healing_guides) sections JOIN'i döndürmez; liste kartı için ayrı çekilir.
const SECTION_SELECT =
  "id, guide_id, section_type, mode, title, note, source, source_kind, expert_note, attention, sort_order, images, created_at";

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

// Idempotency anahtarı biçim guard'ı (create RPC p_request_id) — UUID_RE tek kaynaktan
// (lib/sifa-rehberi/ids) içe aktarılır; route-içi kopya tanım kaldırıldı.

// ─── GET /api/sifa-rehberi/guides?q=&category=&limit=&cursor= ───────────────────
//
// Server-side bounded arama + keyset "daha fazla yükle" liste. Boş q → A–Z bounded
// liste; dolu q → tenant-bağlı substring arama (guide + section, pg_trgm). Tüm dataset
// ARTIK client'a inmez (payload büyüme sorunu kapanır). tenant SUNUCUDAN türetilir.
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  let params;
  try {
    params = parseGuideSearchParams(req.nextUrl.searchParams);
  } catch (e) {
    if (e instanceof BadCursorError) return publicErrorResponse(400, "Geçersiz sayfa imleci.");
    return serverErrorResponse({ route: "sifa/guides", action: "GET.parse", tenantId, cause: e });
  }

  const pageLimit = params.limit; // ≤ SEARCH_MAX_LIMIT (100)

  // limit+1 → hasMore tespiti (RPC iç cap 200).
  const { data: rpcRows, error: rpcErr } = await db.rpc("search_healing_guides", {
    p_tenant_id: tenantId,
    p_q: params.mode === "search" ? params.q : "",
    p_category: params.category,
    p_limit: pageLimit + 1,
    p_after_fold: params.cursor?.afterFold ?? null,
    p_after_id: params.cursor?.afterId ?? null,
  });
  if (rpcErr) {
    return serverErrorResponse({ route: "sifa/guides", action: "GET.search", tenantId, cause: rpcErr });
  }

  const allRows = (rpcRows ?? []) as Record<string, unknown>[];
  const hasMore = allRows.length > pageLimit;
  const pageRows = hasMore ? allRows.slice(0, pageLimit) : allRows;
  const ids = pageRows.map((r) => String(r.id));

  // Sections'ı tek sorguda çek (RPC join döndürmez) ve guide'lara iliştir.
  const sectionsByGuide = new Map<string, unknown[]>();
  if (ids.length > 0) {
    const { data: secData, error: secErr } = await db
      .from("healing_guide_sections")
      .select(SECTION_SELECT)
      .in("guide_id", ids);
    if (secErr) {
      return serverErrorResponse({ route: "sifa/guides", action: "GET.sections", tenantId, cause: secErr });
    }
    for (const s of (secData ?? []) as Record<string, unknown>[]) {
      const gid = String(s.guide_id);
      const arr = sectionsByGuide.get(gid) ?? [];
      arr.push(s);
      sectionsByGuide.set(gid, arr);
    }
  }

  // RPC sırasını KORU (fold(name), id). mapListRow'un beklediği raw şekil.
  const rows = pageRows.map((r) => ({
    ...r,
    healing_guide_sections: sectionsByGuide.get(String(r.id)) ?? [],
  }));

  // nextCursor: son satırın (fold(name), id) tuple'ı — JS foldTr == SQL sifa_fold (kanıtlı).
  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeCursor(foldTr(String(last.name ?? "")), String(last.id));
  }

  return NextResponse.json({ ok: true, rows, hasMore, nextCursor });
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

  // Idempotency anahtarı — opsiyonel; verilirse uuid olmalı. Aynı isteğin tekrarı
  // (double-click / yanıtı düşen ağ / retry) ikinci kayıt oluşturmaz. Bilinçli yeni
  // kayıtlar için istemci her denemede TAZE anahtar üretir → aynı-isim serbestliği bozulmaz.
  let requestId: string | null = null;
  if ("request_id" in body && body.request_id != null) {
    if (typeof body.request_id !== "string" || !UUID_RE.test(body.request_id)) {
      return NextResponse.json({ ok: false, error: "Geçersiz istek kimliği." }, { status: 400 });
    }
    requestId = body.request_id;
  }

  // tenant_id payload'dan yok sayılır; RPC guide satırına ZORLA p_tenant_id yazar ve
  // kolon allow-list uygular (fields yalnız yazılabilir kolonları taşır → çift allow-list).
  const guideFields = pickWritableFields(body);
  guideFields.name = name;

  // Sections: edit yolu (PUT .../sections) ile AYNI kanonik serileştirici.
  const sectionsPayload = hasSections
    ? normalizeReplaceSections(body.sections as Record<string, unknown>[])
    : [];

  // ATOMİK + IDEMPOTENT: guide satırı + tüm section'lar TEK transaction (RPC). Herhangi
  // bir hata → tamamı rollback (yarım kayıt / orphan / duplicate residue YOK). Tenant
  // binding + section_type allow-list + kolon allow-list RPC içinde de doğrulanır.
  const { data, error } = await db.rpc("create_healing_guide_with_sections", {
    p_tenant_id: tenantId,
    p_guide: guideFields,
    p_sections: sectionsPayload,
    p_request_id: requestId,
  });

  if (error) {
    const msg = error.message || "";
    // Kontrollü doğrulama tokenları → güvenli 400 (ham RPC/Postgres metni SIZMAZ).
    if (/invalid_section_type|sections_must_be_array|invalid_arguments|name_required/.test(msg)) {
      return NextResponse.json({ ok: false, error: "Kayıt verisi geçersiz." }, { status: 400 });
    }
    return serverErrorResponse({ route: "sifa/guides", action: "POST.rpc", tenantId, cause: error });
  }

  const result = (data ?? {}) as {
    outcome?: string;
    guide_id?: string;
    idempotent_replay?: boolean;
  };

  // Aynı anahtar FARKLI içerikle → güvenli çakışma (mutasyon YOK, sessizce eski kayıt DÖNMEZ).
  if (result.outcome === "idempotency_key_conflict") {
    return NextResponse.json(
      { ok: false, conflict: true, error: "Bu istek farklı içerikle daha önce işlendi." },
      { status: 409 },
    );
  }

  if (!result.guide_id) {
    return serverErrorResponse({
      route: "sifa/guides",
      action: "POST.rpc.result",
      tenantId,
      cause: new Error("create_healing_guide_with_sections returned no guide_id"),
    });
  }

  return NextResponse.json({
    ok: true,
    guide: { id: result.guide_id },
    idempotentReplay: result.idempotent_replay === true,
  });
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

  // Biçim guard'ı: geçersiz (non-UUID) id `.in("id", …)` üzerinden Postgres 22P02 → sanitize
  // 500 üretiyordu. Herhangi biri geçersizse temiz 400 (ham hata SIZMAZ; tenant binding değişmez).
  if (!ids.every(isSifaUuid)) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }

  const { data, error } = await db
    .from("healing_guides")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) {
    return serverErrorResponse({ route: "sifa/guides", action: "DELETE.bulk", tenantId, cause: error });
  }

  return NextResponse.json({
    ok: true,
    deletedIds: (data ?? []).map((r) => (r as { id: string }).id),
  });
}
