import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

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
 */

type StoneWarningResult = {
  stoneId: string;
  stoneName: string;
  warningText: string | null;
  warningTags: string[] | null;
};

/** stones route ile aynı: normal uzman → yalnız kendi tenant; demo → library de dahil. */
function tenantIdsFor(tenantId: string, isDemo: boolean): string[] {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [tenantId];
  return isDemo ? [tenantId, ADMIN_LIBRARY_TENANT_ID] : [tenantId];
}

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
  const { data, error } = await db
    .from("stones")
    .select("id, stone_name, warning_text, warning_tags")
    .in("tenant_id", ids);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: unknown;
    stone_name: unknown;
    warning_text: unknown;
    warning_tags: unknown;
  }>;

  const results: StoneWarningResult[] = [];
  for (const inputName of stoneNames) {
    const normalizedInput = normalizeTr(inputName);
    if (!normalizedInput) continue;

    const match = rows.find(
      (row) => normalizeTr(String(row.stone_name ?? "").trim()) === normalizedInput,
    );
    if (!match) continue;

    const hasText = String(match.warning_text ?? "").trim().length > 0;
    const hasTags = Array.isArray(match.warning_tags) && match.warning_tags.length > 0;
    if (!hasText && !hasTags) continue;

    results.push({
      stoneId: String(match.id),
      stoneName: String(match.stone_name),
      warningText: hasText ? String(match.warning_text) : null,
      warningTags: hasTags ? (match.warning_tags as string[]) : null,
    });
  }

  return NextResponse.json({ ok: true, warnings: results });
}
