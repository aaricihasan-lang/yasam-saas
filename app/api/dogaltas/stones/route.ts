import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { stoneReadTenantIds } from "@/lib/dogaltas/stoneTenantScope";
import { trackUsage } from "@/lib/usage/trackUsage";
import { normalizeSourceName, SOURCE_NAME_MAX } from "@/lib/dogaltas/stoneSources";
import { isSourcesSchemaMissing } from "@/lib/dogaltas/stoneSourcesServer";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import { validateStoneStructuredFields, validateStoneImagesField } from "@/lib/dogaltas/validation";
import { normalizeTaxonomyValues } from "@/lib/dogaltas/stoneTaxonomy";
import {
  STONES_LIST_SELECT,
  STONES_LIST_EXTENDED_SELECT,
  STONES_LIST_PAGE_SIZE,
  STONES_LIST_ORDER_COLUMN,
  STONES_LIST_ORDER_OPTIONS,
  buildStonesListSearchOrFilter,
} from "@/lib/dogaltas/stonesListFetch";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";

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
  // WT9: birincil kaynağın adı (NULL = belirtilmemiş). Ek kaynaklar: /api/dogaltas/stones/[id]/sources.
  "primary_source_name",
] as const;

/** Okuma görünürlüğü: ortak kural (lib/dogaltas/stoneTenantScope). */
const tenantIdsFor = stoneReadTenantIds;

