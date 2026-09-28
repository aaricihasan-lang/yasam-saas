/**
 * GET /api/admin/expert-stats/usage360/timeline?userId=&from=&to=&cursor=&limit=
 *
 * İçeriksiz aktivite zaman çizelgesi: saat · kanal · modül · işlem türü (+ alt-varlık türü).
 * Keyset sayfalama (opak imleç), 50/sayfa varsayılan, en fazla 100; aralık en fazla 90 gün.
 * Danışan adı, kayıt kimliği/başlığı, dosya adı, hata mesajı DÖNMEZ (RPC bu alanları taşımaz).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid } from "@/lib/admin/stats/statsRequest";
import { decodeCursor, encodeCursor, mapTimelineRow } from "@/lib/admin/stats/usage360Api";
import { parseYmdRange, TIMELINE_MAX_DAYS } from "@/lib/admin/stats/usage360Period";
import type { Usage360TimelineData } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId")?.trim() ?? "";
  if (!isUuid(userId)) return NextResponse.json({ ok: false, error: "Geçerli userId gerekli." }, { status: 400, headers: NO_STORE });
  const range = parseYmdRange(sp.get("from"), sp.get("to"), TIMELINE_MAX_DAYS);
  if (!range.ok) return NextResponse.json({ ok: false, error: range.error }, { status: 400, headers: NO_STORE });
  const cursor = decodeCursor(sp.get("cursor"));
  if (cursor === "invalid") return NextResponse.json({ ok: false, error: "Geçersiz imleç." }, { status: 400, headers: NO_STORE });
  const limitRaw = Number(sp.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), 100) : 50;

  const { data, error } = await db.rpc("usage360_expert_timeline", {
    p_user_id: userId,
    p_from: range.from,
    p_to: range.to,
    p_before_at: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) {
    console.error("[usage360-admin] timeline failed", { code: (error as { code?: string }).code ?? null });
    return NextResponse.json({ ok: false, error: "Zaman çizelgesi okunamadı." }, { status: 500, headers: NO_STORE });
  }
  const raw = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const last = raw[raw.length - 1];
  const payload: Usage360TimelineData = {
    rows: raw.map(mapTimelineRow),
    nextCursor: raw.length === limit && last ? encodeCursor(String(last.occurred_at), String(last.id)) : null,
    from: range.from,
    to: range.to,
  };
  return NextResponse.json({ ok: true, contractVersion: 1, data: payload }, { headers: NO_STORE });
}
