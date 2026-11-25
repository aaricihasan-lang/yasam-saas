import { NextRequest } from "next/server";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  reportRateLimit,
  capSelectedIds,
  MAX_SELECTED_IDS,
  MAX_EXPORT_RECORDS,
} from "@/lib/biyoenerji/reportSecurity";
import {
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  buildStatsPage,
  divider,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { sanitizeBioenergyXmlText } from "@/lib/biyoenerji/xmlSafeText";

import { reportFileDate } from "@/lib/time/reportTime";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
// I18N-F1-R5 RAPOR-E (P22): sistem metinleri reports.bioenergy.* (çıktı dili; TR birebir — golden). Kayıt içeriği çevrilmez.
import { bioTextFor } from "@/lib/biyoenerji/reportText";
import {
  deriveChakraBibliography,
  SOURCE_EVIDENCE_BLOCK_TYPE,
} from "@/lib/bioenergy/chakraWorkspace";
import {
  readChakraReportData,
  type ChakraReportRow,
  type ChakraReportSelection,
} from "@/lib/bioenergy/chakraReportRead";

/** A1 — hazırlayan adı da XML-güvenli. */
function safeExpertName(profile: Record<string, unknown> | null | undefined): string | null {
  const n = expertDisplayName(profile);
  return n === null ? null : sanitizeBioenergyXmlText(n);
}

export const runtime = "nodejs";

const C_CAKRA = "9333ea"; // çakra mor

/** 8 canonical section (kanonik anahtar, sıra) — Word bölüm başlığı: reports.bioenergy.chakra.section.<anahtar>. */
const WORD_SECTION_ORDER: readonly string[] = [
  "genel-bakis",
  "enerji-anatomisi",
  "nedenler-blokajlar",
  "beden-sistem",
  "duygusal-zihinsel",
  "uygulamalar",
  "taslar-destekleyiciler",
  "notlar-kaynaklar",
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

// created_at (timestamptz) → Europe/Istanbul takvim günü (FA-02): B.dateLong (çıktı dilinde).

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
  catch { return Response.json({ ok: false, code: "BIO_INVALID_BODY", error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", chakraIds, chakraId } = body as {
    exportMode?: ExportMode;
    chakraIds?: string[];
    chakraId?: string;
  };

  // AA-6: route kendi service_role client'ını KURMAZ — guard'ın sunucu client'ı (guard.db).
  const { db } = guard;
  const B = bioTextFor(await resolveReportLocale(request, { db, tenantId, userId: guard.userId }));
  const C = B.t;

  // BIO-01 — çakralar + bloklar sayfalı, deterministik sıralı ve sayım-doğrulamalı okunur.
  // Okuma eksik/hatalıysa rapor ÜRETİLMEZ (sessiz kırpma / sessiz legacy fallback yok).
  if (exportMode === "selected" && Array.isArray(chakraIds) && chakraIds.length > MAX_SELECTED_IDS) {
    return Response.json(
      { ok: false, error: `Tek raporda en fazla ${MAX_SELECTED_IDS} kayıt seçilebilir (seçilen: ${chakraIds.length}).` },
      { status: 400 },
    );
  }
  const sel: ChakraReportSelection =
    exportMode === "single" && typeof chakraId === "string" && chakraId
      ? { mode: "single", chakraId }
      : exportMode === "selected" && Array.isArray(chakraIds) && chakraIds.length > 0
        ? { mode: "selected", chakraIds: capSelectedIds(chakraIds) }
        : { mode: "all" };
  const read = await readChakraReportData(db, tenantId, sel, MAX_EXPORT_RECORDS);
  if (!read.ok && read.stage === "missing") {
    const m = read.error as { requested: number; missing: number };
    return Response.json(
      {
        ok: false,
        error: `Seçilen ${m.requested} çakradan ${m.missing} tanesi bulunamadı (silinmiş veya bu hesaba ait değil). Eksik rapor üretilmedi; listeyi yenileyip tekrar deneyin.`,
      },
      { status: 409 },
    );
  }
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

  const chakras = read.chakras as ChakraRow[]; // A1: readChakraReportData satırları temizlenmiş döner
  if (!chakras.length)
    return Response.json({ ok: false, error: "Bu seçim için çakra kaydı bulunamadı." }, { status: 404 });
  const blocksByChakra = read.blocksByChakra;

  const today = B.generated();
  const dateSlug = reportFileDate();
  const isSingle = exportMode === "single" || (exportMode === "selected" && chakras.length === 1);

  const exportLabel =
    B.scope("chakra", isSingle ? "single" : exportMode === "selected" ? "selected" : "all", chakras.length, chakras[0]!.name || "");

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   C("common.brand"),
    title2:   C("chakra.title"),
    subtitle: isSingle && chakras[0]
      ? C("chakra.singleSubtitle", { name: chakras[0].name || C("chakra.nameFallback") })
      : C("chakra.catalogSubtitle"),
    date:     C("common.generatedOn", { date: today }),
    stats: [
      { label: C("chakra.stat"),   value: String(chakras.length) },
      { label: C("common.scope"),  value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    [C("chakra.stat"),  String(chakras.length)],
    [C("common.scope"), exportLabel],
  ], undefined, B.common));

  // İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir; başlık yoksa sayfa yok).
  const toc = new StaticTocCollector("bckr");
  const tocAt = all.length;

  if (read.truncated) {
    all.push(muted(B.truncated(MAX_EXPORT_RECORDS)));
  }

  all.push(toc.h1Colored(C("chakra.heading"), C_CAKRA, true));
  all.push(muted(B.records(chakras.length)));
  all.push(spacer());

  chakras.forEach((chakra, i) => {
    const name = chakra.name?.trim() || C("chakra.unnamed");

    if (i > 0) all.push(divider());

    all.push(profileLabel(C("chakra.cardNo", { no: String(i + 1).padStart(3, "0") }), C_CAKRA));
    all.push(toc.h2(name));

    // Quick-fact tablosu (canonical block modeliyle uyumlu; legacy Renk fallback korunur)
    // Hızlı bilgiler: yalnız dolu alanlar (Sanskritçe ad / element / konum / bija mantra).
    const quick: [string, string][] = [];
    if (chakra.sanskrit_name?.trim()) quick.push([C("chakra.quick.sanskrit"), chakra.sanskrit_name.trim()]);
    if (chakra.element?.trim()) quick.push([C("chakra.quick.element"), chakra.element.trim()]);
    if (chakra.location?.trim()) quick.push([C("chakra.quick.location"), chakra.location.trim()]);
    if (chakra.bija_mantra?.trim()) quick.push([C("chakra.quick.bija"), chakra.bija_mantra.trim()]);
    all.push(twoColTable([
      ...quick,
      [C("chakra.quick.color"),  chakra.color?.trim() || C("common.notSpecified")],
      [C("common.recordDate"),   B.dateLong(chakra.created_at)],
    ]));

    const blocks = blocksByChakra.get(chakra.id) ?? [];
    const visible = blocks
      .filter((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE && (b.editorial_explanation ?? "").trim().length > 0)
      .sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order
          : (a.created_at ?? "") < (b.created_at ?? "") ? -1 : a.id < b.id ? -1 : 1);

    if (visible.length > 0) {
      // ── Canonical block modeli: 8 section sırasında görünür bloklar ──
      for (const key of WORD_SECTION_ORDER) {
        const secBlocks = visible.filter((b) => b.section_key === key);
        if (secBlocks.length === 0) continue; // boş section gösterme
        all.push(h3(C(`chakra.section.${key}`)));
        for (const b of secBlocks) {
          if (b.block_title?.trim()) all.push(bodyText(b.block_title.trim()));
          all.push(bodyText(blockBodyToPlain(b.editorial_explanation ?? "")));
        }
      }
      // Tek Kaynakça (source-evidence'tan distinct eser; ana gövdede kaynak adı YOK)
      const bib = deriveChakraBibliography(blocks);
      if (bib.length > 0) {
        all.push(h3(C("chakra.bibliography")));
        bib.forEach((e, idx) => all.push(bodyText(`${idx + 1}. ${e.author ? `${e.author} — ` : ""}${e.title}`)));
      }
      // BIO-05 — editörde düzenlenebilen "Ek Bilgiler" (doluysa) zengin içerikli çakrada da raporlanır.
      const extra: [string, string | null][] = [
        [C("chakra.field.organs"), chakra.organs], [C("chakra.field.glands"), chakra.glands], [C("chakra.field.stones"), chakra.stones],
        [C("chakra.field.causes"), chakra.causes], [C("chakra.field.physical"), chakra.physical], [C("chakra.field.mental"), chakra.mental],
        [C("chakra.field.notes"), chakra.notes],
      ];
      const filled = extra.filter(([, v]) => (v ?? "").trim().length > 0);
      if (filled.length > 0) {
        all.push(h3(C("chakra.extra")));
        for (const [label, v] of filled) all.push(bodyText(`${label}: ${(v ?? "").trim()}`));
      }
    } else {
      // ── Legacy fallback: rich-block'suz eski kayıtlar (mevcut davranış korunur) ──
      if (chakra.organs?.trim())  { all.push(h3(C("chakra.field.organs")));   all.push(bodyText(chakra.organs.trim())); }
      if (chakra.glands?.trim())  { all.push(h3(C("chakra.field.glands")));   all.push(bodyText(chakra.glands.trim())); }
      if (chakra.stones?.trim())  { all.push(h3(C("chakra.field.stones")));   all.push(bodyText(chakra.stones.trim())); }
      if (chakra.causes?.trim())  { all.push(h3(C("chakra.field.causes")));   all.push(bodyText(chakra.causes.trim())); }
      if (chakra.physical?.trim()){ all.push(h3(C("chakra.field.physical"))); all.push(bodyText(chakra.physical.trim())); }
      if (chakra.mental?.trim())  { all.push(h3(C("chakra.field.mental")));   all.push(bodyText(chakra.mental.trim())); }
      if (chakra.notes?.trim())   { all.push(h3(C("chakra.field.notes")));    all.push(bodyText(chakra.notes.trim())); }
    }
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("biyoenerji", safeExpertName(guard.profile), B.common));

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, B.common));

  const doc = new Document({
    ...toc.documentOptions(),
    ...B.styles(),
    sections: [{
      properties: {},
      footers: { default: buildFooter(C("chakra.footer"), { note: "biyoenerji", common: B.common }) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  // USAGE360: rapor YALNIZ docx başarıyla üretildikten sonra sayılır (hata yanıtları olay değildir).
  await trackUsage(guard, request, {
    module: "energy_body",
    action: "report_generated",
    subEntity: "chakra",
    resourceId: exportMode === "single" && typeof chakraId === "string" ? chakraId : null,
    itemCount: chakras.length,
  });
  const filename = B.fileName("chakra", isSingle && chakras[0]?.name ? slugify(chakras[0].name) : null, exportMode, dateSlug);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
