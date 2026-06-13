import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
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

const C_SIFA = "059669"; // emerald-600

type ExportMode = "all" | "selected" | "single";

type GuideRow = {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
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
  created_at: string;
  updated_at: string | null;
};

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

function addSection(all: ReportChild[], label: string, text: string | null) {
  if (!text?.trim()) return;
  all.push(h3(label));
  all.push(bodyText(text.trim()));
}

function buildGuideContent(guide: GuideRow, index: number, isSingle: boolean): ReportChild[] {
  const out: ReportChild[] = [];
  const name = guide.name?.trim() || "İsimsiz Kayıt";

  if (!isSingle) {
    out.push(profileLabel(`KAYIT #${String(index + 1).padStart(3, "0")}`, C_SIFA));
  }
  out.push(h2(name));

  out.push(twoColTable([
    ["Kategori",   guide.category?.trim() || "Belirtilmemiş"],
    ["Tarih",      formatDateTR(guide.updated_at || guide.created_at)],
  ]));

  // Genel Özet
  addSection(out, "Genel / Özet", guide.general_summary);

  // Sebepler
  const hasSebepler =
    guide.medical_causes || guide.subconscious_causes ||
    guide.temperament_causes || guide.other_causes;
  if (hasSebepler) {
    out.push(h3("Sebepler ve Nedenler"));
    addSection(out, "Tıbbi Nedenler", guide.medical_causes);
    addSection(out, "Bilinçaltı Sebepleri", guide.subconscious_causes);
    addSection(out, "Mizaç Sebepleri", guide.temperament_causes);
    addSection(out, "Diğer Sebepler", guide.other_causes);
  }

  // Tanı
  const hasTani = guide.iridology_match || guide.hand_analysis_match;
  if (hasTani) {
    out.push(h3("Analiz Eşleştirmeleri"));
    addSection(out, "İridoloji'de Karşılığı", guide.iridology_match);
    addSection(out, "El Analizinde Karşılığı", guide.hand_analysis_match);
  }

  // Uygulamalar
  const hasUyg = guide.cupping_leech || guide.reflexology ||
    guide.diet_recommendations || guide.herbal_methods;
  if (hasUyg) {
    out.push(h3("Uygulamalar ve Yöntemler"));
    addSection(out, "Hacamat & Sülük", guide.cupping_leech);
    addSection(out, "Refleksoloji", guide.reflexology);
    addSection(out, "Diyet Önerileri", guide.diet_recommendations);
    addSection(out, "Bitkisel Yöntemler", guide.herbal_methods);
  }

  // Doğaltaş
  addSection(out, "Doğaltaş Önerileri", guide.stone_recommendations);

  // Aromaterapi
  addSection(out, "Aromaterapi", guide.aromatherapy);

  // Destekleyici
  const hasDestekleyici =
    guide.meditation || guide.breathwork || guide.bioenergy ||
    guide.massage || guide.daily_routine || guide.sleep_routine ||
    guide.supportive_alternative_methods;
  if (hasDestekleyici) {
    out.push(h3("Destekleyici Uygulamalar"));
    addSection(out, "Meditasyon", guide.meditation);
    addSection(out, "Nefes Çalışması", guide.breathwork);
    addSection(out, "Biyoenerji", guide.bioenergy);
    addSection(out, "Masaj", guide.massage);
    addSection(out, "Günlük Rutin", guide.daily_routine);
    addSection(out, "Uyku Düzeni", guide.sleep_routine);
    addSection(out, "Destekleyici / Alternatif Uygulamalar", guide.supportive_alternative_methods);
  }

  // İslami Öneriler
  addSection(out, "İslami Öneriler", guide.islamic_recommendations);

  return out;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", ids, id } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    id?: string;
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  if (exportMode === "single" && !id)
    return Response.json({ ok: false, error: "Tek kayıt için id zorunludur." }, { status: 400 });

  if (exportMode === "selected" && (!Array.isArray(ids) || ids.length === 0))
    return Response.json({ ok: false, error: "Seçili kayıtlar için ids zorunludur." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("healing_guides")
    .select("id,tenant_id,name,category,general_summary,medical_causes,subconscious_causes,temperament_causes,other_causes,iridology_match,hand_analysis_match,cupping_leech,reflexology,diet_recommendations,herbal_methods,stone_recommendations,aromatherapy,meditation,breathwork,bioenergy,massage,daily_routine,sleep_routine,supportive_alternative_methods,islamic_recommendations,created_at,updated_at")
    .eq("tenant_id", tenantId);

  if (exportMode === "single" && id) {
    query = query.eq("id", id);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error)
    return Response.json({ ok: false, error: `Şifa rehberi kayıtları okunamadı: ${error.message}` }, { status: 500 });

  const guides = (data || []) as GuideRow[];
  if (!guides.length)
    return Response.json({ ok: false, error: "Bu seçim için şifa rehberi kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && guides.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${guides[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${guides.length})` :
    `Tüm Şifa Rehberi (${guides.length})`;

  const categories = new Set(guides.map((g) => g.category?.trim()).filter(Boolean));

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
