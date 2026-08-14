import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { checkRateLimit } from "@/lib/rateLimit";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";
import { chunkIds, orderRowsByIds } from "@/lib/sifa-rehberi/idBatch";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { readSnapshotsForDelivery } from "@/lib/yasam-hafizasi/client/snapshotStore";
import { buildSnapshotSection } from "@/lib/yasam-hafizasi/client/snapshotReport";
// FAZ 2: etiket haritaları tek merkezden (sectionModel) — duplication azaltıldı.
import { MODE_LABEL, SECTION_TYPE_LABEL, SECTION_TYPE_ORDER, sectionHasAnyLayer } from "@/lib/sifa-rehberi/sectionModel";

export const runtime = "nodejs";

const C_SIFA = "059669";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExportMode = "all" | "selected" | "single" | "filtered";

// ── Section tablosu yapısı ────────────────────────────────────────────────────
type SectionRow = {
  id: string;
  guide_id: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  // FAZ 2 — opsiyonel profesyonel bilgi katmanları + kalıcı sıra.
  source_kind: string | null;
  expert_note: string | null;
  attention: string | null;
  sort_order: number | null;
  created_at: string;
};

// ── Ana guide satırı (legacy kolonlar + sections join) ────────────────────────
type GuideRaw = {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  created_at: string;
  updated_at: string | null;
  // Legacy kolonlar (eski kayıtlar için fallback)
  general_summary: string | null;
  medical_causes: string | null;
  subconscious_causes: string | null;
  temperament_causes: string | null;
  other_causes: string | null;
  iridology_match: string | null;
  hand_analysis_match: string | null;
  cupping_leech: string | null;
  reflexology: string | null;
  diet_recommendations: string | null;
  herbal_methods: string | null;
  stone_recommendations: string | null;
  aromatherapy: string | null;
  meditation: string | null;
  breathwork: string | null;
  bioenergy: string | null;
  massage: string | null;
  daily_routine: string | null;
  sleep_routine: string | null;
  supportive_alternative_methods: string | null;
  islamic_recommendations: string | null;
  // İlişkili sections
  healing_guide_sections: SectionRow[] | null;
};

// MODE_LABEL / SECTION_TYPE_LABEL / SECTION_TYPE_ORDER → sectionModel'den import edilir.

