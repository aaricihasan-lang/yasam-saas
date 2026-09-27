import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { handleBackupTableRequest } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/settings/backup/table?name=<tablo>&cursor=<opak>
 *
 * Tek tablonun tek sayfası (PK sıralı keyset, ≤500 satır). `done:true` YALNIZ boş sayfada döner —
 * istemci kısa sayfada durmaz (PostgREST max-rows sınırına güvenilmez). İlk sayfada `expected_count`
 * (head count) döner; istemci satır sayısıyla karşılaştırıp tabloyu tam/eksik işaretler.
 *
 * Tablo adı yalnız registry'deki dışa aktarılabilir tablolardan olabilir; tenant oturumdan zorlanır.
 * Üyelik kapısı YOK (kendi verisini dışa aktarma hakkı).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  try {
    const result = await handleBackupTableRequest(guard.db, guard.tenantId, params.get("name"), params.get("cursor"));
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[settings/backup/table]", err);
    return NextResponse.json(
      { ok: false, table: params.get("name"), rows: [], next_cursor: null, done: true, error: "Tablo okunamadı." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
