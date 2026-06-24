import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * POST /api/admin/dogaltas/combinations/import
 *
 * Admin toplu JSON import — public.combinations'a batch insert.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + DB doğrulaması (role=admin AND active=true).
 *   - Yazma service_role'lü guard.db ile (tarayıcı doğrudan insert ETMEZ).
 *   - Admin import hedef tenant'ı seçtiği için tenant_id satırlardan gelir; ANCAK
 *     yalnızca admin doğrulamasından sonra kabul edilir.
 *   - password / service_role / secret KESİNLİKLE yanıta sızmaz.
 */

type ImportRow = {
  tenant_id?: unknown;
  source_id?: unknown;
  issue?: unknown;
  description?: unknown;
  variant_index?: unknown;
  source?: unknown;
  stones_text?: unknown;
  notes_text?: unknown;
  notes_text_2?: unknown;
  notes_text_3?: unknown;
};

const MAX_ROWS = 500; // tek istek üst sınırı (client batch boyutu 250)
const MAX_TEXT = 8000;
const MAX_SHORT = 500;

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v);
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "rows boş." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Tek istekte en fazla ${MAX_ROWS} satır gönderin.` },
      { status: 400 },
    );
  }

  const clean: Record<string, unknown>[] = [];
  for (const r of rows) {
    const tenant_id = String(r?.tenant_id ?? "").trim();
    const issue = String(r?.issue ?? "").trim();
    const source_id = String(r?.source_id ?? "").trim();
    if (!tenant_id || !issue || !source_id) {
      return NextResponse.json(
        { ok: false, error: "Her satırda tenant_id, issue ve source_id zorunludur." },
        { status: 400 },
      );
    }
    const vi = Number(r?.variant_index);
    clean.push({
      tenant_id,
      source_id: clip(source_id, MAX_SHORT),
      issue: clip(issue, MAX_SHORT),
      description: clip(r?.description, MAX_TEXT),
      variant_index: Number.isFinite(vi) ? vi : 1,
      source: clip(r?.source, MAX_TEXT),
      stones_text: clip(r?.stones_text, MAX_TEXT),
      notes_text: clip(r?.notes_text, MAX_TEXT),
      notes_text_2: clip(r?.notes_text_2, MAX_TEXT),
      notes_text_3: clip(r?.notes_text_3, MAX_TEXT),
    });
  }

  const { error } = await db.from("combinations").insert(clean);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: clean.length });
}
