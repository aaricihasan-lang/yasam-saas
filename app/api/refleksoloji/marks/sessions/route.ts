import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { clientDisplayName, requireClientInTenant } from "@/lib/danisan/clientGuard";
import { validateSessionInput, type MarkSession } from "@/lib/refleksoloji/markSurfaces";
import {
  NO_STORE,
  SESSION_COLUMNS,
  cleanSourceUid,
  isMissingTable,
  isUniqueViolation,
  isUuid,
  jsonError,
  marksNotReady,
  readJsonBody,
} from "@/lib/refleksoloji/marksServer";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/marks/sessions — danışanın refleksoloji işaret seansları.
 *
 * GET  ?client_id=<uuid>  → seans listesi (yeni→eski, en çok 100) + seans başı nokta sayısı.
 * POST { client_id, session_date, title?, note?, source_uid? } → yeni seans.
 *
 * Güvenlik: requireModuleAccess("reflexology") + danışan tenant'a ait mi (requireClientInTenant;
 *   yabancı/yok → 404). tenant_id/created_by sunucuda. Demo: okuma tenant-scoped, yazma 403.
 */

const LIST_LIMIT = 100;
const COUNT_PAGE = 1000;
const MAX_COUNT_PAGES = 40;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  // DEMO VİTRİN: okuma gerçek uzmanla aynı (tenant-scoped); yazmalar demoReadOnly (403).
  const { db, tenantId } = guard;

  const clientId = req.nextUrl.searchParams.get("client_id") ?? "";
  if (!isUuid(clientId)) return jsonError(400, "Geçerli bir danışan seçin.");

  const client = await requireClientInTenant(db, tenantId, clientId);
  if (!client) return jsonError(404, "Danışan bulunamadı.");

  const { data, error } = await db
    .from("reflexology_mark_sessions")
    .select(SESSION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    if (isMissingTable(error)) return marksNotReady();
    return jsonError(500, "Seanslar yüklenemedi. Lütfen tekrar deneyin.");
  }

  const rows = (data ?? []) as Array<Omit<MarkSession, "mark_count">>;
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    // PostgREST max-rows (1000) sessizce keser → sayfalı oku (danışan başı nokta sınırlı).
    const ids = rows.map((r) => r.id);
    for (let page = 0; page < MAX_COUNT_PAGES; page++) {
      const from = page * COUNT_PAGE;
      const { data: markRows, error: markErr } = await db
        .from("reflexology_marks")
        .select("id, session_id")
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .in("session_id", ids)
        .order("id", { ascending: true })
        .range(from, from + COUNT_PAGE - 1);
      if (markErr) return jsonError(500, "Seanslar yüklenemedi. Lütfen tekrar deneyin.");
      const list = (markRows ?? []) as Array<{ session_id: string }>;
      for (const m of list) counts.set(m.session_id, (counts.get(m.session_id) ?? 0) + 1);
      if (list.length < COUNT_PAGE) break;
    }
  }

  const sessions: MarkSession[] = rows.map((r) => ({ ...r, mark_count: counts.get(r.id) ?? 0 }));
  return NextResponse.json(
    { ok: true, client: { id: client.id, name: clientDisplayName(client) }, sessions },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const body = (parsed.body ?? {}) as Record<string, unknown>;

  const clientId = body.client_id;
  if (!isUuid(clientId)) return jsonError(400, "Geçerli bir danışan seçin.");
  const v = validateSessionInput(body);
  if (!v.ok) return jsonError(400, v.error);

  const client = await requireClientInTenant(db, tenantId, clientId);
  if (!client) return jsonError(404, "Danışan bulunamadı.");

  const sourceUid = cleanSourceUid(body.source_uid);
  const { data, error } = await db
    .from("reflexology_mark_sessions")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      session_date: v.value.session_date,
      title: v.value.title ?? null,
      note: v.value.note ?? null,
      source_uid: sourceUid,
      created_by_user_id: userId,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    // Aynı source_uid (çift tık / yeniden deneme) → mevcut satırı döndür (idempotent).
    if (sourceUid && isUniqueViolation(error)) {
      const { data: existing } = await db
        .from("reflexology_mark_sessions")
        .select(SESSION_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("source_uid", sourceUid)
        .maybeSingle();
      if (existing && (existing as { client_id: string }).client_id === clientId) {
        return NextResponse.json(
          { ok: true, session: { ...(existing as object), mark_count: 0 }, duplicate: true },
          { headers: NO_STORE },
        );
      }
      return jsonError(409, "Kayıt çakışması. Sayfayı yenileyip tekrar deneyin.");
    }
    return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.sessions.POST", error, { usage: { guard, req, failedAction: "record_created", subEntity: "mark_session" } });
  }

  await trackUsage(guard, req, {
    module: "reflexology",
    action: "record_created",
    subEntity: "mark_session",
    resourceId: (data as { id: string }).id,
  });
  return NextResponse.json(
    { ok: true, session: { ...(data as object), mark_count: 0 } },
    { status: 201, headers: NO_STORE },
  );
}
