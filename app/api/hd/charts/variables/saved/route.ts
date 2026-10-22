import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { readSavedChartVariables } from "@/lib/human-design/variables/variablesService";

export const runtime = "nodejs";

/**
 * POST /api/hd/charts/variables/saved — { chart_id } → kayıtlı analizin KAYITLI Dört Ok / PHS sonucu (SALT-OKUNUR).
 *
 * Sekme açılışında otomatik çağrılır; HESAPLAMA YAPMAZ:
 *   • Sağlayıcı yapılandırması / çağrısı, eşzamanlılık kilidi ve kota sayacı bu uca HİÇ verilmez → ücretli çağrı imkânsız.
 *   • DB'ye yazmaz (bozuk / eşleşmeyen kayıt yalnız "bulunamadı" sayılır; düzeltme yalnız açık hesaplama eylemiyle).
 *   • Yetki sırası hesaplama ucuyla AYNI: oturum (401) → human_design modülü (403) → hd_system_reading (403) → demo (403)
 *     → tenant-scoped kayıt (başka tenant = 404) → doğum bilgisi / anı doğrulaması → kalıcı kayıt + aynı denetimler.
 *   • Yanıt: { ok, found, chart: { id }, data? }. Kayıt yoksa found:false (istemci "Hesapla" düğmesini gösterir). no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (!hasModulePermissionForProfile(guard.profile, "hd_system_reading")) {
    return NextResponse.json({ ok: false, code: "VARIABLES_DENIED", error: "Dört Ok ve PHS analizi bu hesap için açık değil." }, { status: 403, headers: NO_STORE });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const r = await readSavedChartVariables(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    { log: (msg, detail) => console.error(msg, detail ?? "") },
  );
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." }, { status: 405, headers: { "Cache-Control": "no-store", Allow: "POST" } });
}
