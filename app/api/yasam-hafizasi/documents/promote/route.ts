import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { parsePromoteRequest } from "@/lib/yasam-hafizasi/documents/promoteRequest";
import { chunkText, contentHash } from "@/lib/yasam-hafizasi/documents/chunkText";

export const runtime = "nodejs";

/**
 * POST /api/yasam-hafizasi/documents/promote — Belge/Video job çıktısını KALICI, provenanslı
 * Yaşam Hafızası kaynağına dönüştürür (BF-14 Ertelenmiş Kaynaklar foundation).
 *
 * Güvenlik: tenant YALNIZ session'dan; job ownership server-side (tenant eşleşmesi); job
 * çıktısı SERVER tarafından yeniden okunur (arbitrary client text KABUL EDİLMEZ). Oluşan
 * kaynak classification='unclassified' (fail-closed; index yalnız açık safe review ile). Demo
 * write engelli. Şema uygulanmadıysa (dormant) → reason:not-active.
 */

const UNAVAILABLE = new Set(["42P01", "42883", "PGRST205", "PGRST202"]);

function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/** Ownership-doğrulanmış job'ı okur ve server-derived başlık + metin döndürür. */
async function readJobOutput(
  db: SupabaseClient,
  tenantId: string,
  jobKind: string,
  jobId: string,
): Promise<{ ok: true; title: string; text: string } | { ok: false; code: string; status: number }> {
  if (jobKind === "video" || jobKind === "transcript") {
    // video_training_records: kalıcı, tenant-owned; title + transcript_tr server-side okunur.
    const { data, error } = await db
      .from("video_training_records")
      .select("id, title, transcript_tr, tenant_id")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return { ok: false, code: UNAVAILABLE.has(error.code ?? "") ? "YH_DOC_NOT_ACTIVE" : "YH_DOC_JOB_READ_FAILED", status: UNAVAILABLE.has(error.code ?? "") ? 409 : 500 };
    if (!data) return { ok: false, code: "YH_DOC_JOB_NOT_FOUND", status: 404 };
    const title = String((data as Record<string, unknown>).title ?? "").trim();
    const text = String((data as Record<string, unknown>).transcript_tr ?? "").trim();
    if (!title || !text) return { ok: false, code: "YH_DOC_JOB_EMPTY", status: 422 };
    return { ok: true, title, text };
  }
  // document (belge_ceviri_jobs): çıktı bir dosyadır (result_path). Dosya ayrıştırma/Storage
  // okuma bu foundation'ın DIŞINDADIR → henüz desteklenmiyor (arbitrary client text kabul EDİLMEZ).
  return { ok: false, code: "YH_DOC_KIND_NOT_SUPPORTED_YET", status: 422 };
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account, profile } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) return fail("YH_MODULE_FORBIDDEN", 403);
  if (is_demo_account) return fail("YH_DEMO_READONLY", 403);

  const flags = await getTenantFlags(tenantId, db);
  if (!flags.yh_enabled) return fail("YH_NOT_ACTIVE", 403);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("YH_DOC_INVALID_BODY", 400);
  }
  const parsed = parsePromoteRequest(rawBody);
  if (!parsed.ok) return fail(parsed.code, 400);
  const { jobKind, jobId, provenance } = parsed.value;

  const job = await readJobOutput(db, tenantId, jobKind, jobId);
  if (!job.ok) return fail(job.code, job.status);

  const passages = chunkText(job.text);
  if (passages.length === 0) return fail("YH_DOC_NO_PASSAGES", 422);

  // 1) Durable source (classification='unclassified' — fail-closed varsayılan).
  const sourceRow = {
    tenant_id: tenantId,
    source_kind: jobKind === "document" ? "document" : "video",
    title: job.title.slice(0, 500),
    origin_job_ref: jobId,
    source_author: provenance.sourceAuthor ?? null,
    source_publisher: provenance.sourcePublisher ?? null,
    source_url: provenance.sourceUrl ?? null,
    rights_note: provenance.rightsNote ?? null,
    provenance_note: provenance.provenanceNote ?? null,
    status: "active",
    classification: "unclassified",
    content_hash: contentHash(job.text),
    updated_at: new Date().toISOString(),
  };
  const ins = await db.from("yh_document_sources").insert(sourceRow).select("id").maybeSingle();
  if (ins.error || !ins.data) {
    return fail(UNAVAILABLE.has(ins.error?.code ?? "") ? "YH_DOC_NOT_ACTIVE" : "YH_DOC_WRITE_FAILED", UNAVAILABLE.has(ins.error?.code ?? "") ? 409 : 500);
  }
  const documentId = String((ins.data as Record<string, unknown>).id);

  // 2) Ordered passages (classification='unclassified').
  const passageRows = passages.map((p) => ({
    tenant_id: tenantId,
    document_id: documentId,
    ordinal: p.ordinal,
    locator: p.locator,
    passage_text: p.text,
    text_hash: p.textHash,
    classification: "unclassified",
  }));
  const pins = await db.from("yh_document_passages").insert(passageRows);
  if (pins.error) {
    // Kaynak yazıldı ama passage'lar yazılamadı: kaynağı geri al (best-effort; cascade FK yok bu yönde).
    await db.from("yh_document_sources").delete().eq("id", documentId).eq("tenant_id", tenantId);
    return fail("YH_DOC_PASSAGE_WRITE_FAILED", 500);
  }

  return NextResponse.json({
    ok: true,
    documentId,
    sourceKind: sourceRow.source_kind,
    classification: "unclassified",
    passages: passages.length,
    note: "Kaynak kaydedildi. İçerik güvenli (safe-non-pii) olarak sınıflandırılana kadar Yaşam Hafızası'nda indexlenmez.",
  });
}
