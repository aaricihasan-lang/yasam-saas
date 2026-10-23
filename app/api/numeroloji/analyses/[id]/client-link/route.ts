import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  linkRecordToClient,
  readRecordLink,
  searchClientsForLink,
  unlinkRecord,
  type NumerologyLinkFail,
} from "@/lib/danisan/numerologyLink";

export const runtime = "nodejs";

/**
 * /api/numeroloji/analyses/[id]/client-link — kayıtlı Numeroloji analizi ↔ Danışan Yolculuğu bağı
 * (AŞAMA 2 / DY-005 · DY-006, owner kararı A).
 *
 *   GET    → { link: { clientId, client } | null, canLink }   (?search= → uzmanın yazdığı metinle danışan arama)
 *   PUT    { clientId }          → bağsız kaydı açıkça bağlar (başka danışana bağlıysa 409)
 *   DELETE { clientId }          → beklenen bağı kaldırır (kayıt / snapshot SİLİNMEZ)
 *
 * Güvenlik: numerology izni + Danışan Yolculuğu (clients) izni (danışan adlarını görür / bağlar).
 * Tenant oturumdan; başka tenant'ın kaydı/danışanı 404 (DB'de bileşik FK de zorlar). Demo yazamaz.
 * Yalnız client_id yazılır — analysis_data, ad, doğum tarihi ve Numeroloji motoru DEĞİŞMEZ.
 * İsim / doğum tarihi benzerliğiyle öneri veya otomatik eşleştirme YOK.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failRes = (f: NumerologyLinkFail) => NextResponse.json({ ok: false, code: f.code, error: f.error }, { status: f.status, headers: NO_STORE });
const notFound = () => NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Kayıt bulunamadı." }, { status: 404, headers: NO_STORE });
const noClientsPermission = () =>
  NextResponse.json({ ok: false, code: "CLIENTS_PERMISSION_REQUIRED", error: "Danışana bağlamak için Danışan Yolculuğu yetkisi gerekir." }, { status: 403, headers: NO_STORE });

async function readBodyClientId(req: NextRequest): Promise<string | null> {
  try {
    const b = (await req.json()) as unknown;
    const v = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>).clientId : null;
    return typeof v === "string" && UUID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const canLink = hasModulePermissionForProfile(guard.profile, "clients");

  const link = await readRecordLink(guard.db, guard.tenantId, id);
  if (!link.ok) return failRes(link);

  const search = req.nextUrl.searchParams.get("search");
  if (search !== null) {
    if (!canLink) return noClientsPermission();
    const r = await searchClientsForLink(guard.db, guard.tenantId, search.slice(0, 100));
    if (r.error) return NextResponse.json({ ok: false, code: "DB_ERROR", error: "Danışanlar yüklenemedi." }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, rows: r.rows }, { headers: NO_STORE });
  }

  return NextResponse.json({
    ok: true,
    canLink,
    // Danışan izni yoksa bağlı danışanın adı gösterilmez (yalnız bağ var/yok).
    link: link.clientId ? { clientId: link.clientId, client: canLink ? link.client : null } : null,
  }, { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403, headers: NO_STORE });
  if (!hasModulePermissionForProfile(guard.profile, "clients")) return noClientsPermission();
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const clientId = await readBodyClientId(req);
  if (!clientId) return NextResponse.json({ ok: false, code: "INVALID_CLIENT", error: "Geçerli bir danışan seçilmedi." }, { status: 400, headers: NO_STORE });

  const r = await linkRecordToClient(guard.db, guard.tenantId, id, clientId);
  if (!r.ok) {
    if (r.status >= 500) await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return failRes(r);
  }
  if (r.changed) await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: id });
  return NextResponse.json({ ok: true, clientId }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403, headers: NO_STORE });
  if (!hasModulePermissionForProfile(guard.profile, "clients")) return noClientsPermission();
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const clientId = await readBodyClientId(req);
  if (!clientId) return NextResponse.json({ ok: false, code: "INVALID_CLIENT", error: "Kaldırılacak bağlantı belirtilmedi." }, { status: 400, headers: NO_STORE });

  const r = await unlinkRecord(guard.db, guard.tenantId, id, clientId);
  if (!r.ok) {
    if (r.status >= 500) await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return failRes(r);
  }
  if (r.changed) await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: id });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
