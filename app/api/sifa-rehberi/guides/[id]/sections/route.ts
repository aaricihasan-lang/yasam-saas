import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import { isSifaUuid } from "@/lib/sifa-rehberi/ids";
import { normalizeReplaceSections } from "@/lib/sifa-rehberi/sectionModel";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";
import {
  nextVersionStamp,
  parseExpectedUpdatedAt,
  SIFA_STALE_MESSAGE,
} from "@/lib/sifa-rehberi/guideVersion";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * PUT /api/sifa-rehberi/guides/[id]/sections — kaydın section'larını topluca değiştirir.
 *
 * Section-native edit yolu (Faz 2): production-şekilli KARMAŞIK kayıtlar da (herbal,
 * hacamat_suluk, bilincalti, source'lu, görselli) doğrudan, KAYIPSIZ düzenlenir.
 * İçerik `healing_guide_sections`'ta durur; source_kind/expert_note/attention/sort_order dahil.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - Parent guide'ın tenant sahipliği ÖNCE app-layer'da doğrulanır (temiz 404) VE
 *     RPC içinde tekrar bağlanır (caller tenant'ına kör güven YOK) → IDOR yok.
 *   - Demo hesap: yazma yapılmaz.
 *
 * ATOMİK: replace tek DB transaction'ında (SECURITY DEFINER RPC) yapılır. Herhangi bir
 * hata → tamamı rollback. Yarım delete / yarım insert / duplicate residue YOK.
 *
 * İYİMSER KİLİT (SIFA-1): body.expected_updated_at zorunlu; parent guide sürümü RPC'den
 * ÖNCE koşullu olarak ilerletilir (claim). Bayat sürüm → 409 stale (bölümlere DOKUNULMAZ).
 * Başarıda yeni `updated_at` döner.
 */
type RouteCtx = { params: Promise<{ id: string }> };

type ReplaceResult = { deleted?: number; inserted?: number } | null;

export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  // Biçim guard'ı: geçersiz (non-UUID) id, parent ownership sorgusunda 22P02 → sanitize 500
  // üretiyordu. İstemci-kaynaklı bu durum "kayıt yok" ile aynıdır → temiz 404 (IDOR yüzeyi yok).
  if (!isSifaUuid(id)) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const sectionsError = validateSectionsBody(body.sections);
  if (sectionsError) {
    return NextResponse.json({ ok: false, error: sectionsError }, { status: 400 });
  }
  const incoming = body.sections as Record<string, unknown>[];

  // SIFA-1 iyimser kilit — expected_updated_at ZORUNLU. UI akışında bu değer, hemen önceki
  // sürüm-kontrollü PATCH'in döndürdüğü YENİ updated_at'tir (PATCH = kapı). PUT tek başına
  // (PATCH'siz) gönderilse bile bayat sekme bölümleri ezemez.
  const version = parseExpectedUpdatedAt(body);
  if (!version.ok) {
    return NextResponse.json(
      { ok: false, code: version.code, error: version.error },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const expectedUpdatedAt = version.value;

  // 1) SÜRÜM "CLAIM" (migration'sız CAS): parent guide'ın updated_at'i beklenen sürümse
  //    tek cümlede yeni sürüme ilerletilir. Bu aynı zamanda tenant sahipliğini doğrular
  //    (.eq tenant_id) → temiz 404 semantiği + IDOR yok. Claim'den SONRA eski sürümü tutan
  //    her yazıcı (PATCH veya PUT) 409 alır.
  //    KALAN DAR PENCERE (dürüst not): claim ile RPC commit'i arasındaki milisaniyelerde,
  //    YENİ sürümü (claim sonrası) okuyup aynı anda bölüm kaydeden ikinci bir sekmenin RPC'si
  //    bizimkiyle yarışabilir. Tam atomiklik sürüm parametreli bir RPC (migration) gerektirir.
  const claimedVersion = nextVersionStamp(expectedUpdatedAt);
  const claimBase = db
    .from("healing_guides")
    .update({ updated_at: claimedVersion })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  const { data: claimRows, error: claimErr } = await (expectedUpdatedAt === null
    ? claimBase.is("updated_at", null)
    : claimBase.eq("updated_at", expectedUpdatedAt)
  ).select("id,updated_at");

  if (claimErr) {
    await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "server" });
    return serverErrorResponse({ route: "sifa/guides/[id]/sections", action: "PUT.versionClaim", tenantId, cause: claimErr });
  }
  if (!claimRows || claimRows.length === 0) {
    // Claim tutmadı: kayıt bu tenant'ta varsa sürüm çakışması (409), yoksa 404.
    const { data: guideRow, error: guideErr } = await db
      .from("healing_guides")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (guideErr) {
      await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "server" });
      return serverErrorResponse({ route: "sifa/guides/[id]/sections", action: "PUT.ownerCheck", tenantId, cause: guideErr });
    }
    if (!guideRow) {
      return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
    }
    await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "conflict" });
    return NextResponse.json(
      { ok: false, stale: true, code: "SIFA_STALE_GUIDE", error: SIFA_STALE_MESSAGE },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  const newVersion = (claimRows[0] as { updated_at: string | null }).updated_at ?? claimedVersion;

  // Claim alındı ama replace BAŞARISIZ olursa: bölümler değişmedi → sürümü (yalnız hâlâ
  // bizim claim'imizse) eski değere geri al; istemcinin elindeki belirteç geçerli kalır ve
  // aynı sekme yeniden denediğinde kendi kendisiyle çakışmaz. Best-effort (hata yutulur).
  const releaseClaim = async () => {
    try {
      await db
        .from("healing_guides")
        .update({ updated_at: expectedUpdatedAt })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .eq("updated_at", newVersion);
    } catch {
      /* best-effort: başarısızsa istemci bir sonraki denemede 409 alır (güvenli yön) */
    }
  };

  // 2) ATOMİK replace — tek transaction (RPC). Tenant binding RPC içinde de doğrulanır.
  const payload = normalizeReplaceSections(incoming);
  const { data, error: rpcErr } = await db.rpc("replace_healing_guide_sections", {
    p_guide_id: id,
    p_tenant_id: tenantId,
    p_sections: payload,
  });

  if (rpcErr) {
    await releaseClaim();
    const msg = rpcErr.message || "";
    // RPC tenant binding hatası → 404 (cross-tenant sızıntısı yok).
    if (msg.includes("guide_not_found_for_tenant")) {
      return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
    }
    // Kontrollü doğrulama tokenları → güvenli 400 (ham RPC/Postgres metni SIZMAZ).
    if (/invalid_section_type|sections_must_be_array|invalid_arguments/.test(msg)) {
      return NextResponse.json({ ok: false, error: "Bölüm verisi geçersiz." }, { status: 400 });
    }
    // Beklenmeyen iç hata → sanitize 500 (+ sunucu diagnostiği).
    await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "server" });
    return serverErrorResponse({ route: "sifa/guides/[id]/sections", action: "PUT.replace", tenantId, cause: rpcErr });
  }

  const result = (data ?? null) as ReplaceResult;

  // guide updated_at, yukarıdaki sürüm claim'iyle ZATEN tazelendi (liste sırası/gösterim +
  // iyimser kilit). Ayrı, koşulsuz bir "tazele" güncellemesi YAPILMAZ (CAS'ı bozardı).

  // USAGE360: bölüm değişimi REHBER düzenlemesidir → record_updated:guide (resourceId = rehber
  // id). Düzenleme ekranı Kaydet'te PATCH guides/[id] + bu PUT'u ardışık çağırır; aynı
  // (eylem, rehber id) 60 sn kovasında idempotency ile TEK olay sayılır.
  await trackUsage(guard, req, { module: "sifa_rehberi", action: "record_updated", subEntity: "guide", resourceId: id });

  return NextResponse.json({
    ok: true,
    inserted: result?.inserted ?? payload.length,
    deleted: result?.deleted ?? 0,
    updated_at: newVersion,
  });
}
