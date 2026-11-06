import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isTrialRestrictedRow } from "@/lib/trial/trialCore";
import { createProUpgradeRequest } from "@/lib/trial/trialServer";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * POST /api/trial/pro-request — uygulama içi "Pro Üyeliğe Geç" talebi (deneme uzmanı; süresi dolmuş
 * olsa da açık). Uzman başına TEK açık talep (DB tekil indeks; eşzamanlı çift tıklama dahil) → ikinci
 * çağrı mevcut talebi döndürür. Otomatik ödeme / otomatik Pro aktivasyonu YOK: talep admin panelindeki
 * "Deneme Üyeleri" listesinde görünür; Owner ödemeyi görünce Pro'ya geçirir.
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (!isTrialRestrictedRow(guard.profile)) {
    return NextResponse.json({ ok: false, error: "Bu işlem yalnız deneme üyeleri içindir." }, { status: 403, headers: NO_STORE });
  }
  const hit = await hitDbRateLimit(guard.db, rateLimitBucket("trial-pro-request", guard.userId), 10, 60 * 60);
  if (!hit.allowed) {
    return NextResponse.json({ ok: false, error: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin." }, { status: 429, headers: NO_STORE });
  }
  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400, headers: NO_STORE });
  for (const k of Object.keys(parsed.value)) {
    if (k !== "note") return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400, headers: NO_STORE });
  }
  const rawNote = parsed.value.note;
  if (rawNote !== undefined && rawNote !== null && (typeof rawNote !== "string" || rawNote.length > 500)) {
    return NextResponse.json({ ok: false, error: "Not en fazla 500 karakter olabilir." }, { status: 400, headers: NO_STORE });
  }
  const r = await createProUpgradeRequest(guard.db, guard.userId, typeof rawNote === "string" ? rawNote : null);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.reason === "not_trial" ? "Bu işlem yalnız deneme üyeleri içindir." : "Talep kaydedilemedi. Lütfen tekrar deneyin." },
      { status: r.reason === "not_trial" ? 403 : 500, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      created: r.created,
      createdAt: r.createdAt,
      message: r.created
        ? "Pro üyelik talebiniz alındı. Ödeme bilgileri için sizinle iletişime geçeceğiz."
        : "Pro üyelik talebiniz zaten alınmış durumda. Sizinle iletişime geçeceğiz.",
    },
    { headers: NO_STORE },
  );
}
