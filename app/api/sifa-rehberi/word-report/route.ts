import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { verifyUserRequest } from "@/lib/auth/userGuard";
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

export const runtime = "nodejs";

const C_SIFA = "059669";

type ExportMode = "all" | "selected" | "single";

// ── Section tablosu yapısı ────────────────────────────────────────────────────
type SectionRow = {
  id: string;
  guide_id: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
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

// ── Mode / section_type → Türkçe etiket ──────────────────────────────────────
const MODE_LABEL: Record<string, string> = {
  general_summary: "Genel Özet",
  medical_causes: "Tıbbi Nedenler",
  subconscious_causes: "Bilinçaltı Sebepleri",
  temperament_causes: "Mizaç Sebepleri",
  other_causes: "Diğer Sebepler",
  iridology_match: "İridoloji'de Karşılığı",
  hand_analysis_match: "El Analizinde Karşılığı",
  cupping_leech: "Hacamat & Sülük",
  hacamat_suluk: "Hacamat & Sülük",
  hacamat: "Hacamat & Sülük",
  reflexology: "Refleksoloji",
  refleksoloji: "Refleksoloji",
  diet_recommendations: "Diyet Önerileri",
  diyet: "Diyet Önerileri",
  herbal_methods: "Bitkisel Yöntemler",
  herbal: "Bitkisel Yöntemler",
  bitkisel: "Bitkisel Yöntemler",
  stone_recommendations: "Doğaltaş Önerileri",
  stones_details: "Doğaltaş Detayları",
  aromatherapy: "Aromaterapi",
  aromaterapi: "Aromaterapi",
  meditation: "Meditasyon",
  breathwork: "Nefes Çalışması",
  nefes: "Nefes Çalışması",
  bioenergy: "Biyoenerji",
  bioenerji: "Biyoenerji",
  massage: "Masaj",
  masaj: "Masaj",
  daily_routine: "Günlük Rutin",
  sleep_routine: "Uyku Düzeni",
  supportive_alternative_methods: "Destekleyici / Alternatif Uygulamalar",
  supportive: "Destekleyici Uygulamalar",
  islamic_recommendations: "İslami Öneriler",
  islamic_suggestions: "İslami Öneriler",
  reasons: "Nedenler / Sebepler",
  applications: "Uygulamalar / Yöntemler",
  tibbi: "Tıbbi Nedenler",
  bilincalti: "Bilinçaltı Sebepleri",
  mizac: "Mizaç Sebepleri",
  diger: "Diğer Sebepler",
  uygulama: "Uygulama",
};

const SECTION_TYPE_LABEL: Record<string, string> = {
  reasons: "Nedenler / Sebepler",
  applications: "Uygulamalar / Yöntemler",
  herbal: "Bitkisel Yöntemler",
  stones_details: "Doğaltaş Detayları",
  islamic_suggestions: "İslami Öneriler",
  supportive: "Destekleyici Uygulamalar",
};

const SECTION_TYPE_ORDER = [
  "reasons",
  "applications",
  "herbal",
  "stones_details",
  "islamic_suggestions",
  "supportive",
];

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

function buildFromSections(out: ReportChild[], sections: SectionRow[]) {
  // Önce symptoms / genel özet varsa ekle
  // sections_type bazında grupla ve sırayla yaz
  const grouped: Record<string, SectionRow[]> = {};
  for (const s of sections) {
    const key = s.section_type || "other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  // Önce SECTION_TYPE_ORDER'a göre, sonra bilinmeyenler
  const orderedTypes = [
    ...SECTION_TYPE_ORDER.filter((t) => grouped[t]?.length),
    ...Object.keys(grouped).filter((t) => !SECTION_TYPE_ORDER.includes(t) && grouped[t]?.length),
  ];

  for (const stype of orderedTypes) {
    const rows = grouped[stype] ?? [];
    if (!rows.length) continue;

    const stypeLabel = SECTION_TYPE_LABEL[stype] ?? stype;

    // Eğer bu grup tek bir section içeriyorsa başlık olarak section label kullan
    if (rows.length === 1) {
      const s = rows[0]!;
      const content = txt(s.note);
      if (!content) continue;
      const label = sectionDisplayLabel(s);
      out.push(h3(label !== stypeLabel ? label : stypeLabel));
      out.push(bodyText(content));
      if (txt(s.source)) out.push(bodyText(`Kaynak: ${txt(s.source)}`));
    } else {
      // Birden fazla: grup başlığı + alt bölümler
      out.push(h3(stypeLabel));
      for (const s of rows) {
        const content = txt(s.note);
        if (!content) continue;
        const label = sectionDisplayLabel(s);
        if (label !== stypeLabel) {
          out.push(bodyText(`▸ ${label}`));
        }
        out.push(bodyText(content));
        if (txt(s.source)) out.push(bodyText(`Kaynak: ${txt(s.source)}`));
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
  ).filter((s) => txt(s.note)); // sadece içeriği olan sections

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
  // (verifyUserRequest) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  const guard = await verifyUserRequest(request);
  if (!guard.ok) return guard.response;
  // Export sorgularında body tenantId değil, oturumdan doğrulanmış tenant kullanılır.
  const verifiedTenantId = guard.tenantId;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", ids, id } = body as {
    exportMode?: ExportMode;
    ids?: string[];
    id?: string;
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
      id, guide_id, section_type, mode, title, note, source, created_at
    )
  `;

  // Export sorgularında body tenantId değil, DB'den doğrulanmış verifiedTenantId kullanılır
  let query = db.from("healing_guides")
    .select(SELECT)
    .eq("tenant_id", verifiedTenantId);

  if (exportMode === "single" && id) {
    query = query.eq("id", id);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error)
    return Response.json({ ok: false, error: `Şifa rehberi kayıtları okunamadı: ${error.message}` }, { status: 500 });

  const guides = (data || []) as GuideRaw[];
  if (!guides.length)
    return Response.json({ ok: false, error: "Bu seçim için şifa rehberi kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && guides.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${guides[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${guides.length})` :
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
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `sifa-rehberi-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
