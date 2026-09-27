import { NextResponse, type NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

const STORAGE_BUCKET = "belge-ceviri";

/**
 * GET /api/belge-ceviri/history
 *
 * FAZ1 FINAL HARDENING (AUTH): kimlik YALNIZ header'dan (x-user-id + x-session-token →
 * verifyUserRequest). Query'deki userId/tenantId YOK SAYILIR (spoof edilemez). Üyelik
 * kapısı BİLİNÇLİ OLARAK YOK: üyeliği biten uzman kendi eski çıktısını indirebilir
 * (owner kararı "kendi verisini dışa aktarabilir"); veri yalnız guard.tenantId +
 * guard.userId sahipliğiyle filtrelenir. Ham DB hata mesajı istemciye sızmaz.
 */
export async function GET(request: NextRequest) {
  const guard = await verifyUserRequest(request);
  if (!guard.ok) return guard.response;

  try {
    // Demo hesap: geçmiş listesi boş döner (gerçek job verisi gösterilmez).
    if (guard.is_demo_account) {
      return NextResponse.json({ jobs: [] });
    }

    const db = guard.db;
    const { data: jobs, error } = await db
      .from("belge_ceviri_jobs")
      .select(
        "id, file_name, status, job_type, total_pages, done_chunks, total_chunks, result_path, error_message, created_at",
      )
      .eq("tenant_id", guard.tenantId)
      .eq("user_id", guard.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[belge-ceviri/history] liste okunamadı");
      return NextResponse.json({ error: "Geçmiş yüklenemedi." }, { status: 500 });
    }

    const jobsWithUrls = await Promise.all(
      (jobs ?? []).map(async (job) => {
        let downloadUrl: string | null = null;
        if (job.status === "completed" && job.result_path) {
          const { data: signed } = await db.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(job.result_path as string, 3600);
          downloadUrl = signed?.signedUrl ?? null;
        }
        // result_path (storage iç yolu) istemciye dönmez; yalnız imzalı URL.
        const { result_path: _omit, ...rest } = job as Record<string, unknown>;
        void _omit;
        return { ...rest, downloadUrl };
      }),
    );

    return NextResponse.json({ jobs: jobsWithUrls });
  } catch {
    return NextResponse.json({ error: "Geçmiş yüklenemedi." }, { status: 500 });
  }
}
