import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import {
  deriveCurrentConsents,
  summarizeConsents,
  validateConsentInput,
  type ConsentRecord,
} from "@/lib/legal/clientConsent";

export const runtime = "nodejs";

/**
 * KVKK danışan onam kayıtları (FAZ1 FINAL HARDENING — INFRA).
 *
 *   GET  /api/clients/[id]/consents → { ok, history, current, summary }
 *   POST /api/clients/[id]/consents → yeni (append-only) kayıt; { ok, consent }
 *
 * Güvenlik:
 *   - requireModuleAccess(req, "clients") → oturum + üyelik + Danışan Yolculuğu modülü.
 *   - tenant_id / recorded_by_user_id SUNUCUDA guard'dan; istemci gövdesindeki
 *     tenant/client/user alanları YOK SAYILIR (validateConsentInput yalnız izinli alanları okur).
 *   - Danışan bu tenant'a ait değilse 404 (varlık sızdırmaz).
 *   - Tablo append-only (UPDATE/DELETE yok); geri çekme = yeni 'withdrawn' kaydı.
 *   - Tablo henüz yoksa (migration 20270129000900 uygulanmadı) 503 CONSENTS_NOT_READY.
 *   - Demo hesap: yazma yok (403), okuma boş liste.
 */

const CONSENT_COLUMNS =
  "id, consent_type, status, text_version, method, source, note, recorded_by_user_id, recorded_at";

const HISTORY_LIMIT = 200;

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DbError = { code?: string; message?: string } | null;

function isMissingTable(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /client_consents/.test(msg) && /does not exist|schema cache/i.test(msg);
}

function notReady(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "CONSENTS_NOT_READY",
      error: "KVKK onam kaydı henüz etkin değil (veritabanı güncellemesi bekleniyor).",
    },
    { status: 503, headers: NO_STORE },
  );
}

async function clientBelongsToTenant(db: SupabaseClient, clientId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404, headers: NO_STORE });
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  if (!clientId || !UUID_RE.test(clientId)) return notFound();

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json(
      { ok: true, demo: true, history: [], current: {}, summary: summarizeConsents({}) },
      { headers: NO_STORE },
    );
  }
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) return notFound();

  const { data, error } = await db
    .from("client_consents")
    .select(CONSENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    if (isMissingTable(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/consents", action: "GET", tenantId, cause: error });
  }

  const history = (data ?? []) as ConsentRecord[];
  const current = deriveCurrentConsents(history);
  return NextResponse.json(
    { ok: true, history, current, summary: summarizeConsents(current) },
    { headers: NO_STORE },
  );
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  if (!clientId || !UUID_RE.test(clientId)) return notFound();

  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READ_ONLY", error: "Demo hesabında onam kaydı yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400, headers: NO_STORE });
  }
  const parsed = validateConsentInput(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, field: parsed.field },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) return notFound();

  const { data, error } = await db
    .from("client_consents")
    .insert({
      ...parsed.value,
      tenant_id: tenantId,
      client_id: clientId,
      recorded_by_user_id: userId,
    })
    .select(CONSENT_COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) return notReady();
    // Danışan tam bu arada silindiyse composite FK ihlali → 404.
    if (error.code === "23503") return notFound();
    return serverErrorResponse({ route: "clients/[id]/consents", action: "POST", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, consent: data }, { status: 201, headers: NO_STORE });
}
