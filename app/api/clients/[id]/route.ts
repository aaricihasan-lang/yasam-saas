import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { computeBurc } from "@/lib/danisan/burc";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { validateClientWrite } from "@/lib/danisan/clientValidation";
import { istanbulToday } from "@/lib/danisan/istanbulTime";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { CLIENT_CONFLICT_MESSAGE, clientVersion, readBaseVersion } from "@/lib/danisan/clientVersion";

export const runtime = "nodejs";

/**
 * /api/clients/[id] — tek danışan oku/güncelle (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - id + tenant_id eşleşmesi zorunlu (IDOR engellenir).
 *   - Body'deki tenant_id/id/created_at yok sayılır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

// Satış öncesi kapanış: deny-list yerine İZİN LİSTESİ + doğrulama
// (lib/danisan/clientValidation). tenant_id/id/created_at/create_request_id/user_id,
// legacy ve bilinmeyen kolonlar yazılamaz; bozuk tarih / boş ad → 400.
//
// AŞAMA 2 / D1 (DY-03): Genel Bilgi iyimser eşzamanlılık — GET/PATCH `client_version` döner;
// istemci `base_version` gönderirse güncel satırın sürümüyle karşılaştırılır, uyuşmazlık → 409
// CLIENT_CONFLICT (+ güncel kayıt). base_version göndermeyen eski istemci CAS'sız kabul edilir.

// ─── GET /api/clients/[id] ───────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return serverErrorResponse({ route: "clients/[id]", action: "GET", tenantId, cause: error });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, client: data, client_version: clientVersion(data as Record<string, unknown>) });
}

// ─── PATCH /api/clients/[id] ─────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return demoReadOnlyResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const verdict = validateClientWrite(body, "patch", istanbulToday());
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, code: verdict.code, field: verdict.field, error: verdict.error },
      { status: 400 },
    );
  }
  const fields: Record<string, unknown> = { ...verdict.fields };

  // F7: burç server-authoritative. `dogum` gönderildiyse (doğrulanmış) burç yeniden
  // hesaplanır (dogum boş/null → burç null); `dogum` gönderilmediyse burç DEĞİŞMEZ —
  // client'ın doğrudan gönderdiği `burc` izin listesinde olmadığından zaten yazılmaz.
  if (Object.prototype.hasOwnProperty.call(fields, "dogum")) {
    fields.burc = computeBurc(fields.dogum == null ? null : String(fields.dogum));
  }

  // D1 (DY-03): base_version varsa güncel satırla karşılaştır (bayat form başkasının değişikliğini ezmesin).
  const baseVersion = readBaseVersion(body);
  if (baseVersion) {
    const { data: current, error: curErr } = await db
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (curErr) {
      return serverErrorResponse({ route: "clients/[id]", action: "PATCH-read", tenantId, cause: curErr });
    }
    if (!current) {
      return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 404 });
    }
    const currentVersion = clientVersion(current as Record<string, unknown>);
    if (currentVersion !== baseVersion) {
      return NextResponse.json(
        { ok: false, code: "CLIENT_CONFLICT", error: CLIENT_CONFLICT_MESSAGE, client: current, client_version: currentVersion },
        { status: 409 },
      );
    }
  }

  const { data, error } = await db
    .from("clients")
    .update(fields)
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();

  if (error) {
    return serverErrorResponse({
      route: "clients/[id]",
      action: "PATCH",
      tenantId,
      cause: error,
      usage: { guard, req, module: "clients", failedAction: "record_updated", subEntity: "client" },
    });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 404 },
    );
  }

  await trackUsage(guard, req, { module: "clients", action: "record_updated", subEntity: "client", resourceId: clientId });

  return NextResponse.json({ ok: true, client: data, client_version: clientVersion(data as Record<string, unknown>) });
}
