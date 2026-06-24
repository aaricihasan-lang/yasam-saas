import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  fieldInline,
  h1Colored,
  h2,
  muted,
  profileLabel,
  ReportChild,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const C_MINERAL = "064e3b"; // koyu yeşil — mineral rengi

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countFilledArrays(mineral: MineralRow): number {
  const arrays = [
    mineral.fiziksel, mineral.zihinsel, mineral.fizyoloji,
    mineral.eksiklik_belirtileri, mineral.fazlalik_belirtileri,
    mineral.doz_asimi, mineral.iceren_taslar, mineral.organ_etkileri, mineral.cakralar,
  ];
  return arrays.filter((a) => a && a.length > 0).length;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: mineralId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId } = body as { tenantId?: string; userId?: string };

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

  const { data, error } = await db
    .from("minerals")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", mineralId)
    .maybeSingle();

  if (error)
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  if (!data)
    return Response.json({ ok: false, error: "Mineral kaydı bulunamadı." }, { status: 404 });

  const mineral = data as MineralRow;
  const mineralName = mineral.name || "İsimsiz Mineral";
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const nameSlug = slugify(mineralName);
  const filledArrays = countFilledArrays(mineral);

  const all: ReportChild[] = [];

  // ── Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   mineralName.toUpperCase(),
    subtitle: "Mineral Detay Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Mineral Adı",    value: mineralName },
      { label: "Kategori",       value: mineral.kategori || "Belirtilmemiş" },
      { label: "Kaynak",         value: mineral.source_id || "Belirtilmemiş" },
      { label: "Dolu Bölüm",    value: `${filledArrays} / 9` },
      { label: "İçeren Taş",    value: String(mineral.iceren_taslar?.length ?? 0) },
    ],
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Mineral Adı",    mineralName],
    ["Kategori",       mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",         mineral.source_id || "Belirtilmemiş"],
    ["Dolu Bölüm",    `${filledArrays} / 9`],
    ["İçeren Taş",    String(mineral.iceren_taslar?.length ?? 0)],
    ["Kayıt Tarihi",  mineral.created_at ? new Date(mineral.created_at).toLocaleDateString("tr-TR") : "-"],
  ]));

  // ── İçindekiler
  all.push(...buildTOCPage());

  // ── Bölüm 1: Genel Bilgiler
  all.push(profileLabel("BÖLÜM 1", C_MINERAL));
  all.push(h1Colored("1. Genel Bilgiler", C_MINERAL, true));

  all.push(twoColTable([
    ["Mineral Adı", mineralName],
    ["Kategori",    mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",      mineral.source_id || "Belirtilmemiş"],
    ["Kayıt Tarihi", mineral.created_at ? new Date(mineral.created_at).toLocaleDateString("tr-TR") : "-"],
  ]));

  if (mineral.aciklama?.trim()) {
    all.push(h2("Açıklama"));
    all.push(bodyText(mineral.aciklama.trim()));
  }

  // ── Bölüm 2: Mineral Özellikleri
  all.push(h1Colored("2. Mineral Özellikleri", C_MINERAL));

  all.push(...arraySection("Fiziksel Özellikler",   mineral.fiziksel));
  all.push(...arraySection("Zihinsel Etkiler",       mineral.zihinsel));
  all.push(...arraySection("Fizyoloji",              mineral.fizyoloji));
  all.push(...arraySection("Eksiklik Belirtileri",   mineral.eksiklik_belirtileri));
  all.push(...arraySection("Fazlalık Belirtileri",   mineral.fazlalik_belirtileri));
  all.push(...arraySection("Doz Aşımı",              mineral.doz_asimi));
  all.push(...arraySection("İçeren Taşlar",          mineral.iceren_taslar));
  all.push(...arraySection("Organ Etkileri",         mineral.organ_etkileri));
  all.push(...arraySection("Çakralar",               mineral.cakralar));

  if (filledArrays === 0 && !mineral.aciklama?.trim()) {
    all.push(muted("Bu mineral kaydında henüz içerik girilmemiş."));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Mineral Raporu · ${mineralName}`) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `mineral-${nameSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
