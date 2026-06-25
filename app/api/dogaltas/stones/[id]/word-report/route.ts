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
  divider,
  embedImageParagraph,
  extractFirstImageUrl,
  fetchImageBuffer,
  fieldInline,
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

const ADMIN_LIBRARY_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

const C_STONE = "0e7490"; // turkuaz — taş rengi

type StoneRow = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
};

function v(val: string | null | undefined): string {
  return val?.trim() || "Bilgi girilmemiş";
}

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

function countFilledSections(stone: StoneRow): number {
  const fields = [
    stone.short_description, stone.general_info, stone.source_note,
    stone.physical_effects, stone.spiritual_effects, stone.other_effects,
    stone.warning_text, stone.feng_shui, stone.meditation, stone.care, stone.application,
  ];
  const arrays = [stone.chakras, stone.warning_tags];
  const hasAssignments = stone.assignments && Object.keys(stone.assignments).length > 0;
  return fields.filter((f) => f?.trim()).length +
    arrays.filter((a) => a && a.length > 0).length +
    (hasAssignments ? 1 : 0);
}

function buildAssignmentSections(assignments: Record<string, string[][]> | null): ReportChild[] {
  if (!assignments) return [];
  const out: ReportChild[] = [];
  for (const [category, rows] of Object.entries(assignments)) {
    if (!rows || rows.length === 0) continue;
    const items = rows
      .filter((row) => row.length > 0)
      .map((row) => row.filter(Boolean).join(" / "));
    if (items.length === 0) continue;
    out.push(...arraySection(category, items));
  }
  return out;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: stoneId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId } = body as { tenantId?: string; userId?: string };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // IDOR koruması: userId bu tenant'a gerçekten ait mi? — service_role
  const { data: userRow } = await db
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

  // Kütüphane taşları da dahil et
  const tenantIds = tenantId === ADMIN_LIBRARY_TENANT_ID
    ? [tenantId]
    : [tenantId, ADMIN_LIBRARY_TENANT_ID];

  const { data, error } = await db
    .from("stones")
    .select("*")
    .in("tenant_id", tenantIds)
    .eq("id", stoneId)
    .maybeSingle();

  if (error)
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  if (!data)
    return Response.json({ ok: false, error: "Taş kaydı bulunamadı." }, { status: 404 });

  const stone = data as StoneRow;
  const stoneName = stone.stone_name || "İsimsiz Taş";
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const nameSlug = slugify(stoneName);

  // Resim
  const imageUrl = extractFirstImageUrl(stone.images);
  let imageBuf: Buffer | null = null;
  if (imageUrl) imageBuf = await fetchImageBuffer(imageUrl).catch(() => null);

  const filledSections = countFilledSections(stone);
  const imageCount = Array.isArray(stone.images) ? stone.images.filter((img) => img.url?.trim()).length : 0;
  const chakraCount = stone.chakras?.filter(Boolean).length ?? 0;
  const isLibrary = stone.tenant_id === ADMIN_LIBRARY_TENANT_ID;

  const all: ReportChild[] = [];

  // ── Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   stoneName.toUpperCase(),
    subtitle: "Doğaltaş Detay Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Taş Adı",       value: stoneName },
      { label: "Dolu Bölüm",    value: String(filledSections) },
      { label: "Görsel Sayısı", value: String(imageCount) },
      { label: "Çakra Sayısı",  value: String(chakraCount) },
      ...(isLibrary ? [{ label: "Kaynak", value: "Kütüphane" }] : []),
    ],
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Taş Adı",       stoneName],
    ["Dolu Bölüm",    `${filledSections} bölüm`],
    ["Görsel Sayısı", `${imageCount} görsel`],
    ["Çakra",         chakraCount > 0 ? (stone.chakras ?? []).filter(Boolean).join(", ") : "Belirtilmemiş"],
    ["Kayıt Tarihi",  stone.created_at ? new Date(stone.created_at).toLocaleDateString("tr-TR") : "-"],
  ]));

  // ── İçindekiler
  all.push(...buildTOCPage());

  // ── Görsel (varsa)
  if (imageBuf) {
    all.push(embedImageParagraph(imageBuf, 320));
    all.push(spacer());
  }

  // ── Bölüm 1: Genel Bilgiler
  all.push(profileLabel("BÖLÜM 1", C_STONE));
  all.push(h1Colored("1. Genel Bilgiler", C_STONE, true));

  if (stone.short_description?.trim()) {
    all.push(h2("Kısa Açıklama"));
    all.push(bodyText(stone.short_description.trim()));
  }
  if (stone.general_info?.trim()) {
    all.push(h2("Genel Taş Açıklaması"));
    all.push(bodyText(stone.general_info.trim()));
  }
  if (stone.source_note?.trim()) {
    all.push(h2("Kaynak Notu"));
    all.push(bodyText(stone.source_note.trim()));
  }
  if (!stone.short_description?.trim() && !stone.general_info?.trim() && !stone.source_note?.trim()) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 2: Etkiler
  all.push(divider());
  all.push(profileLabel("BÖLÜM 2", C_STONE));
  all.push(h1Colored("2. Etkiler", C_STONE));

  if (stone.physical_effects?.trim()) { all.push(h2("Fiziksel Etkiler"));  all.push(bodyText(stone.physical_effects.trim())); }
  if (stone.spiritual_effects?.trim()) { all.push(h2("Ruhsal Etkiler"));   all.push(bodyText(stone.spiritual_effects.trim())); }
  if (stone.other_effects?.trim()) { all.push(h2("Diğer Etkiler"));        all.push(bodyText(stone.other_effects.trim())); }
  if (stone.warning_text?.trim()) { all.push(h2("Uyarılar ve Hassasiyetler")); all.push(bodyText(stone.warning_text.trim())); }
  all.push(...arraySection("Uyarı Etiketleri", stone.warning_tags ?? null));

  if (!stone.physical_effects?.trim() && !stone.spiritual_effects?.trim() &&
      !stone.other_effects?.trim() && !stone.warning_text?.trim() && !stone.warning_tags?.length) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 3: Kullanım Alanları
  all.push(divider());
  all.push(profileLabel("BÖLÜM 3", C_STONE));
  all.push(h1Colored("3. Kullanım Alanları", C_STONE));

  if (stone.feng_shui?.trim())    { all.push(h2("Feng Shui")); all.push(bodyText(stone.feng_shui.trim())); }
  if (stone.meditation?.trim())   { all.push(h2("Meditasyon")); all.push(bodyText(stone.meditation.trim())); }
  if (stone.care?.trim())         { all.push(h2("Bakım")); all.push(bodyText(stone.care.trim())); }
  if (stone.application?.trim())  { all.push(h2("Uygulama")); all.push(bodyText(stone.application.trim())); }

  if (!stone.feng_shui?.trim() && !stone.meditation?.trim() && !stone.care?.trim() && !stone.application?.trim()) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Bölüm 4: Çakralar ve Atamalar
  all.push(divider());
  all.push(profileLabel("BÖLÜM 4", C_STONE));
  all.push(h1Colored("4. Çakralar ve Atamalar", C_STONE));

  all.push(...arraySection("Çakralar", stone.chakras ?? null));
  all.push(...buildAssignmentSections(stone.assignments));

  if (!stone.chakras?.length && (!stone.assignments || Object.keys(stone.assignments).length === 0)) {
    all.push(muted("Bu bölümde henüz bilgi girilmemiş."));
  }

  // ── Ek görsel referansı
  if (imageCount > 1) {
    all.push(divider());
    all.push(h3(`Ek Görseller`));
    all.push(muted(`Bu taş kaydında toplam ${imageCount} görsel bulunmaktadır. Sistemi ziyaret edin.`));
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Doğaltaş Raporu · ${stoneName}`) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `dogaltas-${nameSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
