import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  buildTOCPage,
  divider,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  SECTION_COLORS,
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
  const color = SECTION_COLORS.minerals;

  const out: ReportChild[] = [];

  // Premium cover
  out.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "MİNERAL BANKASI",
    subtitle: "Profesyonel Mineral Referans Kataloğu",
    date:     `Oluşturulma Tarihi: ${date}`,
    stats: [
      { label: "Toplam Mineral Sayısı",      value: String(minerals.length) },
      { label: "Kaynak Sayısı",               value: String(uniqueSources) },
      { label: "Taş İçeren Mineraller",       value: String(withTaslar) },
      { label: "Kapsam",                      value: exportLabel },
    ],
  }));

  // Stats page
  out.push(...buildStatsPage([
    ["Toplam Mineral",        String(minerals.length)],
    ["Kaynak Sayısı",         String(uniqueSources)],
    ["Taş İçeren Mineraller", String(withTaslar)],
  ]));

  // TOC
  out.push(...buildTOCPage());

  // Genel Özet
  out.push(
    h1Colored("1. Genel Özet", color, true),
    muted("Mineral bankası istatistikleri"),
    twoColTable([
      ["Toplam Mineral",        String(minerals.length)],
      ["Kaynak Sayısı",         String(uniqueSources)],
      ["Taş İçeren Mineraller", String(withTaslar)],
    ]),
  );

  // Section divider + Mineral Kayıtları
  out.push(
    ...buildSectionDivider("MİNERAL KAYITLARI", `${minerals.length} Mineral`, color),
    h1Colored("2. Mineral Kayıtları", color, true),
    muted(`${minerals.length} mineral · ${exportLabel}`),
  );

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) out.push(divider());

    out.push(profileLabel(`MİNERAL #${String(i + 1).padStart(3, "0")}`, color));
    out.push(h2(m.name || "İsimsiz Mineral"));

    // Short metadata
    if (m.kategori?.trim())  out.push(fieldInline("Kategori", m.kategori.trim()));
    if (m.source_id?.trim()) out.push(fieldInline("Kaynak", m.source_id.trim()));
    if (m.created_at)        out.push(fieldInline("Tarih", new Date(m.created_at).toLocaleDateString("tr-TR")));

    // Content sections (H3)
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

  const { tenantId, userId, exportMode = "all", mineralIds } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    mineralIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // IDOR koruması: userId bu tenant'a gerçekten ait mi?
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? supabaseKey;
  const anonDb = createClient(supabaseUrl, anonKey);
  const { data: userRow } = await anonDb
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  // Demo hesap: export sunucu seviyesinde engellenir
  if (await isDemoAccountId(userId, db))
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

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
  if (error) return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  const minerals = (data ?? []) as MineralRow[];
  if (!minerals.length) return Response.json({ ok: false, error: "Bu seçim için mineral bulunamadı." }, { status: 404 });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Yaşam Sistemi Mineral Bankası") },
      children: buildDocument(minerals, exportLabel),
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
