import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  PERSONAL_ARCHIVE_BUCKET,
  isOwnedPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { PERSONAL_ARCHIVE_MAX_BYTES } from "@/lib/kisisel-arsiv/storagePath";
import { QUOTA_EXCEEDED_MESSAGE, QUOTA_UNAVAILABLE_MESSAGE, commitPersonalArchiveUpload, isAllowedPersonalArchiveFile } from "@/lib/kisisel-arsiv/uploadPolicy";
export const runtime = "nodejs";

/**
 * /api/kisisel-arsiv/files — personal_archive_files güvenli YAZMA/LİSTE kapısı (K-3 + P1-3).
 *
 * Neden: dosya satırı insert/select/delete tarayıcıdan anon key ile yapılıyordu →
 * güvenlik tamamen RLS'e bağlıydı ve anon yazma cross-tenant riski taşıyordu.
 * Artık yazmalar service_role ile SUNUCUDA; kimlik requireModuleAccess ile doğrulanır,
 * tenant_id oturumdan alınır (body/query'den GÜVENİLMEZ), archive_id'nin bu tenant'a
 * ait olduğu doğrulanır (IDOR).
 *
 * P1-3: Storage (personal-archive bucket) SİLME işlemi artık bu route'un DELETE ucunda
 * SUNUCU-YETKİLİ yapılır — client'tan path listesi ALINMAZ; path'ler DB'den (tenant+archive
 * scoped) çözülür. Yükleme ise POST multipart /api/kisisel-arsiv/files/upload üzerindedir.
 * Aşağıdaki JSON POST yalnız geriye dönük uyumluluk içindir ve file_path tenant+archive
 * öneki ile başlamak zorundadır (aktif UI bu hattı KULLANMAZ).
 */

const TABLE = "personal_archive_files";

