import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { listRelationCandidates } from "@/lib/human-design/relations/relationService";

export const runtime = "nodejs";

/**
 * GET /api/hd/relations/candidates — katılımcı seçimi: bu hesabın HD danışanları + her biri için
 * kullanılabilir (otomatik, eksiksiz, güncel) BodyGraph analizi. Başka uzmanın danışanı listelenmez.
 * Roxy çağrısı YOK; hesap sonucu / ham yanıt dönmez.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const r = await listRelationCandidates({ db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account });
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: "Danışanlar yüklenemedi. Sayfayı yenileyin." }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows: r.rows }, { status: 200, headers: NO_STORE });
}
