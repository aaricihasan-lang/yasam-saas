/**
 * KAMPANYA MERKEZİ — Bütüncül Numeroloji ziyaretçi raporu (Word). YALNIZ SUNUCU; yerel motor, 0 sağlayıcı çağrısı, 0 DB.
 *
 * Mevcut uzman Word kurucusu (app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild) DEĞİŞTİRİLMEDEN, ekrandaki sonucu üreten
 * AYNI hesaplaNumeroloji çıktısıyla çağrılır. YALNIZ "Hesap Özeti" (plain) sekmesi: sayılar, PIN, çakra, elementler, değişim,
 * zirve, mücadele, harfler. Uzman Bilgi Bankası yorumları (summary / detailed), kitap kataloğu metinleri (zamanlama) ve
 * Taş Notlarım / stok (tas) sekmeleri HİÇBİR koşulda seçilmez; ortak veri boş verilir (kurucu DB okumaz).
 * Kronolojik bölümler uzman varsayılanıyla aynı (Türkiye takvim yılına kadar; "Gelecek Yıllar" yetkisi yok).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildNumerolojiWordChildren, packNumerolojiDocx, type WordSharedData } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import type { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { campaignFilename, rewriteDocxText, toReportFile, type ReportFile } from "./files";

assertServerOnly("lib/campaign/visitor/reports/numb");

const EMPTY_SHARED: WordSharedData = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
export const NUMB_SECTIONS = { summary: false, plain: true, detailed: false, zamanlama: false, tas: false } as const;
export const NUMB_DOCX_REWRITE: readonly (readonly [string, string])[] = [["Danışan", "Kişi"]];

export async function buildNumbAnalysisReport(i: {
  motor: ReturnType<typeof hesaplaNumeroloji>;
  firstName: string;
  lastName: string;
  birthTr: string;
  now: Date;
  dayTr: string;
}): Promise<ReportFile[]> {
  const row = {
    id: "kampanya",
    name: i.firstName,
    surname: i.lastName,
    birth_date: i.birthTr,
    analysis_data: { version: 1, motor: i.motor, calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } },
    created_at: i.now.toISOString(),
  };
  const built = buildNumerolojiWordChildren([row], { ...NUMB_SECTIONS }, EMPTY_SHARED, new Map(), null, i.now, false);
  if (!built.anyContent) return [];
  const docx = await packNumerolojiDocx(built.children, `${i.firstName} ${i.lastName}`.trim(), { expertName: null });
  const { buffer } = await rewriteDocxText(docx, NUMB_DOCX_REWRITE);
  return [toReportFile("docx", campaignFilename("butuncul-numeroloji", i.dayTr, "docx"), buffer, "Word raporu")];
}
