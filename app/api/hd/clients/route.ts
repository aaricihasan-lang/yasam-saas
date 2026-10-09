import { NextRequest, NextResponse } from "next/server";
import { readExpectedVersion } from "@/lib/human-design/api/optimistic";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  listHdClients,
  getHdClient,
  updateHdClient,
  deleteHdClient,
  previewHdClientDelete,
} from "@/lib/human-design/api/clientPersistence";
import { getHdJourneyInfo } from "@/lib/human-design/api/journeyLink";

export const runtime = "nodejs";

/**
 * /api/hd/clients — human_design_clients güvenli CRUD (Sprint-3).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - Tüm sorgu/insert/update/delete tenant-scoped (.eq("tenant_id", ...)).
 *   - DELETE: tenant-scoped; profil + bağlı analizler + Word raporları (owner kararı 2026-10-09).
 *     GET ?id=&delete_preview=1 silinecek kesin sayıları döner; DELETE ?expect_analyses=&expect_reports=
 *     ile onaylanan kapsamdan fazlası varsa 409 (hiçbir şey silinmez).
 *   - Yanıt no-store; doğum/kişisel veri LOGLANMAZ; demo hesap yazamaz.
 *
 * AŞAMA 3C: yeni HD danışanı YALNIZ merkezî danışanla birlikte oluşturulur
 * (POST /api/hd/clients/journey). Bu uçtaki eski "tek alanlı isimle bağımsız HD danışanı" POST'u
 * kapatıldı (410) — ad + soyad zorunluluğu merkezî danışan katmanında sağlanır. GET ?id= yanıtı
 * bağlı merkezî danışanı (journey) ve bağlanmamış profil için yalnız ÖNERİLERİ (otomatik bağlama
 * YOK) içerir. Mevcut kayıtların okunması / güncellenmesi / silinmesi aynen çalışır.
 *
 * HD engine/compute/BodyGraph'a dokunmaz — yalnız human_design_clients tablosu.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // Silme onayı öncesi KESİN kapsam (salt okunur): silinecek analiz + Word raporu sayısı.
  if (id && url.searchParams.get("delete_preview") === "1") {
    const p = await previewHdClientDelete(guard.db, guard.tenantId, id);
    if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: p.status === 404 ? 404 : 500, headers: NO_STORE });
    return NextResponse.json(
      { ok: true, analyses: p.analyses, reports: p.reports, journeyLinked: p.journeyLinked },
      { status: 200, headers: NO_STORE },
    );
  }

  if (id) {
    const { row, error } = await getHdClient(guard.db, guard.tenantId, id);
    if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Kayıt bulunamadı." },
        { status: 404, headers: NO_STORE },
      );
    }
    const { info } = await getHdJourneyInfo(guard.db, guard.tenantId, row as { name?: string | null; birth_date?: string | null; journey_client_id?: string | null });
    return NextResponse.json(
      { ok: true, row, journey: info.journey, journey_suggestions: info.suggestions },
      { status: 200, headers: NO_STORE },
    );
  }

  const { rows, error } = await listHdClients(guard.db, guard.tenantId);
  if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  // AŞAMA 3C: bağımsız (merkezî danışansız) yeni HD danışanı oluşturma KAPALI.
  return NextResponse.json(
    {
      ok: false,
      code: "NEW_CLIENT_FLOW_REQUIRED",
      error: "Yeni Human Design danışanı Human Design Hesaplama ekranından (ad, soyad ve doğum bilgileriyle) oluşturulur.",
    },
    { status: 410, headers: NO_STORE },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında güncelleme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  const id = String(raw.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek danışanın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  // P2-9: yüklenen sürüm gönderildiyse koşullu güncelleme (başka oturum ezilmez → 409).
  const { ok, error, status: upStatus, code, updatedAt } = await updateHdClient(
    guard.db, guard.tenantId, id, raw, { expectedUpdatedAt: readExpectedVersion(raw) },
  );
  if (!ok) {
    const status = upStatus === 409 || upStatus === 404 ? upStatus : 400;
    return NextResponse.json(
      { ok: false, code, error: error ?? "Güncellenemedi." },
      { status, headers: NO_STORE },
    );
  }
  await trackUsage(guard, req, { module: "human_design", action: "record_updated", subEntity: "client", resourceId: id });
  return NextResponse.json({ ok: true, id, updated_at: updatedAt ?? null }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Silinecek danışanın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  // Onay penceresinde gösterilen sayılar: şimdi DAHA FAZLA kayıt varsa silme yapılmaz (409).
  const expA = Number(url.searchParams.get("expect_analyses"));
  const expR = Number(url.searchParams.get("expect_reports"));
  const expect = Number.isInteger(expA) && expA >= 0 && Number.isInteger(expR) && expR >= 0 && url.searchParams.has("expect_analyses") && url.searchParams.has("expect_reports")
    ? { analyses: expA, reports: expR }
    : undefined;

  const r = await deleteHdClient(guard.db, guard.tenantId, id, { expect });
  if (!r.ok) {
    const status = r.status === 404 || r.status === 409 || r.status === 500 ? r.status : 400;
    return NextResponse.json({ ok: false, code: r.code, error: r.error ?? "Silinemedi." }, { status, headers: NO_STORE });
  }
  await trackUsage(guard, req, { module: "human_design", action: "record_deleted", subEntity: "client", resourceId: id });
  return NextResponse.json(
    { ok: true, deletedId: id, deletedAnalyses: r.deletedAnalyses ?? 0, deletedReports: r.deletedReports ?? 0, warnings: r.warnings ?? [] },
    { status: 200, headers: NO_STORE },
  );
}
