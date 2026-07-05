import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/combinations — danışana özel kombinasyonlar (public.client_combinations).
 *
 * GET  → danışanın kombinasyonları (en yeni önce).
 * POST → "Kombinasyon Sepeti"ni bu danışana kaydeder.
 *
 * Güvenlik (genel combinations API'leri ile aynı model):
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDA oturumdan alınır; client'tan GELEN değere GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR engellenir).
 *   - Yazma service_role'lü guard.db ile yapılır.
 *   - Demo hesap: Supabase'e yazılmaz (başarılı gibi döner).
 *
 * NOT: Genel kombinasyonlar (public.combinations) bu route'tan TAMAMEN ayrıdır.
 */

const COLUMNS =
  "id,tenant_id,client_id,name,description,note,stones_text,notes_text,notes_text_2,created_at,updated_at";

const MAX_NAME = 200;
const MAX_TEXT = 4000;

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * O-7: Kombinasyon adı benzersizlik karşılaştırması için normalize.
 * Büyük/küçük harf (Türkçe-duyarlı) + baş/son + iç boşluk sadeleştirilir.
 * Diyakritikler KORUNUR (ör. "Şifa" ≠ "Sifa") — yalnız case + boşluk normalize edilir.
 */
function normComboName(s: string): string {
  return s.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("client_combinations")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST ────────────────────────────────────────────────────────────────────
type SaveBody = {
  name?: unknown;
  description?: unknown;
  note?: unknown;
  stones?: unknown; // string[] (taş adları)
  notesText?: unknown;
  notesText2?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const name = str(body.name, MAX_NAME);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Kombinasyon adı zorunludur." }, { status: 400 });
  }

  const stoneNames = Array.isArray(body.stones)
    ? body.stones.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (stoneNames.length === 0) {
    return NextResponse.json(
      { ok: false, error: "En az bir taş seçilmelidir." },
      { status: 400 },
    );
  }

  // Demo hesap: gerçek yazma yapılmaz; başarılı gibi dönülür.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // O-7: Aynı danışanda aynı isimde kombinasyon tekrarını engelle (case + boşluk
  // normalize; Türkçe-duyarlı). Aynı ad FARKLI danışanda serbesttir (client_id filtresi).
  const { data: existing, error: existErr } = await db
    .from("client_combinations")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (existErr) {
    return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
  }
  const targetNorm = normComboName(name);
  const isDuplicate = (existing ?? []).some(
    (r) => normComboName(String((r as { name?: unknown }).name ?? "")) === targetNorm,
  );
  if (isDuplicate) {
    return NextResponse.json(
      {
        ok: false,
        code: "DUPLICATE_NAME",
        error: `Bu danışanda "${name}" adlı bir kombinasyon zaten kayıtlı. Farklı bir ad kullanın.`,
      },
      { status: 409 },
    );
  }

  const stonesCsv = stoneNames.join(", ").slice(0, MAX_TEXT);

  const { data, error } = await db
    .from("client_combinations")
    .insert({
      tenant_id: tenantId, // SUNUCUDAN — client'tan gelmez
      client_id: clientId,
      name,
      description: str(body.description, MAX_TEXT),
      note: str(body.note, MAX_TEXT),
      stones_text: stonesCsv,
      notes_text: str(body.notesText, MAX_TEXT),
      notes_text_2: str(body.notesText2, MAX_TEXT),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}
