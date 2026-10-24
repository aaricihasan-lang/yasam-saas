import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess, type UserGuardOk } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { serverErrorResponse } from "@/lib/http/apiError";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { redactAnalysisDataForFutureYears } from "@/app/numeroloji/utils/futureYearsRedaction";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";
import {
  ensureClientNumerologyAnalysis,
  findClientNumerologyAnalysis,
  type AutoClientRow,
  type AutoNumerologyRecord,
} from "@/lib/danisan/numerologyAuto";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE = "clients/[id]/numerology-analysis";

/**
 * /api/clients/[id]/numerology-analysis — danışan detayı "Numeroloji" sekmesi (owner kararları 24–25.10.2026).
 *
 * GET  → SALT-OKUNUR: danışana bağlı güncel tam analizi döndürür; yoksa `status: "not_ready"` (DB'ye YAZMAZ).
 * POST → eksik analizi güvenli tekil yazma ile oluşturur (lib/danisan/numerologyAuto: kopya yok, eşzamanlılıkta
 *        tek kayıt, geçmiş korunur) ve aynı görünümü döndürür. Cookie oturumunda CSRF denetimi guard'dadır.
 * Kapılar (ikisinde de, sunucu-otoriter): clients → numerology (yoksa 403, hiçbir hesap/kayıt yok) → tenant (404).
 * Gelecek Yıllar: yanıttaki `analysis_data`, alt-yetki yoksa SUNUCUDA süzülmüş görüntüleme kopyasıdır
 * (redactAnalysisDataForFutureYears — Numeroloji modülü kayıt ucuyla AYNI kural); DB kaydı değişmez.
 * Demo vitrin hesabı: POST de DB'ye yazmaz (geçici sonuç).
 */
type Gate = { ok: true; guard: UserGuardOk; client: AutoClientRow } | { ok: false; response: Response };

async function gate(req: NextRequest, params: Promise<{ id: string }>): Promise<Gate> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return { ok: false, response: guard.response };
  const { id: clientId } = await params;
  if (!clientId || !UUID_RE.test(clientId)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Geçersiz danışan." }, { status: 400, headers: NO_STORE }) };
  }
  if (!hasModulePermissionForProfile(guard.profile, "numerology")) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "NUMEROLOGY_FORBIDDEN", error: "Numeroloji analizi için Numeroloji modülü yetkisi gerekir." },
        { status: 403, headers: NO_STORE },
      ),
    };
  }
  const { data: client, error } = await guard.db
    .from("clients")
    .select("id, ad, soyad, dogum")
    .eq("tenant_id", guard.tenantId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) return { ok: false, response: serverErrorResponse({ route: ROUTE, action: "read-client", tenantId: guard.tenantId, cause: error }) };
  if (!client) return { ok: false, response: NextResponse.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404, headers: NO_STORE }) };
  return { ok: true, guard, client: client as AutoClientRow };
}

function view(guard: UserGuardOk, record: AutoNumerologyRecord, extra: Record<string, unknown> = {}): Response {
  const futureYears = canSeeNumerologyFutureYears(guard.profile);
  const analysis_data = redactAnalysisDataForFutureYears(record.analysis_data, { futureYears, currentYear: currentIstanbulYear(), birthDate: record.birth_date });
  return NextResponse.json({ ok: true, status: "ok", futureYears, record: { ...record, analysis_data }, ...extra }, { headers: NO_STORE });
}

function nonOk(guard: UserGuardOk, status: string): Response {
  if (status === "missing_birth" || status === "missing_name") {
    return NextResponse.json({ ok: true, status, futureYears: canSeeNumerologyFutureYears(guard.profile) }, { headers: NO_STORE });
  }
  if (status === "unavailable") {
    return NextResponse.json({ ok: false, code: "NUMEROLOGY_LINK_UNAVAILABLE", error: "Numeroloji danışan bağlantısı şu anda kullanılamıyor." }, { status: 503, headers: NO_STORE });
  }
  return serverErrorResponse({ route: ROUTE, action: "numerology-analysis", tenantId: guard.tenantId, cause: new Error(`numerology_auto_${status}`) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gate(req, params);
  if (!g.ok) return g.response;
  const { guard, client } = g;
  if (guard.is_demo_account === true) {
    // Demo vitrin: kayıt yazılmaz; geçici sonuç (yine süzülür).
    const r = await ensureClientNumerologyAnalysis(guard.db, guard.tenantId, client, { persist: false });
    return r.status === "ok" ? view(guard, r.record, { created: false }) : nonOk(guard, r.status);
  }
  const f = await findClientNumerologyAnalysis(guard.db, guard.tenantId, client);
  if (f.status === "ok") return view(guard, f.record, { created: false });
  if (f.status === "not_found") {
    return NextResponse.json({ ok: true, status: "not_ready", futureYears: canSeeNumerologyFutureYears(guard.profile) }, { headers: NO_STORE });
  }
  return nonOk(guard, f.status);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gate(req, params);
  if (!g.ok) return g.response;
  const { guard, client } = g;
  const r = await ensureClientNumerologyAnalysis(guard.db, guard.tenantId, client, { persist: guard.is_demo_account !== true });
  return r.status === "ok" ? view(guard, r.record, { created: r.created }) : nonOk(guard, r.status);
}
