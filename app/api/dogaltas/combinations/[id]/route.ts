import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";

export const runtime = "nodejs";

/**
 * PATCH /api/dogaltas/combinations/[id] — tek genel kombinasyon (variant) güncelleme.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - Her işlem .eq("id", id).eq("tenant_id", tenantId) → çapraz-tenant PATCH imkânsız
 *     (başka tenant id'si gelse 0 satır → 404).
 *   - tenant_id / user_id / id / created_at / source_id / variant_index / source
 *     client'tan GÜNCELLENEMEZ (writable whitelist dışı).
 *   - Demo hesap: yazma yapılmaz.
 *
 * Not: Genel kombinasyonlar (combinations) danışana bağlı DEĞİLDİR (client_id kolonu yok).
 * Danışana özel kombinasyonlar ayrı tablodadır (client_combinations) ve bu route onlara
 * dokunmaz. Stok/uyarı/analiz özeti detay sayfasında stones_text + envanterden CANLI
 * hesaplandığı için stones_text güncellenince özet kendiliğinden doğru kalır.
 */

// Yalnız kullanıcıya ait, güvenli düzenlenebilir alanlar.
const COMBINATION_WRITABLE = ["issue", "description", "stones_text", "notes_text_3"] as const;

const MAX_NAME = 200;
const MAX_TEXT = 4000;

function clamp(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const fields: Record<string, unknown> = {};

  if ("issue" in body) {
    const issue = clamp(body.issue, MAX_NAME);
    if (!issue) {
      return NextResponse.json({ ok: false, error: "Kombinasyon adı zorunludur." }, { status: 400 });
    }
    fields.issue = issue;
  }

  if ("stones_text" in body) {
    // Taş listesi CSV; en az bir geçerli taş adı olmalı (oluşturma kuralıyla aynı).
    const raw = String(body.stones_text ?? "");
    const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      return NextResponse.json({ ok: false, error: "En az bir taş seçilmelidir." }, { status: 400 });
    }
    fields.stones_text = names.join(", ").slice(0, MAX_TEXT);
  }

  if ("description" in body) fields.description = clamp(body.description, MAX_TEXT);
  if ("notes_text_3" in body) fields.notes_text_3 = clamp(body.notes_text_3, MAX_TEXT);

  // COMBINATION_WRITABLE dışı hiçbir alan yazılamaz (tenant_id/id/source_id/... korunur).
  for (const k of Object.keys(fields)) {
    if (!(COMBINATION_WRITABLE as readonly string[]).includes(k)) delete fields[k];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("combinations")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId) // tenant guard — çapraz-tenant güncelleme engellenir
    .select("id,issue");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, id, issue: (data[0] as { issue: string }).issue });
}
