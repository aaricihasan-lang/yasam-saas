import { isTrialRestrictedRow } from "@/lib/trial/trialCore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { grantHdUnlimited24h, readUnlimitedGrantStatus, requireHdUnlimitedOwner } from "@/lib/human-design/quota/unlimitedGrant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Human Design — 24 saatlik geçici sınırsız kullanım izni (YALNIZ sistem sahibi).
 * GET  ?userId=<uuid>  → durum (owner değilse 404 → ekranda bölüm hiç çizilmez).
 * POST { userId }      → 24 saatlik izin aç (aktif izin varsa süre UZATILMAZ; mevcut izin döner).
 * Kimlik ve yetki yalnız sunucuda: token'a bağlı admin oturumu + DB'de is_super_admin. İstemci rol/kimlik bilgisi kullanılmaz.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const notFound = () => NextResponse.json({ ok: false, error: "Bulunamadı." }, { status: 404, headers: NO_STORE });

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireHdUnlimitedOwner(req);
  if (!gate.ok) return notFound();
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  try {
    const status = await readUnlimitedGrantStatus(gate.db, userId);
    if (!status) return notFound();
    return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "İzin durumu okunamadı." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireHdUnlimitedOwner(req);
  if (!gate.ok) return notFound();
  let body: { userId?: unknown };
  try {
    body = (await req.json()) as { userId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  // TRIAL7 (Owner): 7 günlük deneme uzmanına sınırsız Human Design hesaplama ayrıcalığı VERİLMEZ.
  if (userId) {
    const { data: target } = await gate.db.from("users").select("trial_kind, trial_status, package_type").eq("id", userId).maybeSingle();
    if (isTrialRestrictedRow(target as Record<string, unknown> | null)) {
      return NextResponse.json(
        { ok: false, code: "TRIAL_INELIGIBLE", error: "Ücretsiz deneme üyelerine sınırsız Human Design izni verilemez." },
        { status: 400, headers: NO_STORE },
      );
    }
  }
  try {
    const r = await grantHdUnlimited24h(gate.db, gate.ownerId, userId);
    if (r.status === "forbidden") return notFound();
    if (r.status === "ineligible") {
      return NextResponse.json({ ok: false, code: "INELIGIBLE", error: "Bu hesaba verilemez: aktif, onaylı ve demo olmayan bir uzman olmalı." }, { status: 400, headers: NO_STORE });
    }
    const status = await readUnlimitedGrantStatus(gate.db, userId);
    return NextResponse.json({ ok: true, result: r.status, status }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "İzin tanımlanamadı. Lütfen tekrar deneyin." }, { status: 500, headers: NO_STORE });
  }
}
