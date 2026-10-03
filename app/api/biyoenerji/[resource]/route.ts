import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  getBioResource,
  sanitizeBioSearch,
  validateBioFields,
} from "@/lib/biyoenerji/resourceConfig";
import { bioDbError } from "@/lib/biyoenerji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { readAllPaged } from "@/lib/db/readAllPaged";
import { isUuid } from "@/lib/biyoenerji/uuid";

export const runtime = "nodejs";

/** A4-B — `.in()` ile URL'ye güvenle sığan id sayısı (36+1 karakter × 150 ≈ 5.6 KB). */
const IN_URL_SAFE_IDS = 150;
/** A4-B — tek seçili silmede üst sınır (RPC ile aynı). */
const MAX_DELETE_IDS = 5000;

/** RPC henüz uygulanmamış (PostgREST PGRST202 / Postgres 42883) → mevcut yola düş. */
function isMissingRpcError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = String(e?.code ?? "");
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(String(e?.message ?? ""));
}

/**
 * USAGE360: [resource] (resourceConfig anahtarı) → sabit alt-varlık eşlemesi.
 * Yalnız whitelist'teki kaynaklar (getBioResource) buraya ulaşır.
 */
const BIO_USAGE_SUB_ENTITY: Record<string, string> = {
  sessions: "session",
  "energy-bodies": "energy_body",
  "subconscious-causes": "subconscious",
  imaginations: "imagination",
  symbols: "symbol",
  chakras: "chakra",
};

