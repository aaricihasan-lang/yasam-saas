import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  AlignmentType,
  Paragraph,
  TextRun,
} from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildTOCPage,
  C_DARK,
  C_LIGHT,
  C_MID,
  coverLine,
  divider,
  fieldInline,
  h1,
  h2,
  h3,
  muted,
  REPORT_FONT,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportMode = "all" | "filtered" | "viewed" | "selected";

type MineralRow = {
  id: string;
  name: string;
  aciklama: string | null;
  kategori: string | null;
  source_id: string | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  organ_etkileri: string[] | null;
  cakralar: string[] | null;
  created_at: string | null;
};

// ─── Document builder ─────────────────────────────────────────────────────────

function buildDocument(minerals: MineralRow[], exportLabel: string): ReportChild[] {
  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const uniqueSources = new Set(minerals.map((m) => m.source_id).filter(Boolean)).size;
  const withTaslar = minerals.filter((m) => m.iceren_taslar?.length).length;

  const out: ReportChild[] = [];

  // Cover
  out.push(
    new Paragraph({ spacing: { before: 1400 } }),
    coverLine("YAŞAM SİSTEMİ", 60, true, C_DARK),
    coverLine("MİNERAL BANKASI", 44, false, C_MID),
    coverLine("Profesyonel Mineral Raporu", 30, false, C_MID),
    spacer(),
    coverLine(`Oluşturulma Tarihi: ${date}`, 22, false, C_LIGHT),
    coverLine(`Toplam Mineral Sayısı: ${minerals.length}`, 22, false, C_LIGHT),
    coverLine(`Kapsam: ${exportLabel}`, 22, false, C_LIGHT),
  );

  // TOC
  out.push(...buildTOCPage());

  // Genel Özet
  out.push(
    h1("1. Genel Özet", true),
    muted("İstatistik özeti"),
    twoColTable([
      ["Toplam Mineral",        `${minerals.length}`],
      ["Kaynak Sayısı",         `${uniqueSources}`],
      ["Taş İçeren Mineraller", `${withTaslar}`],
    ]),
  );

  // Mineral Kayıtları
  out.push(h1("2. Mineral Kayıtları", true));
  out.push(muted(`${minerals.length} mineral`));

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) out.push(divider());

    out.push(h2(m.name || "İsimsiz Mineral"));

    // Short metadata (no heading)
    if (m.kategori?.trim())  out.push(fieldInline("Kategori", m.kategori.trim()));
    if (m.source_id?.trim()) out.push(fieldInline("Kaynak", m.source_id.trim()));
    if (m.created_at)        out.push(fieldInline("Tarih", new Date(m.created_at).toLocaleDateString("tr-TR")));

    // Content sections (H3 — Navigation Panel)
    if (m.aciklama?.trim()) { out.push(h3("Açıklama")); out.push(bodyText(m.aciklama.trim())); }
    out.push(...arraySection("Fiziksel Özellikler",   m.fiziksel));
    out.push(...arraySection("Zihinsel Etkiler",      m.zihinsel));
    out.push(...arraySection("Fizyoloji",             m.fizyoloji));
    out.push(...arraySection("Eksiklik Belirtileri",  m.eksiklik_belirtileri));
    out.push(...arraySection("Fazlalık Belirtileri",  m.fazlalik_belirtileri));
    out.push(...arraySection("Doz Aşımı",             m.doz_asimi));
    out.push(...arraySection("İçeren Taşlar",         m.iceren_taslar));
    out.push(...arraySection("Organ Etkileri",        m.organ_etkileri));
    out.push(...arraySection("Çakralar",              m.cakralar));
  }

  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", mineralIds } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    mineralIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string") {
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const SELECT =
    "id, name, aciklama, kategori, source_id, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

  let q = db.from("minerals").select(SELECT).eq("tenant_id", tenantId);

  let exportLabel = "Tüm Mineraller";

  if ((exportMode === "filtered" || exportMode === "viewed" || exportMode === "selected") &&
      Array.isArray(mineralIds) && mineralIds.length > 0) {
    q = q.in("id", mineralIds);
    exportLabel =
      exportMode === "viewed"   ? "Görüntülenen Kayıtlar" :
      exportMode === "selected" ? "Seçili Mineraller"     :
      "Filtrelenmiş Sonuçlar";
  }

  const { data, error } = await q.order("name");

  if (error) {
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });
  }

  const minerals = (data ?? []) as MineralRow[];
  if (!minerals.length) {
    return Response.json({ ok: false, error: "Bu seçim için mineral bulunamadı." }, { status: 404 });
  }

  const allChildren = buildDocument(minerals, exportLabel);

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Yaşam Sistemi Mineral Bankası") },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dateSlug = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="mineral-bankasi-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
