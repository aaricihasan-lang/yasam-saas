import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/combinations/save
 *
 * "Kombinasyon Sepeti"ndeki taşları public.combinations tablosuna kaydeder.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDA oturumdan alınır; client'tan GELEN tenant_id'ye GÜVENİLMEZ.
 *   - Yazma service_role'lü guard.db ile yapılır (tarayıcı doğrudan insert etmez).
 *   - Demo hesap: hiçbir koşulda Supabase'e yazılmaz (başarılı gibi döner).
 *   - password / service_role / secret KESİNLİKLE yanıta sızmaz.
 */

type SaveBody = {
  name?: unknown;
  description?: unknown;
  note?: unknown;
  stones?: unknown; // string[] (taş adları)
  notesText?: unknown; // mineral koşulları + karşılanan + eksik özeti (client)
  notesText2?: unknown; // uyarı + stok özeti (client)
};

const MAX_NAME = 200;
const MAX_TEXT = 4000;

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

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

  // Demo hesap: gerçek yazma yapılmaz; başarılı gibi dönülür (insert YOK).
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, issue: name });
  }

  const stonesCsv = stoneNames.join(", ").slice(0, MAX_TEXT);

  const { error } = await db.from("combinations").insert({
    tenant_id: tenantId, // SUNUCUDAN — client'tan gelmez
    source_id: `cart-${crypto.randomUUID()}`,
    issue: name,
    description: str(body.description, MAX_TEXT),
    variant_index: 1,
    source: "Kombinasyon Sepeti",
    stones_text: stonesCsv,
    notes_text: str(body.notesText, MAX_TEXT),
    notes_text_2: str(body.notesText2, MAX_TEXT),
    notes_text_3: str(body.note, MAX_TEXT),
    // created_at: DB default (now())
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, issue: name });
}
