import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/video-ceviri/job — video_transcription_jobs güvenli YAZMA/LİSTE kapısı (K-3).
 *
 * Neden: iş kaydı oluşturma/güncelleme tarayıcıdan anon key ile yapılıyordu →
 * güvenlik tamamen RLS'e bağlıydı ve anon yazma cross-tenant riski taşıyordu.
 * Artık tüm yazmalar service_role ile SUNUCUDA; kimlik verifyUserRequest ile
 * doğrulanır, tenant_id + user_id oturumdan alınır (body'den GÜVENİLMEZ).
 *
 * Kapsam: yalnız video_transcription_jobs tablosu. Storage (video-temp bucket)
 * yükleme işlemi bu route'un dışındadır (ayrı bucket politikası).
 */

const TABLE = "video_transcription_jobs";
const LIST_SELECT =
  "id, tenant_id, user_id, status, original_filename, file_size_bytes, source_language, error_message, transcript_original, transcript_tr, summary_text, headings_text, processing_started_at, processing_completed_at, video_deleted_at, created_at, updated_at";

// Client'ın PATCH ile yazabileceği status yalnız 'failed' — 'completed' vb. sunucu işidir.
const CLIENT_ALLOWED_STATUS = new Set(["failed"]);

// ─── GET — kullanıcının video işleri (tenant + user) ──────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId } = guard;

  const { data, error } = await db
    .from(TABLE)
    .select(LIST_SELECT)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST — yeni iş oluştur ───────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const originalFilename = String(body.originalFilename ?? "").trim();
  const sizeNum = Number(body.fileSizeBytes);
  const sourceLanguage = String(body.sourceLanguage ?? "auto");
  if (!originalFilename) {
    return NextResponse.json({ ok: false, error: "Dosya adı gerekli." }, { status: 400 });
  }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      status: "uploaded",
      original_filename: originalFilename,
      file_size_bytes: Number.isFinite(sizeNum) ? sizeNum : null,
      source_language: sourceLanguage,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Kayıt oluşturulamadı." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, jobId: String(data.id) });
}

// ─── PATCH — iş güncelle (video_temp_path / status=failed / error_message) ─────
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const jobId = String(body.jobId ?? "").trim();
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId gerekli." }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (typeof body.videoTempPath === "string") fields.video_temp_path = body.videoTempPath;
  if (typeof body.status === "string" && CLIENT_ALLOWED_STATUS.has(body.status)) fields.status = body.status;
  if (typeof body.errorMessage === "string") fields.error_message = body.errorMessage;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { error } = await db
    .from(TABLE)
    .update(fields)
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
