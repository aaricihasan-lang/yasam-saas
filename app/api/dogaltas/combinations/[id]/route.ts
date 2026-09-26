import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { serverErrorResponse } from "@/lib/http/apiError";

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

const MAX_NAME = 200;
const MAX_TEXT = 4000;
// F-03: kullanıcıya sızmayan, profesyonel conflict mesajı.
const CONFLICT_MSG =
  "Bu kayıt başka bir oturumda güncellendi. Son verileri yenileyip değişikliklerinizi kontrol edin.";

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

  // F-03 optimistic concurrency: client GET'te aldığı updated_at'i geri gönderir.
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt.trim()
      ? body.expectedUpdatedAt.trim()
      : null;

  // issue (sağlanmışsa) zorunlu-dolu.
  let issueVal: string | null = null;
  if ("issue" in body) {
    issueVal = clamp(body.issue, MAX_NAME);
    if (!issueVal) {
      return NextResponse.json({ ok: false, error: "Kombinasyon adı zorunludur." }, { status: 400 });
    }
  }

  // ── Taş listesi düzenleniyorsa: F-02 canonical RPC (junction replace + stones_text
  //    aynası + concurrency guard, tek transaction). ──────────────────────────────
  if ("stones_text" in body) {
    const names = String(body.stones_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      return NextResponse.json({ ok: false, error: "En az bir taş seçilmelidir." }, { status: 400 });
    }
    const p_stones = names.map((n) => ({ stone_id: null, snapshot_name: n.slice(0, MAX_NAME) }));
    const { data, error } = await db.rpc("update_combination_with_stones", {
      p_combination_id: id,
      p_tenant_id: tenantId,
      p_issue: issueVal, // null → mevcut korunur
      p_description: "description" in body ? String(body.description ?? "").slice(0, MAX_TEXT) : null,
      p_notes_text_3: "notes_text_3" in body ? String(body.notes_text_3 ?? "").slice(0, MAX_TEXT) : null,
      p_stones,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) {
      const msg = String((error as { message?: unknown }).message ?? "");
      if (msg.includes("combination_conflict")) {
        return NextResponse.json({ ok: false, error: CONFLICT_MSG, code: "conflict" }, { status: 409 });
      }
      if (msg.includes("combination_not_found_for_tenant")) {
        return NextResponse.json({ ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
      }
      return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH:rpc", tenantId, cause: error });
    }
    const r = (data ?? {}) as { updated_at?: string };
    return NextResponse.json({ ok: true, id, updated_at: r.updated_at });
  }

  // ── Yalnız skaler alan(lar): junction'a dokunmadan concurrency-guarded update. ──
  const fields: Record<string, unknown> = {};
  if (issueVal) fields.issue = issueVal;
  if ("description" in body) fields.description = clamp(body.description, MAX_TEXT);
  if ("notes_text_3" in body) fields.notes_text_3 = clamp(body.notes_text_3, MAX_TEXT);

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  let query = db
    .from("combinations")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId); // tenant guard — çapraz-tenant güncelleme engellenir
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select("id,issue,updated_at");

  if (error) return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH", tenantId, cause: error });
  if (!data || data.length === 0) {
    // 0 satır: concurrency guard verildiyse conflict mi yoksa yok mu ayır.
    if (expectedUpdatedAt) {
      const { data: exists } = await db
        .from("combinations").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (exists) return NextResponse.json({ ok: false, error: CONFLICT_MSG, code: "conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." },
      { status: 404 },
    );
  }
  const row = data[0] as { issue: string; updated_at?: string };
  return NextResponse.json({ ok: true, id, issue: row.issue, updated_at: row.updated_at });
}