async function archiveInTenant(
  db: SupabaseClient,
  archiveId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("personal_archives")
    .select("id")
    .eq("id", archiveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET ?archiveIds=a,b,c — bu arşivlerin dosya satırları (tenant-scoped) ──────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const raw = req.nextUrl.searchParams.get("archiveIds")?.trim() ?? "";
  const ids = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [] });

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .in("archive_id", ids);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST { archiveId, files:[{file_name,file_path,file_type,file_size}] } ──────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const archiveId = String(body.archiveId ?? "").trim();
  const files = Array.isArray(body.files) ? (body.files as Record<string, unknown>[]) : [];
  if (!archiveId) return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ ok: true, rows: [] });

  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  const rows = files
    .map((f) => ({
      tenant_id: tenantId,
      archive_id: archiveId,
      file_name: String(f.file_name ?? ""),
      file_path: String(f.file_path ?? ""),
      file_type: f.file_type != null ? String(f.file_type) : null,
      file_size: f.file_size != null ? Number(f.file_size) : null,
    }))
    .filter((r) => r.file_path);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Geçerli dosya yok." }, { status: 400 });
  // DIJ-03 + BUG-020: geriye dönük JSON hattında da tür politikası ve satır sınırı.
  if (rows.length > 50) return NextResponse.json({ ok: false, error: "Tek seferde en fazla 50 dosya." }, { status: 400 });
  if (rows.some((r) => !isAllowedPersonalArchiveFile(r.file_name || r.file_path, r.file_type) || !isAllowedPersonalArchiveFile(r.file_path, null))) {
    return NextResponse.json({ ok: false, error: "Bu dosya türü güvenlik nedeniyle kabul edilmiyor." }, { status: 415 });
  }

  // P1-3 savunması: geriye dönük JSON hattı bile client-controlled file_path enjekte
  // edemez — her path bu tenant+archive öneki altında olmalı (cross-tenant metadata engeli).
  const badPath = rows.find((r) => !isOwnedPersonalArchivePath(r.file_path, tenantId, archiveId));
  if (badPath) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz dosya yolu." },
      { status: 400 },
    );
  }

  // DIJ-03: geriye dönük hatta da her nesne GERÇEK boyut + atomik kota ile doğrulanır (fail-closed);
  // kayda istemci beyanı değil depodaki boyut/tür yazılır.
  for (const r of rows) {
    const c = await commitPersonalArchiveUpload(db, tenantId, r.file_path, PERSONAL_ARCHIVE_MAX_BYTES);
    if (c.kind === "unavailable") return NextResponse.json({ ok: false, code: "QUOTA_UNAVAILABLE", error: QUOTA_UNAVAILABLE_MESSAGE }, { status: 503 });
    if (c.kind === "rejected") {
      if (c.reason === "quota") return NextResponse.json({ ok: false, code: "QUOTA_EXCEEDED", error: QUOTA_EXCEEDED_MESSAGE }, { status: 413 });
      if (c.reason === "too_large") return NextResponse.json({ ok: false, error: "Dosya boyutu 50 MB sınırını aşıyor." }, { status: 413 });
      return NextResponse.json({ ok: false, error: "Yüklenen dosya doğrulanamadı." }, { status: 409 });
    }
    if (!isAllowedPersonalArchiveFile(r.file_name || r.file_path, c.mimetype)) {
      return NextResponse.json({ ok: false, error: "Bu dosya türü güvenlik nedeniyle kabul edilmiyor." }, { status: 415 });
    }
    r.file_size = c.size;
    r.file_type = c.mimetype ?? r.file_type;
  }

  const { data, error } = await db.from(TABLE).insert(rows).select("*");
  if (error) {
    await trackUsage(guard, req, { module: "personal_archive", action: "action_failed", failedAction: "file_uploaded", subEntity: "file", errorClass: "server" });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  // USAGE360 (geriye dönük JSON hattı): önceden yüklenmiş dosyaların metadata kaydı =
  // yükleme tamamlanması → tek olay + itemCount. resourceId = eklenen satır id'leri
  // (sıralı); ad/boyut/tür/yol telemetriye GİRMEZ.
  const insertedIds = ((data ?? []) as { id?: unknown }[]).map((r) => String(r.id ?? "")).filter(Boolean).sort();
  if (insertedIds.length > 0) {
    await trackUsage(guard, req, {
      module: "personal_archive",
      action: "file_uploaded",
      subEntity: "file",
      resourceId: insertedIds.join(","),
      itemCount: insertedIds.length,
    });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── DELETE ?archiveId=... — arşivin tüm dosya satırlarını sil (tenant-scoped) ──
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();

  const archiveId = req.nextUrl.searchParams.get("archiveId")?.trim() ?? "";
  if (!archiveId) return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });

  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  // P1-3: storage objelerini SUNUCUDA sil. Path'ler client'tan ALINMAZ; DB'den
  // (tenant+archive scoped) çözülür ve her biri savunmacı olarak tenant+archive öneki
  // ile doğrulanır → path bilen anon başka tenant objesini silemez.
  const { data: fileRows, error: selError } = await db
    .from(TABLE)
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("archive_id", archiveId);

  if (selError) {
    return NextResponse.json({ ok: false, error: selError.message }, { status: 500 });
  }

  const ownedPaths = (fileRows ?? [])
    .map((r) => (r as { file_path?: unknown }).file_path)
    .filter((p): p is string => isOwnedPersonalArchivePath(p, tenantId, archiveId));

  // P1-3 veri tutarlılığı: storage silme BAŞARISIZ olursa metadata satırlarını SİLME.
  // Aksi halde metadata-yok + storage-orphan (erişilemez) durumu oluşurdu. Hata → 500,
  // kullanıcı retry eder. Retry idempotent: kalan objeler silinir, zaten silinmiş (missing)
  // objeler Supabase remove'da hata ÜRETMEZ (fatal değil), sonra metadata silinir.
  if (ownedPaths.length > 0) {
    for (let i = 0; i < ownedPaths.length; i += 100) {
      const batch = ownedPaths.slice(i, i + 100);
      const { error: rmError } = await db.storage.from(PERSONAL_ARCHIVE_BUCKET).remove(batch);
      if (rmError) {
        console.error("[kisisel-arsiv/files] storage remove on delete", rmError);
        return NextResponse.json(
          { ok: false, error: "Dosyalar silinemedi. Lütfen tekrar deneyin." },
          { status: 500 },
        );
      }
    }
  }

  // Storage objeleri güvenle kaldırıldı → metadata satırlarını sil.
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("archive_id", archiveId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  // USAGE360: arşivin tüm dosyaları tek istekte silinir → TEK olay + itemCount.
  // Dosyasız arşivde (0 satır) değişiklik yok → olay yok.
  const deletedCount = (fileRows ?? []).length;
  if (deletedCount > 0) {
  }
  return NextResponse.json({ ok: true });
}
