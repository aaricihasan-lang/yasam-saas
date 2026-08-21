import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import { validateStoneStructuredFields } from "@/lib/dogaltas/validation";
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
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
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
  // PERF-3 (yalnız TEŞHİS): endpoint alt-adım süreleri yalnızca standart
  // `Server-Timing` response header'ı ile sunulur. Auth/tenant/sorgu davranışı ve
  // JSON sözleşmesi DEĞİŞMEZ. Header yalnız süre + sabit ASCII metrik adı içerir;
  // hiçbir kullanıcı/tenant/token/sorgu içeriği ölçülmez, loglanmaz veya sunulmaz.
  // `performance.now()` monotonic saat kullanılır (Node global; yeni bağımlılık yok).
  const t0 = performance.now();
  const timings: string[] = [];
  const mark = (name: string, ms: number) => {
    timings.push(`${name};dur=${ms.toFixed(1)}`);
  };
  const send = (res: Response): Response => {
    mark("total", performance.now() - t0);
    res.headers.set("Server-Timing", timings.join(", "));
    return res;
  };

  const tAuth = performance.now();
  const guard = await requireModuleAccess(req, "stones");
  mark("auth", performance.now() - tAuth);
  if (!guard.ok) return send(guard.response);
  const { db, tenantId, is_demo_account } = guard;

  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "list";
  const q = sp.get("q")?.trim() ?? "";
  const searchMode: "name" | "content" = sp.get("searchMode") === "content" ? "content" : "name";
  const ids = tenantIdsFor(tenantId, is_demo_account);

  try {
    // raw: dashboard trend/stok ham satır — yalnız kendi tenant (library DAHİL DEĞİL)
    if (mode === "raw") {
      const tQ = performance.now();
      const { data, error } = await db.from("stones").select("*").eq("tenant_id", tenantId);
      mark("stones", performance.now() - tQ);
      if (error) return send(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, rows: data ?? [] });
      mark("response", performance.now() - tR);
      return send(res);
    }

    // extended: tüm satırlar geniş select (kombinasyon havuzu + detay-filtre arama)
    if (mode === "extended") {
      const tQ = performance.now();
      const { data, error } = await db
        .from("stones").select(STONES_LIST_EXTENDED_SELECT)
        .in("tenant_id", ids)
        .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS);
      mark("stones", performance.now() - tQ);
      if (error) return send(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, rows: sortTr((data ?? []) as Record<string, unknown>[]) });
      mark("response", performance.now() - tR);
      return send(res);
    }

    const tExcl = performance.now();
    const excluded = await exclusionIds(db, tenantId);
    mark("exclusions", performance.now() - tExcl);

    if (mode === "count") {
      let query = db.from("stones").select("id", { count: "exact", head: true }).in("tenant_id", ids);
      if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
      if (q) { const or = buildStonesListSearchOrFilter(q, searchMode); if (or) query = query.or(or); }
      const tC = performance.now();
      const { count, error } = await query;
      mark("count", performance.now() - tC);
      if (error) return send(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, count: count ?? 0 });
      mark("response", performance.now() - tR);
      return send(res);
    }

    // list (varsayılan) — pagination + arama + exclusion
    const offset = Number.parseInt(sp.get("offset") ?? "0", 10) || 0;
    const limit = Number.parseInt(sp.get("limit") ?? String(STONES_LIST_PAGE_SIZE), 10) || STONES_LIST_PAGE_SIZE;
    // PERF-5: withCount istendiğinde toplam sayı AYRI bir count sorgusuyla değil,
    // ranged liste sorgusunun kendisiyle TEK PostgREST çağrısında alınır
    // ({ count: "exact" } → Content-Range). Toplam sayı range/order'dan bağımsızdır ve
    // aynı tenant+exclusion+arama filtrelerine tabidir → sonuç (rows + count) birebir
    // aynı; ama wave-4'teki 2 paralel PostgREST çağrısı 1'e iner (round-trip azaltımı).
    const withCount = sp.get("withCount") === "1";

    let query = db
      .from("stones")
      .select(STONES_LIST_SELECT, withCount ? { count: "exact" as const } : undefined)
      .in("tenant_id", ids)
      .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS)
      .range(offset, offset + limit - 1);
    if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
    if (q) { const or = buildStonesListSearchOrFilter(q, searchMode); if (or) query = query.or(or); }

    // stones_count: liste + (withCount ise) toplam sayı TEK sorguda (Content-Range).
    const tSC = performance.now();
    const listRes = await query;
    mark("stones_count", performance.now() - tSC);
    if (listRes.error) return send(NextResponse.json({ ok: false, error: listRes.error.message }, { status: 500 }));
    const tR = performance.now();
    const res = NextResponse.json({
      ok: true,
      rows: sortTr((listRes.data ?? []) as Record<string, unknown>[]),
      ...(withCount ? { count: listRes.count ?? 0 } : {}),
    });
    mark("response", performance.now() - tR);
    return send(res);
  } catch (e) {
    return send(NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sunucu hatası" }, { status: 500 }));
  }
}

// ─── POST: create ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
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

  // F-004: structured alan tip zorlaması — chakras/warning_tags string[]; assignments
  // düz nesne olmalı. Yanlış tip DB'ye YAZILMAZ (rapor 500 landmine'ını beslemez).
  const structured = validateStoneStructuredFields(payload);
  if (!structured.ok) return NextResponse.json({ ok: false, error: structured.error }, { status: 422 });

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
