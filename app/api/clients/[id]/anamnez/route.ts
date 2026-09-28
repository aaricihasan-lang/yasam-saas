import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { CURRENT_TEMPLATE_VERSION, normalizeLocale } from "@/lib/danisan/anamnez/schema";
import { applyChangedSources, linksChanged } from "@/lib/danisan/anamnez/sources";
import { validateCreateInput } from "@/lib/danisan/anamnez/validate";
import {
  ANAMNEZ_FULL_COLUMNS,
  ANAMNEZ_LIST_COLUMNS,
  HISTORY_LIMIT,
  anamnezError,
  anamnezJson,
  demoReadOnly,
  fetchExplicitConsent,
  fetchSourceValues,
  isMissingRelation,
  loadAnamnesis,
  loadClientInTenant,
  logAnamnezEvent,
  notFound,
  notReady,
} from "@/lib/danisan/anamnez/server";
import type { AnamnezRecord, AnamnezSummary, SourceLinks } from "@/lib/danisan/anamnez/types";

export const runtime = "nodejs";

/**
 * Danışan anamnez tarihçesi + yeni anamnez.
 *
 *   GET  /api/clients/[id]/anamnez  → { ok, anamneses: AnamnezSummary[], explicitConsent, truncated }
 *   POST /api/clients/[id]/anamnez  → { ok, anamnesis: { id } }
 *        body: { mode: "standard" | "previous" | "refresh", fromId?, assessmentDate, title?, requestId? }
 *
 * Güvenlik: requireModuleAccess(req, "clients") (oturum + token↔user + pending/rejected + üyelik +
 * modül). tenant_id YALNIZ guard'dan; danışan tenant'a ait değilse 404. Demo: okuma boş, yazma 403.
 * Liste cevap içeriği (answers) TAŞIMAZ; yalnız metadata + kaynak bağlantısı uyarısı.
 */

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return anamnezJson({ ok: true, demo: true, anamneses: [], explicitConsent: null, truncated: false });

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();

  const { data, error } = await db
    .from("client_anamneses")
    .select(ANAMNEZ_LIST_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT + 1);
  if (error) {
    if (isMissingRelation(error)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez", action: "GET", tenantId, cause: error });
  }
  const rows = (data ?? []) as Array<Omit<AnamnezSummary, "attachment_count" | "source_changed"> & { source_links: SourceLinks }>;
  const truncated = rows.length > HISTORY_LIMIT;
  const list = rows.slice(0, HISTORY_LIMIT);

  const [attRes, sources, explicitConsent] = await Promise.all([
    list.length
      ? db
          .from("client_anamnesis_attachments")
          .select("anamnesis_id")
          .eq("tenant_id", tenantId)
          .eq("client_id", clientId)
          .in("anamnesis_id", list.map((r) => r.id))
          .limit(HISTORY_LIMIT * 5)
      : Promise.resolve({ data: [], error: null }),
    list.some((r) => Object.keys(r.source_links ?? {}).length > 0)
      ? fetchSourceValues(db, tenantId, clientId, client.kan)
      : Promise.resolve(null),
    fetchExplicitConsent(db, tenantId, clientId),
  ]);
  const counts = new Map<string, number>();
  for (const a of ((attRes as { data: unknown }).data ?? []) as Array<{ anamnesis_id: string }>) {
    counts.set(a.anamnesis_id, (counts.get(a.anamnesis_id) ?? 0) + 1);
  }

  const anamneses: AnamnezSummary[] = list.map(({ source_links, ...r }) => ({
    ...r,
    attachment_count: counts.get(r.id) ?? 0,
    source_changed: sources ? linksChanged(r.template_version, source_links ?? {}, sources.values) : false,
  }));
  return anamnezJson({ ok: true, anamneses, explicitConsent, truncated });
}

