/**
 * lib/archive/server/http.ts — Premium Word Arşivi rota sarmalayıcısı (kimlik, demo kapısı, hız sınırı, yanıt).
 *
 * Kimlik: verifyUserRequest (oturum belirteci + kullanıcı bağı + kaynak denetimi; pasif / onaysız hesap reddedilir).
 * Üyelik kapısı YOK (süresi dolmuş uzman da kendi kayıtlarını arşivler). Demo hesap: 403. Yanıtlar no-store, private.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isAndroidUserAgent } from "@/lib/platform/android";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { archiveCtxFrom, type HandlerResult } from "./handlers";
import type { ArchiveCtx } from "./reports";

assertServerOnly("lib/archive/server/http");

const NO_STORE = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function runArchiveRoute(
  req: NextRequest,
  scope: string,
  limitPerMinute: number,
  handler: (ctx: ArchiveCtx, body: unknown) => Promise<HandlerResult>,
): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403, headers: NO_STORE });
  const rl = await hitDbRateLimit(guard.db, rateLimitBucket(scope, guard.tenantId), limitPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Çok fazla istek; arşiv kısa bir bekleme sonrası kaldığı yerden devam eder." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 30) } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400, headers: NO_STORE });
  }
  const ctx = archiveCtxFrom(guard, req.headers.get("user-agent"), isAndroidUserAgent);
  try {
    const r = await handler(ctx, body);
    if (r.kind === "json") return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
    const ascii = r.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    return new Response(Buffer.from(r.bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        ...r.headers,
        "Content-Type": DOCX,
        "Content-Length": String(r.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
        "X-Archive-File-Name": encodeURIComponent(r.fileName),
        "Access-Control-Expose-Headers": "X-Archive-Next, X-Archive-Rows, X-Archive-Errors, X-Archive-Note, X-Archive-File-Name",
      },
    });
  } catch (err) {
    console.error(`[settings/archive] ${scope}`, (err as Error)?.message ?? err);
    return NextResponse.json({ ok: false, error: "Arşiv parçası oluşturulamadı; yeniden denenebilir." }, { status: 500, headers: NO_STORE });
  }
}