function normKey(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function sectionDisplayLabel(section: SectionRow): string {
  const mk = normKey(section.mode);
  if (mk && MODE_LABEL[mk]) return MODE_LABEL[mk];
  const tk = normKey(section.title);
  if (tk && MODE_LABEL[tk]) return MODE_LABEL[tk];
  if (section.title?.trim()) return section.title.trim();
  if (mk && SECTION_TYPE_LABEL[mk]) return SECTION_TYPE_LABEL[mk];
  return SECTION_TYPE_LABEL[section.section_type] ?? "İçerik";
}

function txt(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return d; }
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

// ── İçerik oluşturma ──────────────────────────────────────────────────────────

function addLegacySection(
  out: ReportChild[],
  label: string,
  value: string | null | undefined,
) {
  const t = txt(value);
  if (!t) return;
  out.push(h3(label));
  out.push(bodyText(t));
}

/** Kaynak + kaynak türü tek satır. */
function sourceLine(s: SectionRow): string {
  const src = txt(s.source);
  const kind = txt(s.source_kind);
  if (src && kind) return `Kaynak (${kind}): ${src}`;
  if (src) return `Kaynak: ${src}`;
  if (kind) return `Kaynak Türü: ${kind}`;
  return "";
}

/**
 * Bir section'da yazdırılabilir herhangi bir katman var mı? (merkezi sectionHasAnyLayer)
 * DİKKAT: bu YALNIZ boş-bölüm filtresidir; içerik EŞİTLİĞİNE bakmaz → aynı note'a sahip
 * iki FARKLI section asla birbirini düşürmez (semantic content dedup YOK).
 */
function hasAnySectionLayer(s: SectionRow): boolean {
  return sectionHasAnyLayer(s);
}

/**
 * FAZ 2 — bilgi KATMANLARINI birbirinden AÇIKÇA ayırarak yazar:
 *   Ana İçerik → Kaynak/Tür → Uzman Notu → Dikkat Edilmesi Gerekenler.
 * Boş katman basılmaz; uzun içerik truncate edilmez.
 */
function pushSectionLayers(out: ReportChild[], s: SectionRow, subLabel?: string) {
  if (subLabel) out.push(bodyText(`▸ ${subLabel}`));
  const content = txt(s.note);
  if (content) out.push(bodyText(content));
  const src = sourceLine(s);
  if (src) out.push(muted(src));
  const expert = txt(s.expert_note);
  if (expert) out.push(bodyText(`Uzman Notu: ${expert}`));
  const attn = txt(s.attention);
  if (attn) out.push(bodyText(`Dikkat Edilmesi Gerekenler: ${attn}`));
}

function buildFromSections(out: ReportChild[], sections: SectionRow[]) {
  // section_type bazında grupla ve sırayla yaz (grup içi sort_order korunur —
  // sections zaten sort_order/created_at ile sıralı gelir).
  const grouped: Record<string, SectionRow[]> = {};
  for (const s of sections) {
    const key = s.section_type || "other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  const orderedTypes = [
    ...SECTION_TYPE_ORDER.filter((t) => grouped[t]?.length),
    ...Object.keys(grouped).filter((t) => !SECTION_TYPE_ORDER.includes(t) && grouped[t]?.length),
  ];

  for (const stype of orderedTypes) {
    const rows = (grouped[stype] ?? []).filter(hasAnySectionLayer);
    if (!rows.length) continue;

    const stypeLabel = SECTION_TYPE_LABEL[stype] ?? stype;

    if (rows.length === 1) {
      const s = rows[0]!;
      const label = sectionDisplayLabel(s);
      out.push(h3(label !== stypeLabel ? label : stypeLabel));
      pushSectionLayers(out, s);
    } else {
      out.push(h3(stypeLabel));
      for (const s of rows) {
        const label = sectionDisplayLabel(s);
        pushSectionLayers(out, s, label !== stypeLabel ? label : undefined);
      }
    }
  }
}

function buildFromLegacy(out: ReportChild[], guide: GuideRaw) {
  // Genel özet
  addLegacySection(out, "Genel Özet", guide.general_summary);

  // Semptomlar
  addLegacySection(out, "Belirtiler", guide.symptoms);

  // Sebepler
  const hasSebepler =
    guide.medical_causes || guide.subconscious_causes ||
    guide.temperament_causes || guide.other_causes;
  if (hasSebepler) {
    out.push(h3("Nedenler / Sebepler"));
    addLegacySection(out, "Tıbbi Nedenler", guide.medical_causes);
    addLegacySection(out, "Bilinçaltı Sebepleri", guide.subconscious_causes);
    addLegacySection(out, "Mizaç Sebepleri", guide.temperament_causes);
    addLegacySection(out, "Diğer Sebepler", guide.other_causes);
  }

  // Tanı
  if (guide.iridology_match || guide.hand_analysis_match) {
    out.push(h3("Analiz Eşleştirmeleri"));
    addLegacySection(out, "İridoloji'de Karşılığı", guide.iridology_match);
    addLegacySection(out, "El Analizinde Karşılığı", guide.hand_analysis_match);
  }

  // Uygulamalar
  if (guide.cupping_leech || guide.reflexology ||
      guide.diet_recommendations || guide.herbal_methods) {
    out.push(h3("Uygulamalar ve Yöntemler"));
    addLegacySection(out, "Hacamat & Sülük", guide.cupping_leech);
    addLegacySection(out, "Refleksoloji", guide.reflexology);
    addLegacySection(out, "Diyet Önerileri", guide.diet_recommendations);
    addLegacySection(out, "Bitkisel Yöntemler", guide.herbal_methods);
  }

  addLegacySection(out, "Doğaltaş Önerileri", guide.stone_recommendations);
  addLegacySection(out, "Aromaterapi", guide.aromatherapy);

  // Destekleyici
  if (guide.meditation || guide.breathwork || guide.bioenergy ||
      guide.massage || guide.daily_routine || guide.sleep_routine ||
      guide.supportive_alternative_methods) {
    out.push(h3("Destekleyici Uygulamalar"));
    addLegacySection(out, "Meditasyon", guide.meditation);
    addLegacySection(out, "Nefes Çalışması", guide.breathwork);
    addLegacySection(out, "Biyoenerji", guide.bioenergy);
    addLegacySection(out, "Masaj", guide.massage);
    addLegacySection(out, "Günlük Rutin", guide.daily_routine);
    addLegacySection(out, "Uyku Düzeni", guide.sleep_routine);
    addLegacySection(out, "Destekleyici / Alternatif", guide.supportive_alternative_methods);
  }

  addLegacySection(out, "İslami Öneriler", guide.islamic_recommendations);
}

function buildGuideContent(guide: GuideRaw, index: number, isSingle: boolean): ReportChild[] {
  const out: ReportChild[] = [];
  const name = txt(guide.name) || "İsimsiz Kayıt";

  if (!isSingle) {
    out.push(profileLabel(`KAYIT #${String(index + 1).padStart(3, "0")}`, C_SIFA));
  }
  out.push(h2(name));

  out.push(twoColTable([
    ["Kategori", txt(guide.category) || "Belirtilmemiş"],
    ["Tarih",    formatDateTR(guide.updated_at || guide.created_at)],
  ]));

  // Belirtiler (symptoms alanı — her zaman kontrol et)
  if (txt(guide.symptoms)) {
    out.push(h3("Belirtiler"));
    out.push(bodyText(txt(guide.symptoms)));
  }

  const sections = (Array.isArray(guide.healing_guide_sections)
    ? guide.healing_guide_sections
    : []
  )
    .filter((s) => hasAnySectionLayer(s)) // içerik / kaynak / uzman notu / dikkat olan bölümler
    // FAZ 2: kalıcı sıra (sort_order dolu önce; null'lar created_at ile sona).
    .slice()
    .sort((a, b) => {
      const ao = typeof a.sort_order === "number" ? a.sort_order : null;
      const bo = typeof b.sort_order === "number" ? b.sort_order : null;
      if (ao != null && bo != null) return ao - bo || a.created_at.localeCompare(b.created_at);
      if (ao != null) return -1;
      if (bo != null) return 1;
      return a.created_at.localeCompare(b.created_at);
    });

  if (sections.length > 0) {
    // Yeni yapı: section tablosundan içerik
    buildFromSections(out, sections);
  } else {
    // Eski yapı: legacy kolonlar
    buildFromLegacy(out, guide);
  }

  return out;
}

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
    exportMode?: ExportMode;
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

  // Hem legacy kolonlar hem sections join — hangi veri yapısı olursa olsun çalışır
  const SELECT = `
    id, tenant_id, name, category, symptoms, created_at, updated_at,
    general_summary, medical_causes, subconscious_causes, temperament_causes,
    other_causes, iridology_match, hand_analysis_match, cupping_leech,
    reflexology, diet_recommendations, herbal_methods, stone_recommendations,
    aromatherapy, meditation, breathwork, bioenergy, massage, daily_routine,
    sleep_routine, supportive_alternative_methods, islamic_recommendations,
    healing_guide_sections (
      id, guide_id, section_type, mode, title, note, source,
      source_kind, expert_note, attention, sort_order, created_at
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
      out.push(...((bd ?? []) as GuideRaw[]));
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
      guides = (data ?? []) as GuideRaw[];
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
      guides = (data ?? []) as GuideRaw[];
    }
  } catch (e) {
    return serverErrorResponse({ route: "sifa/word-report", action: "POST.read", tenantId: verifiedTenantId, cause: e });
  }

  if (!guides.length)
    return Response.json({ ok: false, error: "Bu seçim için şifa rehberi kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && guides.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${guides[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${guides.length})` :
    exportMode === "filtered" ? `Filtrelenmiş Kayıtlar (${guides.length})` :
    `Tüm Şifa Rehberi (${guides.length})`;

  const categories = new Set(guides.map((g) => txt(g.category)).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "ŞİFA REHBERİ RAPORU",
    subtitle: isSingle && guides[0]
      ? `${guides[0].name} — Şifa Rehberi`
      : "Şifa Rehberi Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Kayıt Sayısı", value: String(guides.length) },
      { label: "Kategori",     value: String(categories.size) },
      { label: "Kapsam",       value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Kayıt Sayısı", String(guides.length)],
    ["Kategori",     String(categories.size)],
    ["Kapsam",       exportLabel],
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Şifa Rehberi Kayıtları", C_SIFA, true));
  all.push(muted(`${guides.length} kayıt`));
  all.push(spacer());

  guides.forEach((guide, i) => {
    if (i > 0) all.push(divider());
    all.push(...buildGuideContent(guide, i, isSingle));
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
      if (snaps.length > 0) all.push(...buildSnapshotSection(snaps));
    } catch {
      /* regresyon güvenli: teslim seçimi eklenemezse mevcut rehber raporu korunur */
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Şifa Rehberi Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && guides[0]?.name ? slugify(guides[0].name) :
    exportMode === "selected" ? "secili" :
    exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `sifa-rehberi-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
