import { NextRequest, NextResponse } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";
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
  const te = requestTranslator(req, "trial.api");
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (!isTrialRestrictedRow(guard.profile)) {
    return NextResponse.json({ ok: false, error: te("trialOnly") }, { status: 403, headers: NO_STORE });
  }
  const hit = await hitDbRateLimit(guard.db, rateLimitBucket("trial-pro-request", guard.userId), 10, 60 * 60);
  if (!hit.allowed) {
    return NextResponse.json({ ok: false, error: te("tooMany") }, { status: 429, headers: NO_STORE });
  }
  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: te("invalid") }, { status: 400, headers: NO_STORE });
  for (const k of Object.keys(parsed.value)) {
    if (k !== "note") return NextResponse.json({ ok: false, error: te("invalid") }, { status: 400, headers: NO_STORE });
  }
  const rawNote = parsed.value.note;
  if (rawNote !== undefined && rawNote !== null && (typeof rawNote !== "string" || rawNote.length > 500)) {
    return NextResponse.json({ ok: false, error: te("noteTooLong") }, { status: 400, headers: NO_STORE });
  }
  const r = await createProUpgradeRequest(guard.db, guard.userId, typeof rawNote === "string" ? rawNote : null);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.reason === "not_trial" ? te("trialOnly") : te("saveFailed") },
      { status: r.reason === "not_trial" ? 403 : 500, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      created: r.created,
      createdAt: r.createdAt,
      message: r.created ? te("created") : te("existing"),
    },
    { headers: NO_STORE },
  );
}
