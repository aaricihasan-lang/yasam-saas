import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { safeLen, sanitizeMineralRowsForReport } from "@/lib/dogaltas/reportSafe";
import { fetchAllRows, fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { badSelectionResponse, missingSelectionResponse, parseReportIds, sortByTrField } from "@/lib/dogaltas/reportIds";
import { sanitizeXmlDeep } from "@/lib/dogaltas/reportSanitize";
import { Document, Packer, Paragraph } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
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
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { formatInstantDate, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";

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
  const date = reportGeneratedLabel();
  const uniqueSources = new Set(minerals.map((m) => m.source_id).filter(Boolean)).size;
  const withTaslar = minerals.filter((m) => safeLen(m.iceren_taslar) > 0).length;
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
    if (m.created_at)        out.push(fieldInline("Tarih", formatInstantDate(m.created_at)));

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

export async function POST(req: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;
  // Usage360 kimliği yalnız doğrulanmış rapor kapısından; demo orada zaten 403.
  const usageGuard = { ...auth, is_demo_account: false };

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", mineralIds } = body as {
    exportMode?: ExportMode;
    mineralIds?: string[];
  };

  const SELECT =
    "id, name, aciklama, kategori, source_id, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

  // P2-02: seçili id listesi DB'ye gitmeden doğrulanır (UUID + üst sınır).
  const wantsSubset = exportMode === "filtered" || exportMode === "viewed" || exportMode === "selected";
  const parsedIds = wantsSubset ? parseReportIds(mineralIds) : ({ ok: true, ids: null } as const);
  if (!parsedIds.ok) return badSelectionResponse(parsedIds.error);
  const ids = parsedIds.ids;

  let exportLabel = "Tüm Mineraller";
  if (ids) {
    exportLabel =
      exportMode === "viewed"   ? "Görüntülenen Kayıtlar" :
      exportMode === "selected" ? "Seçili Mineraller"     :
      "Filtrelenmiş Sonuçlar";
  }

  // P2-07: 1000-satır tavanına takılmadan TÜM ilgili satırlar (tenant filtresi her sayfada).
  const res = ids
    ? await fetchAllRowsByIds<MineralRow>(ids, (chunk, from, to) =>
        db.from("minerals").select(SELECT).eq("tenant_id", tenantId).in("id", chunk)
          .order("name").order("id").range(from, to))
    : await fetchAllRows<MineralRow>((from, to) =>
        db.from("minerals").select(SELECT).eq("tenant_id", tenantId)
          .order("name").order("id").range(from, to));
  if (!res.ok) return serverErrorResponse({ route: "dogaltas/mineral-report", action: "POST", tenantId, cause: res.error, usage: { guard: usageGuard, req, module: "stones", failedAction: "report_generated", subEntity: "mineral" } });
  // P2-02: seçilen kayıtlardan biri bile tenant'ta yoksa (silinmiş / başka tenant) rapor ÜRETİLMEZ.
  if (ids && res.rows.length !== ids.length) return missingSelectionResponse();

  const ordered = ids && ids.length > 150 ? sortByTrField(res.rows, "name") : res.rows;
  // RPT-XML + P2-01: bozuk/legacy dizi alanı tüm raporu çökertmez (normalize + teknik log).
  const minerals = sanitizeMineralRowsForReport(sanitizeXmlDeep(ordered), {
    route: "dogaltas/mineral-report",
    tenantId,
  }).rows;
  if (!minerals.length) return Response.json({ ok: false, error: "Bu seçim için mineral bulunamadı." }, { status: 404 });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Yaşam Sistemi Mineral Bankası", { note: "dogaltas" }) },
      children: [...buildDocument(minerals, exportLabel), ...buildWellnessNoteSection("dogaltas", expertDisplayName(auth.profile))],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: mineral; çoklu → itemCount).
  await trackUsage(usageGuard, req, {
    module: "stones",
    action: "report_generated",
    subEntity: "mineral",
    resourceId: minerals.map((r) => r.id).sort().join(","),
    itemCount: minerals.length,
  });
  const dateSlug = reportFileDate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="mineral-bankasi-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
