import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { stoneReadTenantIds } from "@/lib/dogaltas/stoneTenantScope";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
import { serverErrorResponse } from "@/lib/http/apiError";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";
import { effectiveWarningText, loadExtraWarningParts } from "@/lib/dogaltas/stoneWarningSources";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stone-warnings — danışana taş atanırken taşın Doğaltaş uyarısını
 * (warning_text / warning_tags) GÜVENLİ şekilde döndürür (K-1 düzeltmesi).
 *
 * Neden bu route var:
 *   Eski `lib/stones/stoneWarningService.ts` uyarıları client/anon Supabase ile
 *   `stones` tablosundan çekiyordu. RLS güvenlik kilidi (Faz 1-C) anon erişimi
 *   kapatınca sorgu 401 dönüyor, hata sessizce [] oluyor ve uyarı modalı hiç
 *   açılmıyordu. Artık uyarı kontrolü diğer Doğaltaş erişimleri gibi burada,
 *   service_role + requireModuleAccess ile yapılır.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDAN (oturumdan) alınır; client body/query'den ALINMAZ.
 *   - service_role yalnız burada (guard.db).
 *   - tenant-only mimari: normal uzman yalnız kendi tenant'ının taşlarını görür
 *     (stones route ile birebir tenantIdsFor). Tek istisna DEMO → library de dahil.
 *
 * TAS-03: uyarı metni yalnız stones.warning_text değil; ek kaynaklar (stone_sources) ve bilgi
 *   kayıtları (stone_entries, "Uyarılar") birlikte okunur — eski metin bilgi kaydına dönüşünce
 *   uyarı artık kaybolmaz (lib/dogaltas/stoneWarningSources). Metin üretilmez, aynen birleştirilir.
 * TAS-05b: aynı ada sahip TÜM taşlar dikkate alınır (yalnız ilk eşleşme değil); uyarıları tek
 *   kartta birleşir, bağlantı uyarısı olan ilk taşa gider.
 */

type StoneWarningResult = {
  stoneId: string;
  stoneName: string;
  warningText: string | null;
  warningTags: string[] | null;
};

/** Okuma görünürlüğü: ortak kural (lib/dogaltas/stoneTenantScope). */
const tenantIdsFor = stoneReadTenantIds;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const stoneNames = Array.isArray(body?.stoneNames)
    ? body.stoneNames.map((s) => String(s ?? "").trim()).filter((s) => s.length > 0)
    : [];
  if (stoneNames.length === 0) {
    return NextResponse.json({ ok: true, warnings: [] });
  }

  const ids = tenantIdsFor(tenantId, is_demo_account);
  // P2-07: güvenlik uyarısı eşleşmesi 1000. satırdan sonraki taşları da kapsar (sayfalı).
  const res = await fetchAllRows<Record<string, unknown>>((from, to) =>
    db
      .from("stones")
      .select("id, stone_name, warning_text, warning_tags")
      .in("tenant_id", ids)
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (!res.ok) {
    return serverErrorResponse({ route: "dogaltas/stone-warnings", action: "POST", tenantId, cause: res.error });
  }
  const data = res.rows;

  const rows = (data ?? []) as Array<{
    id: unknown;
    stone_name: unknown;
    warning_text: unknown;
    warning_tags: unknown;
  }>;

  // Her girdi adı için AYNI adlı tüm taşlar (TAS-05b).
  const matchesByName: Array<{ matches: typeof rows }> = [];
  const matchedIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const inputName of stoneNames) {
    const normalizedInput = normalizeTr(inputName);
    if (!normalizedInput || seenNames.has(normalizedInput)) continue;
    seenNames.add(normalizedInput);
    const matches = rows.filter(
      (row) => normalizeTr(String(row.stone_name ?? "").trim()) === normalizedInput,
    );
    if (matches.length === 0) continue;
    matchesByName.push({ matches });
    for (const m of matches) matchedIds.add(String(m.id));
  }

  // Ek uyarı kaynakları yalnız eşleşen taşlar için okunur (TAS-03).
  let extra: Awaited<ReturnType<typeof loadExtraWarningParts>>;
  try {
    extra = await loadExtraWarningParts(db, ids, [...matchedIds]);
  } catch (e) {
    return serverErrorResponse({ route: "dogaltas/stone-warnings", action: "POST", tenantId, cause: e });
  }

  const results: StoneWarningResult[] = [];
  for (const { matches } of matchesByName) {
    const texts: string[] = [];
    const tags: string[] = [];
    let first: (typeof rows)[number] | null = null;
    for (const m of matches) {
      const text = effectiveWarningText(m.warning_text, extra.get(String(m.id)));
      const mTags = Array.isArray(m.warning_tags)
        ? (m.warning_tags as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean)
        : [];
      if (!text && mTags.length === 0) continue;
      first ??= m;
      if (text) texts.push(text);
      for (const t of mTags) if (!tags.includes(t)) tags.push(t);
    }
    if (!first) continue;
    const warningText = effectiveWarningText(null, texts.map((text, i) => ({ order: i, text })));

    results.push({
      stoneId: String(first.id),
      stoneName: String(first.stone_name),
      warningText,
      warningTags: tags.length > 0 ? tags : null,
    });
  }

  return NextResponse.json({ ok: true, warnings: results });
}
