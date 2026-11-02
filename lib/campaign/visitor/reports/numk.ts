/**
 * KAMPANYA MERKEZİ — Klasik Numeroloji ziyaretçi raporu (Word + görsel PNG). YALNIZ SUNUCU; 0 sağlayıcı çağrısı, 0 DB.
 *
 * Mevcut uzman kurucuları (lib/numeroloji-klasik/report/{docx,png}) DEĞİŞTİRİLMEDEN, ekrandaki sonucu üreten AYNI normalize
 * hesap sonucundan çağrılır. İki rapor politikası:
 *   - Yorum AÇIK  (Owner modül + teknik): sağlayıcının genel anlam metinleri dahil (ekranla aynı izin).
 *   - Yorum KAPALI: `stripClassicInterpretations` hesap değerlerini (sayı, yöntem, doğrulama, hesap izi, dönem yaşları) KORUR;
 *     anlam / açıklama / tema / öneri / anahtar kelime / güçlü-zorlayıcı yön metinlerini çıkarır. Kurucular boş metni yazmaz.
 * Her iki politikada da: taş önerisi ("stones") ve uğurlu eşleşmeler ("lucky": taş / renk listesi) rapora GİRMEZ; uzman adı
 * yok; sağlayıcı adı / provider_meta yok (kurucu zaten almaz).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildBusinessReport, buildNamesReport, buildPersonReport, buildRelationshipReport } from "@/lib/numeroloji-klasik/report/docx";
import { renderClassicPng } from "@/lib/numeroloji-klasik/report/png";
import { PERSON_REPORT_GROUPS, type ClassicReportRecord, type PersonReportGroup } from "@/lib/numeroloji-klasik/report/types";
import { CLASSIC_METHODOLOGY_VERSION } from "@/lib/numeroloji-klasik/server/service";
import { CLASSIC_PROVIDER_SPEC_VERSION } from "@/lib/numeroloji-klasik/endpoints";
import type { ClassicAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import { campaignFilename, rewriteDocxText, toReportFile, type ReportFile } from "./files";

assertServerOnly("lib/campaign/visitor/reports/numk");

/** Yorum metni taşıyan alan adları (normalize model: lib/numeroloji-klasik/model.ts). */
const INTERP_KEYS = new Set([
  "meaning", "compoundMeaning", "description", "summary", "forecast", "advice", "guidance", "theme", "focus", "message", "dailyMessage",
  "note", "strengths", "challenges", "opportunities", "keywords", "lesson", "howToOvercome", "challenge", "resolution", "career",
  "relationships", "spirituality", "industries", "title", "personalMonthTheme", "personalYearTheme", "cycle",
]);
/** Her politikada çıkarılan alanlar (taş / renk eşleşmeleri — kampanyada taş önerisi YASAK). */
const ALWAYS_DROP = new Set(["luckyAssociations"]);
/** Kampanya raporlarında kişi raporu bölümleri: taş ve uğurlu eşleşmeler hariç. */
export const CAMPAIGN_PERSON_GROUPS: readonly PersonReportGroup[] = PERSON_REPORT_GROUPS.filter((g) => g !== "stones" && g !== "lucky");

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function walk(v: unknown, strip: boolean): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, strip));
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (ALWAYS_DROP.has(k)) {
      out[k] = null;
      continue;
    }
    if (k === "verification") {
      out[k] = x; // bağımsız kontrol sonucu hesap verisidir
      continue;
    }
    if (strip && INTERP_KEYS.has(k)) {
      if (typeof x === "string") out[k] = "";
      else if (Array.isArray(x) && x.every((y) => typeof y === "string")) out[k] = [];
      else if (isObj(x)) out[k] = null;
      else out[k] = walk(x, strip); // nesne dizisi (ör. zirve/mücadele dönemleri) → içi temizlenir, sayılar kalır
      continue;
    }
    out[k] = walk(x, strip);
  }
  return out;
}

