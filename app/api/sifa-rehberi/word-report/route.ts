import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";
import { chunkIds, orderRowsByIds } from "@/lib/sifa-rehberi/idBatch";
import { buildFooter, getImgDimensions, type ReportChild } from "@/lib/docx/reportHelpers";
// EK FAZ 3 Premium Word: SAF belge kurucusu (render mantığı buraya taşındı; harness test eder).
import {
  buildSifaReportChildren,
  sifaWordFilename,
  type ImagesByKey,
  type SifaExportMode,
  type WordGuideRaw,
} from "@/lib/sifa-rehberi/wordDocument";
// P1 PHASE A: görseller `file_path` (source-of-truth) üzerinden service_role storage download
// ile getirilir — kalıcı public URL / getPublicUrl FETCH edilmez (private-bucket-ready).
import { downloadSafeStonePhotos } from "@/lib/sifa-rehberi/wordImages";
import {
  STONE_PHOTOS_BUCKET,
  resolveHealingImagePath,
  storageHostFromEnv,
} from "@/lib/sifa-rehberi/stonePhotoStorage";
import { readSnapshotsForDelivery } from "@/lib/yasam-hafizasi/client/snapshotStore";
import { buildSnapshotSection } from "@/lib/yasam-hafizasi/client/snapshotReport";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Export başına makul toplam görsel tavanı (maliyet-abuse + wall-clock koruması). Aşılırsa
// FAZLA görseller sessizce atlanır (içerik metni ETKİLENMEZ) ve YALNIZ sayı loglanır.
const MAX_TOTAL_IMAGES = 300;

