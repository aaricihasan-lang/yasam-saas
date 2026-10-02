import { NextRequest } from "next/server";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import {
  reportRateLimit,
  capSelectedIds,
  MAX_EXPORT_RECORDS,
  EXPORT_TRUNCATED_NOTE,
} from "@/lib/biyoenerji/reportSecurity";
import {
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
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
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { formatInstantDate, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
import {
  deriveChakraBibliography,
  SOURCE_EVIDENCE_BLOCK_TYPE,
} from "@/lib/bioenergy/chakraWorkspace";
import {
  readChakraReportData,
  type ChakraReportRow,
  type ChakraReportSelection,
} from "@/lib/bioenergy/chakraReportRead";

export const runtime = "nodejs";

const C_CAKRA = "9333ea"; // çakra mor

/** 8 canonical section — Word bölüm başlıkları. */
const WORD_SECTION_ORDER: readonly [string, string][] = [
  ["genel-bakis", "Genel Bakış"],
  ["enerji-anatomisi", "Enerji Anatomisi & Denge"],
  ["nedenler-blokajlar", "Nedenler & Blokajlar"],
  ["beden-sistem", "Beden & Sistem"],
  ["duygusal-zihinsel", "Duygusal & Zihinsel"],
  ["uygulamalar", "Uygulamalar"],
  ["taslar-destekleyiciler", "Taşlar & Destekleyiciler"],
  ["notlar-kaynaklar", "Notlar & Kaynaklar"],
];

/** editorial_explanation'ı Word gövdesine güvenli düz metne indir (raw ### sızıntısı yok). */
function blockBodyToPlain(text: string): string {
  return text
    .split(/\r?\n/)
    .map((ln) => ln.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[-*]\s+/, "• "))
    .join("\n")
    .replace(/^\s*---\s*$/gm, "")
    .trim();
}

type ExportMode = "all" | "selected" | "single";

type ChakraRow = ChakraReportRow;

/** created_at (timestamptz) → Europe/Istanbul takvim günü (FA-02; sunucu UTC'de çalışır). */
function formatDateTR(d: string): string {
  return formatInstantDate(d, { style: "long", fallback: d });
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  // Android: Word (.docx) indirme kapalı (ürün kararı) — defense-in-depth.
  const androidBlocked = androidWordGuard(request);
  if (androidBlocked) return androidBlocked;

  const guard = await requireModuleAccess(request, "energy_body");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // FAZ1: best-effort rate-limit (asıl koruma aşağıdaki HARD CAP'tir).
  const rl = reportRateLimit("chakra", tenantId);
  if (rl) return rl;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", chakraIds, chakraId } = body as {
    exportMode?: ExportMode;
    chakraIds?: string[];
    chakraId?: string;
  };

  // AA-6: route kendi service_role client'ını KURMAZ — guard'ın sunucu client'ı (guard.db).
  const { db } = guard;

  // BIO-01 — çakralar + bloklar sayfalı, deterministik sıralı ve sayım-doğrulamalı okunur.
  // Okuma eksik/hatalıysa rapor ÜRETİLMEZ (sessiz kırpma / sessiz legacy fallback yok).
  const sel: ChakraReportSelection =
    exportMode === "single" && typeof chakraId === "string" && chakraId
      ? { mode: "single", chakraId }
      : exportMode === "selected" && Array.isArray(chakraIds) && chakraIds.length > 0
        ? { mode: "selected", chakraIds: capSelectedIds(chakraIds) }
        : { mode: "all" };
  const read = await readChakraReportData(db, tenantId, sel, MAX_EXPORT_RECORDS);
  if (!read.ok) {
    console.error(`[chakra-report] ${read.stage} read failed:`, read.error);
    await trackUsage(guard, request, { module: "energy_body", action: "action_failed", failedAction: "report_generated", subEntity: "chakra", errorClass: "server" });
    return Response.json(
      {
        ok: false,
        error: read.stage === "blocks"
          ? "Çakra içerik blokları eksiksiz okunamadı; eksik rapor üretilmedi. Lütfen tekrar deneyin."
          : "Çakra kayıtları okunamadı.",
      },
      { status: 500 },
    );
  }

  const chakras = read.chakras as ChakraRow[];
  if (!chakras.length)
    return Response.json({ ok: false, error: "Bu seçim için çakra kaydı bulunamadı." }, { status: 404 });
  const blocksByChakra = read.blocksByChakra;

  const today = reportGeneratedLabel();
  const dateSlug = reportFileDate();
  const isSingle = exportMode === "single" || (exportMode === "selected" && chakras.length === 1);

  const exportLabel =
    isSingle ? `Tek Çakra — ${chakras[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Çakralar (${chakras.length})` :
    `Tüm Çakra Kütüphanesi (${chakras.length})`;

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "ÇAKRA KÜTÜPHANESİ",
    subtitle: isSingle && chakras[0]
      ? `${chakras[0].name || "Çakra"} · Çakra Raporu`
      : "Biyoenerji Çakra Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Çakra Kayıt Sayısı", value: String(chakras.length) },
      { label: "Kapsam",             value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Çakra Kayıt Sayısı", String(chakras.length)],
    ["Kapsam",             exportLabel],
  ]));

  all.push(...buildTOCPage());

  if (read.truncated) {
    all.push(muted(EXPORT_TRUNCATED_NOTE(MAX_EXPORT_RECORDS)));
  }

  all.push(h1Colored("1. Çakra Kütüphanesi", C_CAKRA, true));
  all.push(muted(`${chakras.length} kayıt`));
  all.push(spacer());

  chakras.forEach((chakra, i) => {
    const name = chakra.name?.trim() || "İsimsiz Çakra";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`ÇAKRA #${String(i + 1).padStart(3, "0")}`, C_CAKRA));
    all.push(h2(name));

    // Quick-fact tablosu (canonical block modeliyle uyumlu; legacy Renk fallback korunur)
    // Hızlı bilgiler: yalnız dolu alanlar (Sanskritçe ad / element / konum / bija mantra).
    const quick: [string, string][] = [];
    if (chakra.sanskrit_name?.trim()) quick.push(["Sanskritçe Ad", chakra.sanskrit_name.trim()]);
    if (chakra.element?.trim()) quick.push(["Element", chakra.element.trim()]);
    if (chakra.location?.trim()) quick.push(["Konum", chakra.location.trim()]);
    if (chakra.bija_mantra?.trim()) quick.push(["Bija Mantra", chakra.bija_mantra.trim()]);
    all.push(twoColTable([
      ...quick,
      ["Renk",         chakra.color?.trim() || "Belirtilmemiş"],
      ["Kayıt Tarihi", formatDateTR(chakra.created_at)],
    ]));

    const blocks = blocksByChakra.get(chakra.id) ?? [];
    const visible = blocks
      .filter((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE && (b.editorial_explanation ?? "").trim().length > 0)
      .sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order
          : (a.created_at ?? "") < (b.created_at ?? "") ? -1 : a.id < b.id ? -1 : 1);

    if (visible.length > 0) {
      // ── Canonical block modeli: 8 section sırasında görünür bloklar ──
      for (const [key, label] of WORD_SECTION_ORDER) {
        const secBlocks = visible.filter((b) => b.section_key === key);
        if (secBlocks.length === 0) continue; // boş section gösterme
        all.push(h3(label));
        for (const b of secBlocks) {
          if (b.block_title?.trim()) all.push(bodyText(b.block_title.trim()));
          all.push(bodyText(blockBodyToPlain(b.editorial_explanation ?? "")));
        }
      }
      // Tek Kaynakça (source-evidence'tan distinct eser; ana gövdede kaynak adı YOK)
      const bib = deriveChakraBibliography(blocks);
      if (bib.length > 0) {
        all.push(h3("Kaynakça"));
        bib.forEach((e, idx) => all.push(bodyText(`${idx + 1}. ${e.author ? `${e.author} — ` : ""}${e.title}`)));
      }
      // BIO-05 — editörde düzenlenebilen "Ek Bilgiler" (doluysa) zengin içerikli çakrada da raporlanır.
      const extra: [string, string | null][] = [
        ["Organlar", chakra.organs], ["Bezler", chakra.glands], ["Taşlar", chakra.stones],
        ["Nedenler", chakra.causes], ["Fiziksel", chakra.physical], ["Zihinsel", chakra.mental],
        ["Notlar", chakra.notes],
      ];
      const filled = extra.filter(([, v]) => (v ?? "").trim().length > 0);
      if (filled.length > 0) {
        all.push(h3("Ek Bilgiler"));
        for (const [label, v] of filled) all.push(bodyText(`${label}: ${(v ?? "").trim()}`));
      }
    } else {
      // ── Legacy fallback: rich-block'suz eski kayıtlar (mevcut davranış korunur) ──
      if (chakra.organs?.trim())  { all.push(h3("Organlar"));  all.push(bodyText(chakra.organs.trim())); }
      if (chakra.glands?.trim())  { all.push(h3("Bezler"));    all.push(bodyText(chakra.glands.trim())); }
      if (chakra.stones?.trim())  { all.push(h3("Taşlar"));    all.push(bodyText(chakra.stones.trim())); }
      if (chakra.causes?.trim())  { all.push(h3("Nedenler"));  all.push(bodyText(chakra.causes.trim())); }
      if (chakra.physical?.trim()){ all.push(h3("Fiziksel"));  all.push(bodyText(chakra.physical.trim())); }
      if (chakra.mental?.trim())  { all.push(h3("Zihinsel"));  all.push(bodyText(chakra.mental.trim())); }
      if (chakra.notes?.trim())   { all.push(h3("Notlar"));    all.push(bodyText(chakra.notes.trim())); }
    }
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("biyoenerji", expertDisplayName(guard.profile)));

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Çakra Kütüphanesi Raporu · Yaşam Sistemi", { note: "biyoenerji" }) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  // USAGE360: rapor YALNIZ docx başarıyla üretildikten sonra sayılır (Android guard 403'ü olay değildir).
  await trackUsage(guard, request, {
    module: "energy_body",
    action: "report_generated",
    subEntity: "chakra",
    resourceId: exportMode === "single" && typeof chakraId === "string" ? chakraId : null,
    itemCount: chakras.length,
  });
  const modeSlug =
    isSingle && chakras[0]?.name ? slugify(chakras[0].name) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-cakra-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