/** Yorum kapalı politika: hesap değerleri kalır, yorum metinleri çıkar (girdi değişmez; derin kopya). */
export function stripClassicInterpretations(result: Record<string, unknown>): Record<string, unknown> {
  return walk(result, true) as Record<string, unknown>;
}
/** Yorum açık politika: yalnız taş / uğurlu eşleşmeler çıkar. */
export function publicClassicResult(result: Record<string, unknown>): Record<string, unknown> {
  return walk(result, false) as Record<string, unknown>;
}

/** Uzman kurucusunun kayıt-merkezli sabit metinleri → kampanya dili (yalnız tam metin düğümleri). */
export const NUMK_DOCX_REWRITE: readonly (readonly [string, string])[] = [
  ["Danışan", "Kişi"],
  [
    "Rapor yalnız kayıtlı analizden üretilir; rapor oluşturulurken yeni hesap yapılmaz. Sayılar ayrıca bağımsız bir hesapla karşılaştırılır ve sonuç her sayının yanında “Doğrulama” olarak belirtilir (teknik ve tam raporda).",
    "Rapor, ücretsiz analizde ekranda gösterilen hesap sonucundan aynı anda üretilmiştir; rapor için ayrıca hesap yapılmamış ve kayıt oluşturulmamıştır. Sayılar ayrıca bağımsız bir hesapla karşılaştırılır ve sonuç her sayının yanında “Doğrulama” olarak belirtilir.",
  ],
];

export type NumkReportInput = {
  req: ClassicAnalysisRequest;
  title: string;
  result: Record<string, unknown>;
  status: "complete" | "partial";
  referenceDate: string | null;
  commentsEnabled: boolean;
  now: Date;
  dayTr: string;
};

/** Word (+ kişi analizinde harita ya da Kalde varsa görsel PNG). Hata → boş liste (çağıran ekrana not düşer). */
export async function buildNumkReports(i: NumkReportInput): Promise<ReportFile[]> {
  const shown = i.commentsEnabled ? publicClassicResult(i.result) : stripClassicInterpretations(i.result);
  const record: ClassicReportRecord = {
    id: null,
    kind: i.req.kind,
    title: i.title,
    input: i.req.input,
    techniques: [...i.req.techniques],
    status: i.status,
    result: shown,
    methodologyVersion: CLASSIC_METHODOLOGY_VERSION,
    apiSchemaVersion: CLASSIC_PROVIDER_SPEC_VERSION,
    referenceDate: i.referenceDate,
    createdAt: i.now.toISOString(),
    failed: [],
  };
  const common = { generatedAt: i.now, expertName: null };
  let docx: Buffer;
  switch (i.req.kind) {
    case "person":
      docx = await buildPersonReport(record, { ...common, variant: "technical", include: [...CAMPAIGN_PERSON_GROUPS] });
      break;
    case "relationship":
      docx = await buildRelationshipReport(record, common);
      break;
    case "business":
      docx = await buildBusinessReport(record, common);
      break;
    case "names":
      docx = await buildNamesReport(record, { ...common, variant: "technical" });
      break;
    default:
      return [];
  }
  const stem = `numeroloji-${i.req.kind === "person" ? "kisi" : i.req.kind === "relationship" ? "uyum" : i.req.kind === "business" ? "isletme" : "isimler"}`;
  const { buffer } = await rewriteDocxText(docx, NUMK_DOCX_REWRITE);
  const files: ReportFile[] = [toReportFile("docx", campaignFilename(stem, i.dayTr, "docx"), buffer, "Word raporu")];
  if (i.req.kind === "person") {
    const png = renderClassicPng(record, { generatedAt: i.now, expertName: null });
    if (png.ok) files.push(toReportFile("png", campaignFilename(`${stem}-gorsel`, i.dayTr, "png"), png.png, "Görsel rapor (PNG)"));
  }
  return files;
}