// DB satır tipleri = SAF builder tipleri + sunucuya özel tenant_id (yalnız fetch/scoping).
type GuideRaw = WordGuideRaw & { tenant_id: string };

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  const guard = await requireModuleAccess(request, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  // Export sorgularında body tenantId değil, oturumdan doğrulanmış tenant kullanılır.
  const verifiedTenantId = guard.tenantId;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // Maliyet-abuse koruması: DOCX üretimi pahalı (tüm kayıtları çekip render eder).
  // Tenant başına dakikada makul sayıda export'a izin ver; art arda kötüye kullanımı kes.
  // (In-memory / instance-başına — Faz 1 kapsamında ağır global altyapı kurulmadı.)
  const rl = checkRateLimit(`sifa-word:${verifiedTenantId}`, 10, 60_000);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", ids, id, clientId, selectionGroupId, q, category } = body as {
    exportMode?: SifaExportMode;
    ids?: string[];
    id?: string;
    // FAZ EK1: "filtered" export — server, mevcut arama semantiğiyle TÜM eşleşen id'leri
    // çözer (UI ilk-sayfa limit'ine BAĞLI DEĞİL). Client yalnız {q, category} gönderir.
    q?: string;
    category?: string | null;
    // BF-14 P2: danışana özel teslim eki (opsiyonel; yalnız single mode).
    clientId?: string;
    selectionGroupId?: string;
  };

  if (exportMode === "single" && !id)
    return Response.json({ ok: false, error: "Tek kayıt için id zorunludur." }, { status: 400 });

  if (exportMode === "selected" && (!Array.isArray(ids) || ids.length === 0))
    return Response.json({ ok: false, error: "Seçili kayıtlar için ids zorunludur." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // Hem legacy kolonlar hem sections join — hangi veri yapısı olursa olsun çalışır.
  // `images` (guide + section) EK FAZ 3 Premium Word için eklendi (güvenli embed).
  const SELECT = `
    id, tenant_id, name, category, symptoms, created_at, updated_at, images,
    general_summary, medical_causes, subconscious_causes, temperament_causes,
    other_causes, iridology_match, hand_analysis_match, cupping_leech,
    reflexology, diet_recommendations, herbal_methods, stone_recommendations,
    aromatherapy, meditation, breathwork, bioenergy, massage, daily_routine,
    sleep_routine, supportive_alternative_methods, islamic_recommendations,
    healing_guide_sections (
      id, guide_id, section_type, mode, title, note, source,
      source_kind, expert_note, attention, images, sort_order, created_at
    )
  `;

  // "filtered": TÜM eşleşen guide id'lerini server-side çöz (arama semantiği = UI arama;
  // UI ilk-sayfa limit'ine BAĞLI DEĞİL). Böylece 137 eşleşme varken 50/100 ile sınırlanmaz.
  let filteredIds: string[] | null = null;
  if (exportMode === "filtered") {
    const { data: idRows, error: idErr } = await db.rpc("resolve_healing_guide_ids", {
      p_tenant_id: verifiedTenantId,
      p_q: typeof q === "string" ? q : "",
      p_category: typeof category === "string" ? category : null,
    });
    if (idErr) {
      return serverErrorResponse({ route: "sifa/word-report", action: "POST.resolve", tenantId: verifiedTenantId, cause: idErr });
    }
    filteredIds = ((idRows ?? []) as { id: string }[]).map((r) => r.id);
    if (filteredIds.length === 0) {
      return Response.json({ ok: false, error: "Bu seçim için şifa rehberi kaydı bulunamadı." }, { status: 404 });
    }
  }

  // Ölçek-güvenli id-liste getirme: TEK dev `.in()` (URL sınırı riski) yerine sabit
  // GUIDE_FETCH_BATCH'lik parçalar. Tenant her batch'te bağlanır (cross-tenant leak yok).
  async function fetchByIdsBatched(idList: string[]): Promise<GuideRaw[]> {
    const out: GuideRaw[] = [];
    for (const batch of chunkIds(idList)) {
      const { data: bd, error: be } = await db
        .from("healing_guides")
        .select(SELECT)
        .eq("tenant_id", verifiedTenantId)
        .in("id", batch);
      if (be) throw be;
      out.push(...((bd ?? []) as unknown as GuideRaw[]));
    }
    return out;
  }

  let guides: GuideRaw[];
  try {
    if (exportMode === "single" && id) {
      const { data, error } = await db
        .from("healing_guides").select(SELECT)
        .eq("tenant_id", verifiedTenantId).eq("id", id)
        .order("name", { ascending: true });
      if (error) throw error;
      guides = (data ?? []) as unknown as GuideRaw[];
    } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
      // Kullanıcı seçimi (sayfa-sınırlı olsa da) batch fetch + ada göre sırala (önceki davranış).
      const fetched = await fetchByIdsBatched(ids);
      guides = fetched.sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr-TR"));
    } else if (exportMode === "filtered" && filteredIds) {
      // TÜM eşleşenler; resolver sırasını (fold(name), id) KORU.
      const fetched = await fetchByIdsBatched(filteredIds);
      guides = orderRowsByIds(fetched, filteredIds);
    } else {
      // "all": id listesi yok → tek sorgu (URL riski yok).
      const { data, error } = await db
        .from("healing_guides").select(SELECT)
        .eq("tenant_id", verifiedTenantId)
        .order("name", { ascending: true });
      if (error) throw error;
      guides = (data ?? []) as unknown as GuideRaw[];
    }
  } catch (e) {
    return serverErrorResponse({ route: "sifa/word-report", action: "POST.read", tenantId: verifiedTenantId, cause: e });
  }

  if (!guides.length)
    return Response.json({ ok: false, error: "Bu seçim için şifa rehberi kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  // ── Güvenli görsel embedding (P1 PHASE A: service_role file_path download) ────
  // Görseller `file_path` (source-of-truth) üzerinden service_role storage `download` ile
  // getirilir — kalıcı public URL / getPublicUrl / `/object/public/...` FETCH EDİLMEZ. Her
  // path YALNIZ ait olduğu guide'ın tenant'ı için `healing-guides/{tenant}/...` altında
  // doğrulanır (resolveHealingImagePath) → cross-tenant download OLAMAZ. Legacy kayıtlarda
  // `file_path` yoksa YALNIZ güvenilir stone-photos public URL'inden path parse edilir (dış
  // URL kabul edilmez). Eksik obje/bad-MIME/oversize → sessizce atlanır; tek kötü görsel
  // export'u bozmaz. İçerik/path LOGLANMAZ. Sıra deterministik (guide → o guide'ın section'ları).
  const guideImages: ImagesByKey = new Map();
  const sectionImages: ImagesByKey = new Map();
  const allowedHost = storageHostFromEnv(supabaseUrl);
  {
    type ImgEntry = { kind: "guide" | "section"; key: string; path: string };
    const entries: ImgEntry[] = [];
    const pushPaths = (kind: "guide" | "section", key: string, tenant: string, images: unknown) => {
      if (!Array.isArray(images)) return;
      for (const img of images) {
        const path = resolveHealingImagePath(img as Record<string, unknown>, tenant, allowedHost);
        if (path) entries.push({ kind, key, path });
      }
    };
    for (const g of guides) {
      pushPaths("guide", g.id, g.tenant_id, g.images);
      const secs = Array.isArray(g.healing_guide_sections) ? g.healing_guide_sections : [];
      for (const s of secs) pushPaths("section", s.id, g.tenant_id, s.images);
    }
    // Sessiz-tavan DEĞİL: aşılırsa yalnız SAYI loglanır (içerik/path yok), fazlası atlanır.
    let capped = entries;
    if (entries.length > MAX_TOTAL_IMAGES) {
      console.warn(`[sifa/word-report] image count capped: ${entries.length} -> ${MAX_TOTAL_IMAGES}`);
      capped = entries.slice(0, MAX_TOTAL_IMAGES);
    }
    if (capped.length) {
      const fetched = await downloadSafeStonePhotos(db, STONE_PHOTOS_BUCKET, capped.map((e) => e.path));
      capped.forEach((e, i) => {
        const img = fetched[i];
        if (!img) return;                              // eksik obje/oversize/bad-MIME
        if (!getImgDimensions(img.data)) return;       // geçersiz boyut → atla (placeholder yok)
        const map = e.kind === "guide" ? guideImages : sectionImages;
        const arr = map.get(e.key) ?? [];
        arr.push(img.data);                            // sıra korunur (deterministik)
        map.set(e.key, arr);
      });
    }
  }

  // Belge gövdesi — SAF builder (kapak → [çok-kayıtta stats+TOC] → guide'lar).
  const children: ReportChild[] = buildSifaReportChildren({
    guides,
    exportMode,
    today,
    guideImages,
    sectionImages,
  });

  // ── Yaşam Hafızası Seçimleri (BF-14 P2; danışana özel teslim eki, OPSİYONEL) ──
  // Yalnız single mode + doğrulanmış client + selection group. Yoksa çıktı DEĞİŞMEZ.
  // healing_guides / healing_guide_sections MUTATE EDİLMEZ; canonical içerik değişmez.
  if (
    exportMode === "single" &&
    typeof id === "string" && UUID_RE.test(id) &&
    typeof clientId === "string" && UUID_RE.test(clientId) &&
    typeof selectionGroupId === "string" && UUID_RE.test(selectionGroupId)
  ) {
    const { data: cliRow } = await db
      .from("clients").select("id").eq("id", clientId).eq("tenant_id", verifiedTenantId).maybeSingle();
    if (!cliRow) {
      return Response.json({ ok: false, error: "Danışan bulunamadı veya erişim yok." }, { status: 403 });
    }
    try {
      const snaps = await readSnapshotsForDelivery(db, {
        tenantId: verifiedTenantId, clientId, targetKind: "guide", targetRef: id, selectionGroup: selectionGroupId,
      });
      if (snaps.length > 0) children.push(...buildSnapshotSection(snaps));
    } catch {
      /* regresyon güvenli: teslim seçimi eklenemezse mevcut rehber raporu korunur */
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Şifa Rehberi Raporu · Yaşam Sistemi") },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = sifaWordFilename(exportMode, guides, dateSlug);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
