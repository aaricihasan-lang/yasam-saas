import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import { SOURCE_COLUMNS, SOURCE_TYPES, cleanStr, cleanUrl, inEnum, hasOnlyKeys } from "@/lib/beslenme/contracts";

export const runtime = "nodejs";
const CREATE_KEYS = [
  "title", "authors", "organization", "source_type", "publication_year",
  "edition", "page_range", "chapter", "url", "reference_code", "note",
] as const;

function buildSourcePayload(body: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const title = cleanStr(body.title, 400);
  if (!title) return { error: "TITLE_REQUIRED" };
  if (body.source_type != null && !inEnum(body.source_type, SOURCE_TYPES)) return { error: "BAD_SOURCE_TYPE" };
  let year: number | null = null;
  if (body.publication_year != null) {
    if (!Number.isInteger(body.publication_year) || (body.publication_year as number) < 1000 || (body.publication_year as number) > 2200)
      return { error: "BAD_YEAR" };
    year = body.publication_year as number;
  }
  return {
    title,
    authors: cleanStr(body.authors, 500),
    organization: cleanStr(body.organization, 300),
    source_type: inEnum(body.source_type, SOURCE_TYPES) ? body.source_type : null,
    publication_year: year,
    edition: cleanStr(body.edition, 100),
    page_range: cleanStr(body.page_range, 100),
    chapter: cleanStr(body.chapter, 200),
    url: cleanUrl(body.url),
    reference_code: cleanStr(body.reference_code, 200),
    note: cleanStr(body.note, 4000),
  };
}

/** GET: kaynak listesi + arama (global katalog / detail tab için). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
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
  const guard = await requireBeslenmeOwner(req);
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
  if (error) return beslenmeJson({ ok: false, code: "CREATE_FAILED" }, 500);
  return NextResponse.json({ ok: true, source: data }, { status: 201 });
}
