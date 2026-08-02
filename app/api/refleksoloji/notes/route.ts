import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/notes — uzmanın klinik notları (P1-1, cihazlar arası senkron).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token binding.
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma tenant_id ile bağlanır. Demo hesap: Supabase'e yazılmaz.
 *
 * Model: her not bir satır; source_uid = istemci not id'si. Kaydetme semantiği
 *   localStorage ile aynı: istemci daima TAM listeyi PUT eder → server "replace-all"
 *   (gelen source_uid'leri upsert, listede olmayanları sil).
 */

type IncomingNote = {
  id: string;
  title?: string;
  date?: string;
  content?: string;
  attachments?: unknown;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
};

// ─── GET — tenant'ın tüm notları (SavedClinicalNote[] olarak) ──────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, notes: [] });
  }

  const { data, error } = await db
    .from("reflexology_notes")
    .select("raw_json")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const notes = (data ?? [])
    .map((r) => (r as { raw_json: unknown }).raw_json)
    .filter((n): n is Record<string, unknown> => n != null && typeof n === "object");

  return NextResponse.json({ ok: true, notes });
}

// ─── PUT — tam liste ile senkronla (replace-all) ──────────────────────────────
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: { notes?: IncomingNote[] };
  try {
    body = (await req.json()) as { notes?: IncomingNote[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const incoming = Array.isArray(body.notes) ? body.notes : [];
  const validNotes = incoming.filter(
    (n) => n && typeof n === "object" && typeof n.id === "string" && n.id.length > 0,
  );
  const ids = validNotes.map((n) => n.id);

  // 1) Gelen notları upsert (tenant_id + source_uid çakışmasında güncelle).
  if (validNotes.length > 0) {
    const rows = validNotes.map((n) => ({
      tenant_id: tenantId,
      source_uid: n.id,
      title: typeof n.title === "string" ? n.title : null,
      note_date: typeof n.date === "string" ? n.date : null,
      content: typeof n.content === "string" ? n.content : null,
      attachments: Array.isArray(n.attachments) ? n.attachments : [],
      raw_json: n as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }));

    const { error: upErr } = await db
      .from("reflexology_notes")
      .upsert(rows, { onConflict: "tenant_id,source_uid" });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
  }

  // 2) Listede olmayan (silinmiş) notları tenant altından temizle.
  let delQuery = db.from("reflexology_notes").delete().eq("tenant_id", tenantId);
  if (ids.length > 0) {
    // PostgREST: source_uid NOT IN (...) — string değerler tırnaklanmalı.
    const quoted = ids.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    delQuery = delQuery.not("source_uid", "in", `(${quoted})`);
  }
  const { error: delErr } = await delQuery;
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: validNotes.length });
}
