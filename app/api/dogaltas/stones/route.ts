import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import {
  STONES_LIST_SELECT,
  STONES_LIST_EXTENDED_SELECT,
  STONES_LIST_PAGE_SIZE,
  STONES_LIST_ORDER_COLUMN,
  STONES_LIST_ORDER_OPTIONS,
  buildStonesListSearchOrFilter,
} from "@/lib/dogaltas/stonesListFetch";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones — Doğaltaş tabloya GÜVENLİ server kapısı (Faz 1-A).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDAN (oturumdan) alınır; client body/query'den ALINMAZ.
 *   - service_role yalnız burada (guard.db) — RLS bypass yalnız sunucuda.
 *   - tenant-only mimari: normal uzman yalnız kendi tenant'ını görür; admin/library
 *     OTOMATİK görünmez. Tek istisna DEMO hesap → showcase için library de dahil.
 *
 * NOT (Faz 1-A): Client hâlâ eski anon supabase çağrılarıyla çalışıyor; bu route
 *   yalnızca güvenli kapıyı HAZIRLAR. RLS kilidi Faz 1-C'de.
 */

// Yazılabilir kolonlar — id/tenant_id/created_at gibi alanlar client'tan KABUL EDİLMEZ.
const STONE_WRITABLE = [
  "stone_name", "short_description", "general_info", "source_note",
  "physical_effects", "spiritual_effects", "other_effects", "warning_text",
  "warning_tags", "feng_shui", "meditation", "care", "application",
  "chakras", "assignments", "images",
] as const;

function tenantIdsFor(tenantId: string, isDemo: boolean): string[] {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [tenantId];
  return isDemo ? [tenantId, ADMIN_LIBRARY_TENANT_ID] : [tenantId];
}

async function exclusionIds(db: SupabaseClient, tenantId: string): Promise<string[]> {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [];
  const { data } = await db.from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId);
  return (data ?? []).map((r) => String((r as { stone_id: unknown }).stone_id));
}

/** Türkçe alfabetik sıralama (stonesListFetch ile aynı davranış). */
function sortTr<T extends { stone_name?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    String(a.stone_name ?? "").localeCompare(String(b.stone_name ?? ""), "tr-TR", { sensitivity: "base" }),
  );
}

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

// ─── GET: list | count | extended | raw ──────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "list";
  const q = sp.get("q")?.trim() ?? "";
  const searchMode: "name" | "content" = sp.get("searchMode") === "content" ? "content" : "name";
  const ids = tenantIdsFor(tenantId, is_demo_account);

  try {
    // raw: dashboard trend/stok ham satır — yalnız kendi tenant (library DAHİL DEĞİL)
    if (mode === "raw") {
      const { data, error } = await db.from("stones").select("*").eq("tenant_id", tenantId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    // extended: tüm satırlar geniş select (kombinasyon havuzu + detay-filtre arama)
    if (mode === "extended") {
      const { data, error } = await db
        .from("stones").select(STONES_LIST_EXTENDED_SELECT)
        .in("tenant_id", ids)
        .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, rows: sortTr((data ?? []) as Record<string, unknown>[]) });
    }

    const excluded = await exclusionIds(db, tenantId);

    if (mode === "count") {
      let query = db.from("stones").select("id", { count: "exact", head: true }).in("tenant_id", ids);
      if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
      if (q) { const or = buildStonesListSearchOrFilter(q, searchMode); if (or) query = query.or(or); }
      const { count, error } = await query;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, count: count ?? 0 });
    }

    // list (varsayılan) — pagination + arama + exclusion
    const offset = Number.parseInt(sp.get("offset") ?? "0", 10) || 0;
    const limit = Number.parseInt(sp.get("limit") ?? String(STONES_LIST_PAGE_SIZE), 10) || STONES_LIST_PAGE_SIZE;
    // O-3: withCount → liste + toplam sayı TEK istekte döner (exclusion + auth
    // bir kez yapılır, count parallel çalışır). İlk yükleme 3 istek → 1'e iner.
    const withCount = sp.get("withCount") === "1";

    let query = db
      .from("stones").select(STONES_LIST_SELECT)
      .in("tenant_id", ids)
      .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS)
      .range(offset, offset + limit - 1);
    if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
    if (q) { const or = buildStonesListSearchOrFilter(q, searchMode); if (or) query = query.or(or); }

    let countQuery = withCount
      ? db.from("stones").select("id", { count: "exact", head: true }).in("tenant_id", ids)
      : null;
    if (countQuery && excluded.length) countQuery = countQuery.not("id", "in", `(${excluded.join(",")})`);
    if (countQuery && q) { const or = buildStonesListSearchOrFilter(q, searchMode); if (or) countQuery = countQuery.or(or); }

    const [listRes, countRes] = await Promise.all([
      query,
      countQuery ?? Promise.resolve({ count: null as number | null, error: null }),
    ]);
    if (listRes.error) return NextResponse.json({ ok: false, error: listRes.error.message }, { status: 500 });
    if (withCount && countRes.error) return NextResponse.json({ ok: false, error: countRes.error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      rows: sortTr((listRes.data ?? []) as Record<string, unknown>[]),
      ...(withCount ? { count: countRes.count ?? 0 } : {}),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sunucu hatası" }, { status: 500 });
  }
}

// ─── POST: create ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const name = String(body.stone_name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Taş adı zorunludur." }, { status: 400 });

  // Demo: gerçek yazma yok, başarı taklit edilir (mevcut davranış).
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = pick(body, STONE_WRITABLE);
  payload.stone_name = name;

  // Mineral oranı (assignments.Mineraller 2. sütun) 0..100 olmalı; boş serbest (DT-P0-4).
  if ("assignments" in payload) {
    const check = validateMineralAssignments(payload.assignments);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    payload.assignments = check.value;
  }

  payload.tenant_id = tenantId;              // SUNUCUDAN — body'deki tenant_id yok sayılır
  payload.updated_at = new Date().toISOString();
  if (!("images" in payload)) payload.images = [];

  const { data, error } = await db.from("stones").insert(payload).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
