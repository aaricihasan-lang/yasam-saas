import { NextRequest, NextResponse } from "next/server";
import { trackUsage } from "@/lib/usage/trackUsage";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import { SOURCE_COLUMNS, cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { SOURCE_CREATE_KEYS as CREATE_KEYS, buildSourcePayload } from "@/lib/beslenme/sourceLink";

export const runtime = "nodejs";

/** GET: kaynak listesi + arama (global katalog / detail tab için). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const q = cleanStr(new URL(req.url).searchParams.get("q"), 120);

  let query = db.from("nutrition_sources").select(SOURCE_COLUMNS).eq("tenant_id", tenantId).eq("is_active", true);
  if (q) {
    const norm = normalizeSearchText(q).normalizedText;
    if (norm) query = query.textSearch("search_tsv", norm, { config: "simple", type: "websearch" });
  }
  const { data, error } = await query.order("title", { ascending: true }).limit(300);
  if (error) return NextResponse.json({ ok: false, code: "LIST_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, sources: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: yeni kaynak (opsiyonel — ana kaydı bloke etmez, ayrı çağrı). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const payload = buildSourcePayload(body);
  if ("error" in payload) return beslenmeJson({ ok: false, code: payload.error }, 400);

  const { data, error } = await db
    .from("nutrition_sources")
    .insert({ tenant_id: tenantId, ...payload })
    .select(SOURCE_COLUMNS)
    .single();
  if (error) {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "record_created", subEntity: "source", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  }
  await trackUsage(guard, req, { module: "beslenme", action: "record_created", subEntity: "source", resourceId: (data as { id?: string } | null)?.id ?? null });
  return NextResponse.json({ ok: true, source: data }, { status: 201 });
}
