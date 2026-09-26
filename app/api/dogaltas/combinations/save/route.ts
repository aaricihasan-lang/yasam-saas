import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";

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
  stones?: unknown; // string[] (taş adları) — legacy/uyumlu
  stoneRefs?: unknown; // [{ stone_id?, snapshot_name }] — id biliniyorsa daha kesin
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

  // F-02: canonical ilişkisel yazım — atomik RPC (parent combinations + N
  // combination_stones tek transaction). RPC snapshot_name'i DAİMA saklar ve
  // stone_id'yi tenant içinde isimden çözer (tek eşleşmede); stones_text CSV'yi
  // geriye-uyum aynası olarak yazar. İsteğe bağlı stoneRefs ({stone_id, snapshot_name})
  // verilirse id doğrudan kullanılır. (Deploy sırası: migration önce uygulanır.)
  const stoneRefs = Array.isArray(body.stoneRefs)
    ? (body.stoneRefs as unknown[])
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          const snapshot = String(o.snapshot_name ?? o.name ?? "").trim();
          if (!snapshot) return null;
          const sid = o.stone_id != null ? String(o.stone_id).trim() : "";
          return { stone_id: sid || null, snapshot_name: snapshot.slice(0, MAX_NAME) };
        })
        .filter((r): r is { stone_id: string | null; snapshot_name: string } => r != null)
    : stoneNames.map((n) => ({ stone_id: null, snapshot_name: n.slice(0, MAX_NAME) }));

  if (stoneRefs.length === 0) {
    return NextResponse.json({ ok: false, error: "En az bir taş seçilmelidir." }, { status: 400 });
  }

  const { data, error } = await db.rpc("create_combination_with_stones", {
    p_tenant_id: tenantId, // SUNUCUDAN — client'tan gelmez
    p_issue: name,
    p_description: str(body.description, MAX_TEXT),
    p_source: "Kombinasyon Sepeti",
    p_source_id: null, // RPC 'cart-<uuid>' üretir
    p_variant_index: 1,
    p_notes_text: str(body.notesText, MAX_TEXT),
    p_notes_text_2: str(body.notesText2, MAX_TEXT),
    p_notes_text_3: str(body.note, MAX_TEXT),
    p_stones: stoneRefs,
  });

  if (error) {
    return serverErrorResponse({ route: "dogaltas/combinations/save", action: "POST", tenantId, cause: error });
  }

  const result = (data ?? {}) as { id?: string };
  return NextResponse.json({ ok: true, issue: name, id: result.id });
}