/**
 * /api/biyoenerji/[resource] — biyoenerji kayıtları liste/oluştur.
 *
 * Güvenlik (proje standardı):
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA session'dan alınır; body/query'den GÜVENİLMEZ.
 *   - resource whitelist + kolon whitelist (çapraz-tenant ve kolon enjeksiyonu engellenir).
 *   - BIO-005/009: yazma alanları sunucuda doğrulanır + normalize edilir (trim/maxLength/tip/required).
 *   - BIO-013: ham DB error.message istemciye DÖNMEZ (bkz. bioDbError).
 *   - Demo hesap: yazma yapılmaz.
 *
 * GET  ?count=1&search=        → { ok, count }
 * GET  ?lastCreated=1          → { ok, lastCreatedAt }
 * GET  ?offset=&limit=&search= → { ok, rows }
 * POST { ...fields }           → { ok, row }
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });

  const { db, tenantId } = guard;
  const url = new URL(req.url);
  const search = sanitizeBioSearch(url.searchParams.get("search"));
  const orFilter =
    search.length > 0
      ? cfg.search.map((c) => `${c}.ilike.%${search}%`).join(",")
      : null;

  // Kategori filtresi — yalnız "category" kolonu olan kaynaklarda geçerli (tam eşleşme).
  const hasCategoryCol = cfg.write.includes("category");
  const categoryParam = (url.searchParams.get("category") ?? "").trim();
  const categoryFilter = hasCategoryCol && categoryParam.length > 0 ? categoryParam.slice(0, 100) : null;

  // Benzersiz kategori listesi (kategori filtresi açılır menüsü)
  if (url.searchParams.get("distinct") === "category") {
    if (!hasCategoryCol) return NextResponse.json({ ok: true, categories: [] });
    // BIO-19 — sayfalı okuma: önceki `.limit(5000)` PostgREST max-rows (1000) ile
    // sessizce kesiliyor, 1000. satırdan sonraki kategoriler açılır listede görünmüyordu.
    const { rows, error } = await readAllPaged<{ category?: string | null }>(
      (from, to) =>
        db
          .from(cfg.table)
          .select("category", { count: "exact" })
          .eq("tenant_id", tenantId)
          .not("category", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 50_000 },
    );
    if (error) return bioDbError(`${resource}.categories`, error, "Kategoriler getirilemedi.");
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.category ?? "").trim();
      if (c) set.add(c);
    }
    const categories = [...set].sort((a, b) => a.localeCompare(b, "tr"));
    return NextResponse.json({ ok: true, categories });
  }

  // Son kayıt tarihi (Son kayıt istatistiği)
  if (url.searchParams.get("lastCreated") === "1") {
    const { data, error } = await db
      .from(cfg.table)
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) return bioDbError(`${resource}.lastCreated`, error, "Kayıt bilgisi getirilemedi.");
    return NextResponse.json({ ok: true, lastCreatedAt: (data as { created_at?: string } | null)?.created_at ?? null });
  }

  // Sayım
  if (url.searchParams.get("count") === "1") {
    let q = db.from(cfg.table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    if (orFilter) q = q.or(orFilter);
    if (categoryFilter) q = q.eq("category", categoryFilter);
    const { count, error } = await q;
    if (error) return bioDbError(`${resource}.count`, error, "Kayıt sayısı getirilemedi.");
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  // Liste (sayfalı)
  const offsetRaw = Number(url.searchParams.get("offset"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 500;

  let q = db
    .from(cfg.table)
    .select("*")
    .eq("tenant_id", tenantId)
    .order(cfg.orderCol, { ascending: cfg.orderAsc, nullsFirst: false })
    // A2 — benzersiz ikinci anahtar (PK id): aynı başlık/ad değerlerinde sayfa sınırında
    // tekrar/atlama olmaz; offset sayfalaması deterministik.
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (orFilter) q = q.or(orFilter);
  if (categoryFilter) q = q.eq("category", categoryFilter);

  const { data, error } = await q;
  if (error) return bioDbError(`${resource}.list`, error, "Kayıtlar getirilemedi.");
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, row: null });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // BIO-005/009: sunucu-canonical doğrulama + trim/normalizasyon (tam kayıt).
  const validated = validateBioFields(cfg, body, { partial: false });
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const { data, error } = await db
    .from(cfg.table)
    .insert({ ...validated.fields, tenant_id: tenantId })
    .select()
    .single();

  const usageSubEntity = BIO_USAGE_SUB_ENTITY[resource] ?? null;
  if (error) {
    await trackUsage(guard, req, { module: "energy_body", action: "action_failed", failedAction: "record_created", subEntity: usageSubEntity, errorClass: "server" });
    return bioDbError(`${resource}.create`, error, "Kayıt eklenemedi.");
  }
  const newId = (data as { id?: unknown } | null)?.id;
  await trackUsage(guard, req, {
    module: "energy_body",
    action: "record_created",
    subEntity: usageSubEntity,
    resourceId: newId != null ? String(newId) : null,
  });
  return NextResponse.json({ ok: true, row: data });
}

/**
 * DELETE /api/biyoenerji/[resource] — toplu silme.
 *
 * Body:
 *   { ids: string[] }  → seçili kayıtları sil (en çok 1000)
 *   { all: true }      → bu modüldeki TÜM tenant kayıtlarını sil ("Tümünü Sil")
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA session'dan.
 *   - Her sorgu .eq("tenant_id", tenantId) ile sınırlanır → başka tenant verisi
 *     ASLA silinemez (id'ler başka tenant'a aitse hiçbir şey silinmez).
 *   - resource whitelist (getBioResource).
 *   - Demo hesap: silme yapılmaz.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;

  const { resource } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const usageSubEntity = BIO_USAGE_SUB_ENTITY[resource] ?? null;

  let body: { ids?: unknown; all?: unknown; expectedCount?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown; all?: unknown; expectedCount?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // "Tümünü Sil" — bu tenant'ın tüm kayıtları
  if (body.all === true) {
    // BIO-13 — yıkıcı kapsam doğrulaması: istemci, kullanıcının 3 aşamalı onayda gördüğü
    // TOPLAM kayıt sayısını (expectedCount) göndermek ZORUNDA. Sunucudaki gerçek toplam
    // farklıysa (ör. başka sekmede kayıt eklendi) hiçbir şey silinmez → 409.
    const expected = body.expectedCount;
    if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
      return NextResponse.json(
        { ok: false, error: "Silme onayı doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin." },
        { status: 400 },
      );
    }
    const { count: actual, error: countErr } = await db
      .from(cfg.table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countErr) return bioDbError(`${resource}.deleteAll.count`, countErr, "Kayıtlar silinemedi.");
    if ((actual ?? 0) !== expected) {
      return NextResponse.json(
        {
          ok: false,
          error: `Onaylanan kayıt sayısı (${expected}) güncel toplamla (${actual ?? 0}) uyuşmuyor; hiçbir kayıt silinmedi. Lütfen listeyi yenileyip tekrar deneyin.`,
        },
        { status: 409 },
      );
    }
    const { data, error } = await db
      .from(cfg.table)
      .delete()
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) {
      await trackUsage(guard, req, { module: "energy_body", action: "action_failed", failedAction: "record_deleted", subEntity: usageSubEntity, errorClass: "server" });
      return bioDbError(`${resource}.deleteAll`, error, "Kayıtlar silinemedi.");
    }
    const deleted = data?.length ?? 0;
    // Toplu silme → TEK olay + itemCount (0 satır silindiyse olay yok).
    if (deleted > 0) {
      await trackUsage(guard, req, { module: "energy_body", action: "record_deleted", subEntity: usageSubEntity, itemCount: deleted });
    }
    return NextResponse.json({ ok: true, deleted });
  }

  // Seçilenleri sil
  if (Array.isArray(body.ids)) {
    const ids = [...new Set(body.ids.filter((x): x is string => isUuid(x)).map((x) => x.trim()))];
    if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });
    // Seçimin bir kısmını sessizce kırpıp YARIM silme yapılmaz: sınır aşılırsa hiçbir şey silinmez.
    if (ids.length > MAX_DELETE_IDS) {
      return NextResponse.json(
        { ok: false, error: `Tek seferde en fazla ${MAX_DELETE_IDS} kayıt silinebilir (seçilen: ${ids.length}). Hiçbir kayıt silinmedi.` },
        { status: 400 },
      );
    }

    // A4-B — uzun id listesi URL'ye girmesin diye RPC (gövdede uuid[]) ile TEK ifadede, ATOMİK
    // silme. Kısa listede veya fonksiyon henüz yoksa mevcut tek-ifadeli `.in()` yolu (bugünkü
    // davranışın aynısı; hata → hiçbir şey silinmez). Parça parça DELETE YOK (yarım silme riski).
    let deleted = 0;
    let delError: unknown = null;
    let usedRpc = false;
    if (ids.length > IN_URL_SAFE_IDS) {
      const rpc = await db.rpc("bioenergy_delete_rows", { p_table: cfg.table, p_tenant_id: tenantId, p_ids: ids });
      if (!rpc.error) {
        usedRpc = true;
        deleted = Number(rpc.data ?? 0);
      } else if (!isMissingRpcError(rpc.error)) {
        delError = rpc.error;
      }
    }
    if (!usedRpc && !delError) {
      const { data, error } = await db
        .from(cfg.table)
        .delete()
        .eq("tenant_id", tenantId)
        .in("id", ids)
        .select("id");
      if (error) delError = error;
      else deleted = data?.length ?? 0;
    }
    if (delError) {
      await trackUsage(guard, req, { module: "energy_body", action: "action_failed", failedAction: "record_deleted", subEntity: usageSubEntity, errorClass: "server" });
      return bioDbError(`${resource}.deleteMany`, delError, "Kayıtlar silinemedi. Hiçbir kayıt silinmedi.");
    }
    if (deleted > 0) {
      await trackUsage(guard, req, { module: "energy_body", action: "record_deleted", subEntity: usageSubEntity, itemCount: deleted });
    }
    return NextResponse.json({ ok: true, deleted });
  }

  return NextResponse.json({ ok: false, error: "ids veya all gerekli." }, { status: 400 });
}
