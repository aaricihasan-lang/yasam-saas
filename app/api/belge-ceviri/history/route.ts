import { NextResponse } from "next/server";
import { assertUserModuleAccess } from "@/lib/auth/moduleAccess";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STORAGE_BUCKET = "belge-ceviri";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId")?.trim() ?? "";
    const userId   = searchParams.get("userId")?.trim()   ?? "";

    if (!userId || !tenantId) {
      return NextResponse.json({ error: "Oturum bilgisi eksik." }, { status: 401 });
    }

    const db = getDb();

    const { data: userRow, error: userErr } = await db
      .from("users")
      .select("id, is_demo_account")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .maybeSingle();

    if (userErr || !userRow) {
      return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 403 });
    }

    const __moduleGate = await assertUserModuleAccess(db, userId, "belge_ceviri");
    if (!__moduleGate.ok) return __moduleGate.response;

    // Demo hesap: geçmiş listesi boş döner (gerçek job verisi gösterilmez).
    if (userRow.is_demo_account === true) {
      return NextResponse.json({ jobs: [] });
    }

    const { data: jobs, error } = await db
      .from("belge_ceviri_jobs")
      .select(
        "id, file_name, status, job_type, total_pages, done_chunks, total_chunks, result_path, error_message, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
        return { ...job, downloadUrl };
      }),
    );

    return NextResponse.json({ jobs: jobsWithUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