export async function POST(req: NextRequest, { params }: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { id: clientId } = await params;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnly();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return anamnezError("INVALID", 400);
  }
  const parsed = validateCreateInput(body);
  if (!parsed.ok) return anamnezError("INVALID", 400, { field: parsed.field, error: parsed.error });
  const input = parsed.value;

  const client = await loadClientInTenant(db, tenantId, clientId);
  if (!client) return notFound();

  // İdempotency: aynı requestId ile tekrar → mevcut kayıt.
  if (input.requestId) {
    const { data: dup, error: dupErr } = await db
      .from("client_anamneses")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("create_request_id", input.requestId)
      .maybeSingle();
    if (dupErr && isMissingRelation(dupErr)) return notReady();
    if (dup) return anamnezJson({ ok: true, anamnesis: { id: (dup as { id: string }).id }, replayed: true });
  }

  // Açık taslak varsa yeni kayıt açılmaz (tek taslak kuralı; kullanıcı mevcut taslağa yönlenir).
  const { data: draft, error: draftErr } = await db
    .from("client_anamneses")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("status", "draft")
    .limit(1)
    .maybeSingle();
  if (draftErr) {
    if (isMissingRelation(draftErr)) return notReady();
    return serverErrorResponse({ route: "clients/[id]/anamnez", action: "POST:draft", tenantId, cause: draftErr });
  }
  if (draft) return anamnezError("DRAFT_EXISTS", 409, { draftId: (draft as { id: string }).id });

  const { count, error: countErr } = await db
    .from("client_anamneses")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (countErr) return serverErrorResponse({ route: "clients/[id]/anamnez", action: "POST:count", tenantId, cause: countErr });
  const kind = (count ?? 0) === 0 ? "initial" : "update";

  let templateVersion = CURRENT_TEMPLATE_VERSION;
  let formCustom: unknown = { hidden: [], labels: {}, enabledSections: [], custom: [] };
  let answers: unknown = {};
  let sourceLinks: unknown = {};
  let basedOn: string | null = null;

  if (input.mode !== "standard") {
    // Önceki anamnez YALNIZ aynı tenant + aynı danışandan ve TAMAMLANMIŞ olmalı. Kopya = yeni
    // satır; kaynak satıra hiçbir yazma yapılmaz (canlı bağ yok).
    const { row: prev, error: prevErr } = await loadAnamnesis<AnamnezRecord>(db, tenantId, clientId, input.fromId!, ANAMNEZ_FULL_COLUMNS);
    if (prevErr) return serverErrorResponse({ route: "clients/[id]/anamnez", action: "POST:prev", tenantId, cause: prevErr });
    if (!prev) return notFound();
    if (prev.status !== "completed") return anamnezError("PREVIOUS_REQUIRED", 409);
    templateVersion = prev.template_version;
    formCustom = prev.form_custom ?? {};
    answers = prev.answers ?? {};
    sourceLinks = prev.source_links ?? {};
    basedOn = prev.id;

    if (input.mode === "refresh") {
      const { values } = await fetchSourceValues(db, tenantId, clientId, client.kan);
      const locale = normalizeLocale(req.cookies.get("NEXT_LOCALE")?.value);
      const applied = applyChangedSources(
        templateVersion,
        prev.form_custom,
        prev.answers,
        prev.source_links,
        values,
        locale,
        new Date().toISOString(),
      );
      answers = applied.answers;
      sourceLinks = applied.links;
    }
  }

  const { data: inserted, error: insErr } = await db
    .from("client_anamneses")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      kind,
      title: input.title,
      assessment_date: input.assessmentDate,
      status: "draft",
      template_key: "standard",
      template_version: templateVersion,
      form_custom: formCustom,
      answers,
      source_links: sourceLinks,
      client_snapshot: { ad: client.ad ?? null, soyad: client.soyad ?? null, dogum: client.dogum ?? null },
      based_on_anamnesis_id: basedOn,
      create_request_id: input.requestId,
      created_by_user_id: userId,
    })
    .select("id")
    .single();

  if (insErr) {
    if (isMissingRelation(insErr)) return notReady();
    if (insErr.code === "23503") return notFound();
    if (insErr.code === "23505") {
      // Yarış: aynı anda açılan ikinci taslak veya aynı requestId.
      return anamnezError("DRAFT_EXISTS", 409);
    }
    return serverErrorResponse({ route: "clients/[id]/anamnez", action: "POST:insert", tenantId, cause: insErr });
  }

  const id = (inserted as { id: string }).id;
  logAnamnezEvent("created", { tenant: tenantId, user: userId, client: clientId, anamnesis: id, mode: input.mode, kind });
  return anamnezJson({ ok: true, anamnesis: { id } }, 201);
}
