import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { staleSummaryMarks } from "@/lib/dogaltas/staleCombinationSummary";
import { formatInstantDate } from "@/lib/time/reportTime";
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

  if (is_demo_account) return demoReadOnlyResponse();

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

  // LEGACY KORUMASI: yalnız YAPISAL kombinasyonlar (mevcut junction satırı olan =
  // yeni relational modelle oluşturulmuş) taş düzenlemede RPC ile junction-replace
  // edilir. Legacy kayıtlar (bulk backfill YAPILMADI → junction YOK; tarihsel
  // stones_text güvenilir CSV DEĞİL, cümle/açıklama parçaları içerebilir) düzenlemede
  // stones_text CANONICAL kalır ve parse edilip junction'a "taş" olarak YAZILMAZ.
  let hasJunction = false;
  if ("stones_text" in body) {
    const { count } = await db
      .from("combination_stones").select("id", { count: "exact", head: true })
      .eq("combination_id", id).eq("tenant_id", tenantId);
    hasJunction = (count ?? 0) > 0;
  }

  // ── YAPISAL taş listesi düzenleniyorsa: F-02 canonical RPC (junction replace +
  //    stones_text aynası + concurrency guard, tek transaction). ─────────────────
  if ("stones_text" in body && hasJunction) {
    const names = String(body.stones_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      return NextResponse.json({ ok: false, error: "En az bir taş seçilmelidir." }, { status: 400 });
    }
    const p_stones = names.map((n) => ({ stone_id: null, snapshot_name: n.slice(0, MAX_NAME) }));
    // B6.2 (owner kararı A, migration yok): taşlar GERÇEKTEN değişecekse kayıt anındaki otomatik
    // koşul/stok özetleri yeniden hesaplanmaz; başına kalıcı "güncel değil" satırı eklenir (özgün metin
    // altında aynen kalır; serbest metin ve notes_text_3 değişmez).
    // SIRA GÜVENCESİ: işaret taşlardan ÖNCE yazılır → "taşlar değişti ama özet güncel görünüyor" durumu
    // hiçbir hata anında oluşamaz. İşaret yazılamazsa taşlara dokunulmaz ve hata döner. Taş kaydı
    // başarısız olursa işaret (yalnız kendi yazdığımız sürümse) geri alınır ve hata döner — kısmi
    // başarı gizlenmez. Her yazım sürüm (updated_at) korumalıdır → araya giren başka yazım ezilmez.
    const { data: prev, error: prevErr } = await db
      .from("combinations").select("stones_text, notes_text, notes_text_2, updated_at")
      .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (prevErr) return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH:read", tenantId, cause: prevErr, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "combination" } });
    if (!prev) return NextResponse.json({ ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
    const marks = staleSummaryMarks(prev as { stones_text: string | null; notes_text: string | null; notes_text_2: string | null }, names, formatInstantDate(new Date()));
    let rpcExpected = expectedUpdatedAt;
    let markedAt: string | null = null;
    if (marks) {
      const { data: marked, error: markErr } = await db
        .from("combinations").update(marks)
        .eq("id", id).eq("tenant_id", tenantId).eq("updated_at", expectedUpdatedAt ?? (prev.updated_at as string))
        .select("updated_at");
      if (markErr) return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH:stale-mark", tenantId, cause: markErr, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "combination" } });
      if (!marked?.[0]?.updated_at) {
        await trackUsage(guard, req, { module: "stones", action: "action_failed", failedAction: "record_updated", subEntity: "combination", errorClass: "conflict" });
        return NextResponse.json({ ok: false, error: CONFLICT_MSG, code: "conflict" }, { status: 409 });
      }
      markedAt = String(marked[0].updated_at);
      rpcExpected = markedAt; // taş kaydı yalnız işaretlediğimiz sürümün üstüne yazabilir
    }
    const { data, error } = await db.rpc("update_combination_with_stones", {
      p_combination_id: id,
      p_tenant_id: tenantId,
      p_issue: issueVal, // null → mevcut korunur
      p_description: "description" in body ? String(body.description ?? "").slice(0, MAX_TEXT) : null,
      p_notes_text_3: "notes_text_3" in body ? String(body.notes_text_3 ?? "").slice(0, MAX_TEXT) : null,
      p_stones,
      p_expected_updated_at: rpcExpected,
    });
    if (error) {
      if (markedAt) {
        // Taşlar kaydedilmedi → işareti geri al (yalnız hâlâ bizim yazdığımız sürümse; değilse
        // başkasının yazımını ezmemek için dokunulmaz ve işaret kalır: yanlış "güncel" değil,
        // en kötü ihtimalle fazladan uyarı).
        const { error: undoErr } = await db
          .from("combinations").update({ notes_text: prev.notes_text, notes_text_2: prev.notes_text_2 })
          .eq("id", id).eq("tenant_id", tenantId).eq("updated_at", markedAt);
        if (undoErr) console.error("[dogaltas/combinations] B6.2 işaret geri alınamadı:", undoErr.message);
      }
      const msg = String((error as { message?: unknown }).message ?? "");
      if (msg.includes("combination_conflict")) {
        await trackUsage(guard, req, { module: "stones", action: "action_failed", failedAction: "record_updated", subEntity: "combination", errorClass: "conflict" });
        return NextResponse.json({ ok: false, error: CONFLICT_MSG, code: "conflict" }, { status: 409 });
      }
      if (msg.includes("combination_not_found_for_tenant")) {
        return NextResponse.json({ ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
      }
      return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH:rpc", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "combination" } });
    }
    const r = (data ?? {}) as { updated_at?: string };
    await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "combination", resourceId: id });
    return NextResponse.json({ ok: true, id, updated_at: r.updated_at });
  }

  // ── Skaler alan(lar) + LEGACY stones_text: junction'a DOKUNMADAN concurrency-guarded
  //    update. Legacy stones_text yalnız compatibility-mirror alanı olarak güncellenir;
  //    hiçbir junction satırı oluşturulmaz (cümle/açıklama parçaları "taş" olmaz). ──
  const fields: Record<string, unknown> = {};
  if (issueVal) fields.issue = issueVal;
  if ("description" in body) fields.description = clamp(body.description, MAX_TEXT);
  if ("notes_text_3" in body) fields.notes_text_3 = clamp(body.notes_text_3, MAX_TEXT);
  if ("stones_text" in body) {
    // Legacy (junction'sız) kayıt: stones_text alanını olduğu gibi (tokenize edilmiş,
    // boşları atılmış) güncelle; ≥1 token kuralı korunur. Junction OLUŞTURULMAZ.
    const names = String(body.stones_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      return NextResponse.json({ ok: false, error: "En az bir taş seçilmelidir." }, { status: 400 });
    }
    fields.stones_text = names.join(", ").slice(0, MAX_TEXT);
  }
  // B6.2: junction'sız kayıtta da otomatik özet varsa (eski kayıtlarda yok) işaret, taşlarla AYNI
  // güncellemede yazılır (tek ifade → ya ikisi ya hiçbiri). Serbest metne dokunulmaz.
  let markGuard: string | null = null;
  if (typeof fields.stones_text === "string") {
    const { data: prevL, error: prevLErr } = await db
      .from("combinations").select("stones_text, notes_text, notes_text_2, updated_at")
      .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (prevLErr) return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH:read", tenantId, cause: prevLErr, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "combination" } });
    const marksL = prevL
      ? staleSummaryMarks(prevL as { stones_text: string | null; notes_text: string | null; notes_text_2: string | null },
          String(fields.stones_text).split(",").map((s) => s.trim()).filter(Boolean), formatInstantDate(new Date()))
      : null;
    if (marksL && prevL) {
      Object.assign(fields, marksL);
      // Okuduğumuz sürüme bağlı: araya yazım girdiyse 0 satır → 409 (işaret eski okumaya göre yazılmaz).
      if (!expectedUpdatedAt) markGuard = String(prevL.updated_at);
    }
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  let query = db
    .from("combinations")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId); // tenant guard — çapraz-tenant güncelleme engellenir
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  else if (markGuard) query = query.eq("updated_at", markGuard);
  const { data, error } = await query.select("id,issue,updated_at");

  if (error) return serverErrorResponse({ route: "dogaltas/combinations/[id]", action: "PATCH", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "combination" } });
  if (!data || data.length === 0) {
    // 0 satır: concurrency guard verildiyse conflict mi yoksa yok mu ayır.
    if (expectedUpdatedAt || markGuard) {
      const { data: exists } = await db
        .from("combinations").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (exists) {
        await trackUsage(guard, req, { module: "stones", action: "action_failed", failedAction: "record_updated", subEntity: "combination", errorClass: "conflict" });
        return NextResponse.json({ ok: false, error: CONFLICT_MSG, code: "conflict" }, { status: 409 });
      }
    }
    return NextResponse.json(
      { ok: false, error: "Kombinasyon bulunamadı veya bu tenant'a ait değil." },
      { status: 404 },
    );
  }
  const row = data[0] as { issue: string; updated_at?: string };
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "combination", resourceId: id });
  return NextResponse.json({ ok: true, id, issue: row.issue, updated_at: row.updated_at });
}