async function exclusionIds(db: SupabaseClient, tenantId: string): Promise<string[]> {
  const res = await fetchAllRows<{ stone_id: unknown }>((from, to) =>
    db.from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId)
      .order("stone_id", { ascending: true }).range(from, to),
  );
  return res.rows.map((r) => String(r.stone_id));
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
      // Tek tüketici pano aylık trendi: yalnız created_at + (varsa) `since` penceresi.
      // Eskiden tüm kolonlar (uzun metinler dahil) iniyordu: yüzlerce KB + 1000-satır tavanı.
      const sinceRaw = sp.get("since");
      const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null;
      const tQ = performance.now();
      // P2-07: pencere içindeki TÜM satırlar (toplu aktarımda 1000+ kayıt aynı aya düşebilir).
      const rawRes = await fetchAllRows<{ created_at: unknown }>((from, to) => {
        let rawQuery = db.from("stones").select("created_at").eq("tenant_id", tenantId);
        if (since) rawQuery = rawQuery.gte("created_at", since);
        return rawQuery.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
      });
      mark("stones", performance.now() - tQ);
      if (!rawRes.ok) return send(serverErrorResponse({ route: "dogaltas/stones", action: "GET:raw", tenantId, cause: rawRes.error }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, rows: rawRes.rows });
      mark("response", performance.now() - tR);
      return send(res);
    }

    // extended: tüm satırlar geniş select (kombinasyon havuzu + detay-filtre arama)
    if (mode === "extended") {
      const tQ = performance.now();
      // P2-07: kombinasyon havuzu "tümü" → sayfalı (1000-satır tavanı yok).
      const extRes = await fetchAllRows<Record<string, unknown>>((from, to) =>
        db
          .from("stones").select(STONES_LIST_EXTENDED_SELECT)
          .in("tenant_id", ids)
          .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS)
          .order("id", { ascending: true })
          .range(from, to),
      );
      mark("stones", performance.now() - tQ);
      if (!extRes.ok) return send(serverErrorResponse({ route: "dogaltas/stones", action: "GET:extended", tenantId, cause: extRes.error }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, rows: sortTr(extRes.rows) });
      mark("response", performance.now() - tR);
      return send(res);
    }

    const tExcl = performance.now();
    const excluded = await exclusionIds(db, tenantId);
    mark("exclusions", performance.now() - tExcl);

    if (mode === "count") {
      const buildCount = (legacySchema: boolean) => {
        let query = db.from("stones").select("id", { count: "exact", head: true }).in("tenant_id", ids);
        if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
        if (q) { const or = buildStonesListSearchOrFilter(q, searchMode, { legacySchema }); if (or) query = query.or(or); }
        return query;
      };
      const tC = performance.now();
      let { count, error } = await buildCount(false);
      // WT9 geri uyum: çoklu kaynak migration'ı henüz yoksa içerik araması eski kolonlarla yapılır.
      if (error && q && searchMode === "content" && isSourcesSchemaMissing(error)) ({ count, error } = await buildCount(true));
      mark("count", performance.now() - tC);
      if (error) return send(serverErrorResponse({ route: "dogaltas/stones", action: "GET:count", tenantId, cause: error }));
      const tR = performance.now();
      const res = NextResponse.json({ ok: true, count: count ?? 0 });
      mark("response", performance.now() - tR);
      return send(res);
    }

    // list (varsayılan) — pagination + arama + exclusion. limit SUNUCUDA clamp'lenir
    // (client keyfine 10000 yapamaz; export "filtered" için üst sınır 500).
    const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);
    const rawLimit = Number.parseInt(sp.get("limit") ?? String(STONES_LIST_PAGE_SIZE), 10) || STONES_LIST_PAGE_SIZE;
    const limit = Math.min(Math.max(1, rawLimit), 500);
    // PERF-5: withCount istendiğinde toplam sayı AYRI bir count sorgusuyla değil,
    // ranged liste sorgusunun kendisiyle TEK PostgREST çağrısında alınır
    // ({ count: "exact" } → Content-Range). Toplam sayı range/order'dan bağımsızdır ve
    // aynı tenant+exclusion+arama filtrelerine tabidir → sonuç (rows + count) birebir
    // aynı; ama wave-4'teki 2 paralel PostgREST çağrısı 1'e iner (round-trip azaltımı).
    const withCount = sp.get("withCount") === "1";

    const buildList = (legacySchema: boolean) => {
      let query = db
        .from("stones")
        .select(STONES_LIST_SELECT, withCount ? { count: "exact" as const } : undefined)
        .in("tenant_id", ids)
        .order(STONES_LIST_ORDER_COLUMN, STONES_LIST_ORDER_OPTIONS)
        // P2-07: eş adlı taşlarda sayfalar arası atlama/çift olmaması için kararlı ikincil sıra.
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
      if (q) { const or = buildStonesListSearchOrFilter(q, searchMode, { legacySchema }); if (or) query = query.or(or); }
      return query;
    };

    // stones_count: liste + (withCount ise) toplam sayı TEK sorguda (Content-Range).
    const tSC = performance.now();
    let listRes = await buildList(false);
    if (listRes.error && q && searchMode === "content" && isSourcesSchemaMissing(listRes.error)) listRes = await buildList(true);
    mark("stones_count", performance.now() - tSC);
    if (listRes.error) return send(serverErrorResponse({ route: "dogaltas/stones", action: "GET:list", tenantId, cause: listRes.error }));
    const tR = performance.now();
    const res = NextResponse.json({
      ok: true,
      rows: sortTr((listRes.data ?? []) as Record<string, unknown>[]),
      ...(withCount ? { count: listRes.count ?? 0 } : {}),
    });
    mark("response", performance.now() - tR);
    return send(res);
  } catch (e) {
    return send(serverErrorResponse({ route: "dogaltas/stones", action: "GET", tenantId, cause: e }));
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

  // P1-01: yeni kayıtta aynı kavram iki yazımla saklanmaz; bilinen eşdeğerler kanonik
  // yazıma çevrilir (tek kaynak: lib/dogaltas/stoneTaxonomy). Listede olmayan değer korunur.
  if (Array.isArray(payload.chakras)) payload.chakras = normalizeTaxonomyValues("chakra", payload.chakras as string[], { canonicalize: true });
  if (Array.isArray(payload.warning_tags)) payload.warning_tags = normalizeTaxonomyValues("warning", payload.warning_tags as string[], { canonicalize: true });

  // SSRF kapanışı: images[] yalnız tenant'a ait canonical file_path; url reddedilir.
  if ("images" in payload) {
    const imagesCheck = validateStoneImagesField(payload.images, tenantId);
    if (!imagesCheck.ok) return NextResponse.json({ ok: false, error: imagesCheck.error }, { status: 422 });
  }

  // Mineral oranı (assignments.Mineraller 2. sütun) 0..100 olmalı; boş serbest (DT-P0-4).
  if ("assignments" in payload) {
    const check = validateMineralAssignments(payload.assignments);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    payload.assignments = check.value;
  }

  // WT9: birincil kaynak adı — normalize (boşluk), boş → NULL, üst sınır.
  if ("primary_source_name" in payload) {
    const n = normalizeSourceName(payload.primary_source_name);
    if (n.length > SOURCE_NAME_MAX) return NextResponse.json({ ok: false, error: `Kaynak adı en fazla ${SOURCE_NAME_MAX} karakter olabilir.` }, { status: 400 });
    payload.primary_source_name = n || null;
  }
  payload.tenant_id = tenantId;              // SUNUCUDAN — body'deki tenant_id yok sayılır
  payload.updated_at = new Date().toISOString();
  if (!("images" in payload)) payload.images = [];

  const { data, error } = await db.from("stones").insert(payload).select("id").single();
  if (error) return serverErrorResponse({ route: "dogaltas/stones", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_created", subEntity: "stone" } });
  const newId = (data as { id: string }).id;
  // İP-2C: başarılı taş kaydı oluşturma → usage event (server-resolved tenant/user; idempotent; throw etmez).
  await trackUsage(guard, req, {
    module: "stones",
    action: "record_created",
    subEntity: "stone",
    resourceId: newId,
    legacyEventType: "record_created",
  });
  return NextResponse.json({ ok: true, id: newId });
}
