import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { parseOrganList } from "@/lib/refleksoloji/organs";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols/organ — atlas organ rename/delete ile protokolleri
 * uzlaştırır (BUG-3: atlas rename/delete → protokol sessiz orphan).
 *
 *   GET  ?name=<organ>      → { count, titles }  bu organı kullanan protokoller
 *   POST { oldName, newName } → tenant'taki tüm protokollerde organ adını değiştirir
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token binding.
 *   - tenant_id SUNUCUDA oturumdan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Eşleşme Türkçe-duyarsız; organs string'i pipe/virgül ile ayrıştırılır.
 */

const NORM = (s: string) => s.trim().toLocaleLowerCase("tr");

type ProtocolRow = {
  id: string;
  title: string | null;
  organs: string | null;
  raw_json: Record<string, unknown> | null;
};

function usesOrgan(organs: string | null, target: string): boolean {
  const t = NORM(target);
  return parseOrganList(organs).some((o) => NORM(o) === t);
}

// ─── GET: organ kullanım sayısı/başlıkları ──────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "organ adı gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, count: 0, titles: [] });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("id, title, organs")
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const matches = ((data ?? []) as ProtocolRow[]).filter((r) => usesOrgan(r.organs, name));
  return NextResponse.json({
    ok: true,
    count: matches.length,
    titles: matches.map((m) => m.title ?? "Başlıksız protokol"),
  });
}

// ─── POST: organ adını tüm protokollerde değiştir (cascade) ─────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, updated: 0, demo: true });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const oldName = typeof body.oldName === "string" ? body.oldName.trim() : "";
  const newName = typeof body.newName === "string" ? body.newName.trim() : "";
  if (!oldName || !newName) {
    return NextResponse.json({ ok: false, error: "oldName ve newName gerekli." }, { status: 400 });
  }
  if (NORM(oldName) === NORM(newName)) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("id, title, organs, raw_json")
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as ProtocolRow[]).filter((r) => usesOrgan(r.organs, oldName));
  let updated = 0;
  for (const row of rows) {
    // Organ adını Türkçe-duyarsız değiştir; tekilleştir; " | " ile birleştir.
    const seen = new Set<string>();
    const nextOrgans: string[] = [];
    for (const o of parseOrganList(row.organs)) {
      const value = NORM(o) === NORM(oldName) ? newName : o;
      const key = NORM(value);
      if (seen.has(key)) continue;
      seen.add(key);
      nextOrgans.push(value);
    }
    const organsStr = nextOrgans.length > 0 ? nextOrgans.join(" | ") : null;

    // raw_json.organs (SavedProtocol snapshot dizisi) varsa onu da güncelle.
    const raw = row.raw_json && typeof row.raw_json === "object" ? { ...row.raw_json } : null;
    if (raw && Array.isArray((raw as { organs?: unknown }).organs)) {
      (raw as { organs: unknown[] }).organs = nextOrgans;
    }

    const { error: updErr } = await db
      .from("reflexology_protocols")
      .update({ organs: organsStr, ...(raw ? { raw_json: raw } : {}) })
      .eq("tenant_id", tenantId)
      .eq("id", row.id);
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}
