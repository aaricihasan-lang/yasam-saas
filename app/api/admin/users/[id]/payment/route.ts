import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  diffPaymentFields,
  paymentFieldsFromRow,
  validatePaymentDraft,
} from "@/lib/admin/memberCommercial";
import { requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { ARCHIVED_CHANGE_MESSAGE, archivedTargetResponse, isArchivedDbError } from "@/lib/admin/archivedGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

const PAYMENT_ROW_SELECT =
  "id, role, payment_status, last_payment_date, next_payment_date, paid_amount, payment_note, agreed_fee, billing_period";

/**
 * POST /api/admin/users/[id]/payment — ödeme / ticari takip bilgilerini kaydet.
 *
 * AŞAMA 2 · §4.1 (M4) — yalnız admin'in elle tuttuğu kayıt; otomatik kilit/pasif, e-posta/SMS,
 * fatura/kart YOK. Sertleştirme:
 *   - 8 KB gövde sınırı + application/json (readLimitedJsonBody), UUID doğrulama.
 *   - Admin hedef → yalnız ana yönetici (requireMainAdminForAdminTarget).
 *   - SIKI doğrulama (validatePaymentDraft): durum allowlist (paid/pending/overdue/exempt/unknown),
 *     tarih YYYY-MM-DD, tutar/ücret ≥ 0, not uzunluğu, ödeme dönemi allowlist.
 *   - Yalnız DEĞİŞEN kolonlar yazılır; değişiklik yoksa DB'ye dokunulmaz (changed:false).
 *   - AŞAMA 4b: kullanıcı satırı + geçmiş satırı (agreed_fee, billing_period, actor_admin_id dahil) + audit
 *     `payment_status_changed` (yalnız değişen alan ADLARI; tutar/not DEĞERİ yazılmaz) TEK veritabanı işleminde
 *     (admin_save_member_payment, hedef satır kilidi). Biri başarısızsa hiçbiri yazılmaz; uygulama telafisi YOK.
 *   - Ham DB hatası istemciye dönmez.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) return bad(adminTarget.error, adminTarget.status);
  // AŞAMA 4a: arşivdeki hesapta değişiklik yok (erken yanıt; atomik güvence DB tetikleyicisinde, UY005).
  const archived = await archivedTargetResponse(db, id);
  if (archived) return archived;

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  for (const k of Object.keys(parsed.value)) {
    if (k !== "draft") return bad("Beklenmeyen alan.");
  }

  const v = validatePaymentDraft(parsed.value.draft);
  if (!v.ok) return bad(v.error);
  const next = v.value;

  const { data: currentRow, error: readErr } = await db
    .from("users")
    .select(PAYMENT_ROW_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (readErr) return bad("Ödeme bilgisi okunamadı.", 500);
  if (!currentRow) return bad("Kullanıcı bulunamadı.", 404);

  const rawRow = currentRow as unknown as Record<string, unknown>;
  const before = paymentFieldsFromRow(rawRow);
  // Owner kararı (11.11.2026, PR #779): YENİ muafiyete geçişte (önceki durum muaf DEĞİLKEN "exempt") gerekçe zorunlu.
  // Gerekçe mevcut payment_note alanıdır (boş / yalnız boşluk → validatePaymentDraft null yapar). Hiçbir yazımdan
  // ÖNCE reddedilir → kullanıcı satırı ve ödeme geçmişi değişmez. Zaten muaf olan (eski) kayıtların diğer alan
  // güncellemeleri ve paid / pending / overdue durumları etkilenmez.
  if (next.payment_status === "exempt" && before.payment_status !== "exempt" && !(next.payment_note ?? "").trim()) {
    return bad("Ödemeden muaf için gerekçe zorunludur: “Ödeme Notu” alanına gerekçe yazın.");
  }
  const changed = diffPaymentFields(before, next);
  if (changed.length === 0) {
    return NextResponse.json({ ok: true, changed: false }, { headers: NO_STORE });
  }

  // AŞAMA 4b: kullanıcı ödeme alanları + ödeme geçmişi + audit TEK veritabanı işleminde (admin_save_member_payment).
  // Hedef satır kilitlenir; kilit altında yeniden karşılaştırılır → yalnız GERÇEKTEN değişen kolonlar yazılır, hiçbiri
  // değişmiyorsa (eşzamanlı tekrar) geçmiş / audit yazılmaz. Herhangi bir adım başarısızsa TAMAMI geri alınır.
  const changes: Record<string, unknown> = {};
  for (const f of changed) changes[f] = next[f];
  const { data: saved, error: saveErr } = await db.rpc("admin_save_member_payment", {
    p_actor: adminId,
    p_user_id: id,
    p_changes: changes,
  });
  if (saveErr) {
    if (isArchivedDbError(saveErr)) return bad(ARCHIVED_CHANGE_MESSAGE, 409);
    const code = (saveErr as { code?: unknown }).code;
    if (code === "PY404") return bad("Kullanıcı bulunamadı.", 404);
    if (code === "PY400") return bad("Ödemeden muaf için gerekçe zorunludur: “Ödeme Notu” alanına gerekçe yazın.");
    if (code === "42501") return bad("Yetki yok.", 403);
    return bad("Ödeme kaydı tamamlanamadı; hiçbir değişiklik uygulanmadı. Lütfen tekrar deneyin.", 500);
  }
  const result = (saved ?? {}) as { changed?: unknown; fields?: unknown };
  if (result.changed !== true) {
    return NextResponse.json({ ok: true, changed: false }, { headers: NO_STORE });
  }
  const fields = Array.isArray(result.fields) ? (result.fields as string[]) : changed;

  return NextResponse.json({ ok: true, changed: true, fields }, { headers: NO_STORE });
}
