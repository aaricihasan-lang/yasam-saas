import { turkishUpperDisplay, type HarfYankilanisiSegment } from "@/lib/numeroloji";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { NUMEROLOJI_METHODOLOGY_VERSION, birthDateForEngine } from "@/lib/numeroloji/methodology";
import type { NumerolojiMotorOut } from "./numerolojiPlainMetin";

export type GorselTemaIdKayit = "kozmikMor" | "altinMist" | "kuzeyIsiklari" | "okyanusDerinligi";

export type AnalysisDataPayload = {
  version: 1;
  motor: NumerolojiMotorOut;
  summary: string;
  tas?: AnalysisTasData;
  gorsel?: AnalysisGorselData;
};

export type AnalysisTasData = {
  bileklik?: string;
  kolye?: string;
  kutle?: string;
  notlar?: string;
};

export type AnalysisGorselData = {
  temaId?: GorselTemaIdKayit;
  uzmanAdi?: string;
  gorselTaslariGoster?: boolean;
  tasBileklik?: string;
  tasKolye?: string;
  tasKutle?: string;
};

const KAYIT_BOLUM_YOK = "Bu bölüm bu kayıtta bulunmuyor.";

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Bir NumerolojiResult benzeri alanın en az `display` içerip içermediğini doğrular. */
function hasResultShape(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) && "display" in (v as Record<string, unknown>);
}

/**
 * Motor nesnesinin çekirdek alanlarının (anaKulvar/yanKulvar/ifadeSayisi/hayatYolu)
 * beklenen şekilde olup olmadığını kontrol eder. Eksik/bozuk kayıtlar UI'ı çökertmesin.
 */
export function isValidMotorShape(motor: unknown): boolean {
  const m = asRecord(motor);
  if (!m) return false;
  return (
    hasResultShape(m.anaKulvar) &&
    hasResultShape(m.yanKulvar) &&
    hasResultShape(m.ifadeSayisi) &&
    hasResultShape(m.hayatYolu)
  );
}

// TÜRKÇE KARAKTER BÜTÜNLÜĞÜ (display-only): Harflerin Yankılanışı segmentlerinin GÖSTERİLEN
// `letter`'ı, kaydın KORUNMUŞ orijinal isim/soyisminden (row.name/surname) yeniden türetilir.
// Neden: eski snapshot'lar harfi CANONICAL turkishUpper (İ→I) ile saklamış olabilir; orijinal
// isim korunduğu için TAHMİN DEĞİL, birebir yeniden türetmedir. Snapshot/DB MUTATE EDİLMEZ
// (kopya döner); canonical çakra/yaş/yıl DEĞİŞMEZ — segment sırası motor ile birebir olduğundan
// segment[i] ↔ isim harfi (i mod L). İsim yoksa segmentler olduğu gibi kalır.
function displayHarfSeq(firstName?: string, lastName?: string): string[] {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (!full) return [];
  return Array.from(turkishUpperDisplay(full)).filter((ch) => /[A-ZÇĞİÖŞÜ]/.test(ch));
}

function remapHarfDisplayLetters(motor: NumerolojiMotorOut, firstName?: string, lastName?: string): NumerolojiMotorOut {
  const seq = displayHarfSeq(firstName, lastName);
  const segs = motor.harflerinYankilanisi;
  if (!seq.length || !Array.isArray(segs) || !segs.length) return motor;
  const remapped = (segs as HarfYankilanisiSegment[]).map((s, i) => ({ ...s, letter: seq[i % seq.length] }));
  return { ...motor, harflerinYankilanisi: remapped };
}

/**
 * Supabase `analysis_data` alanından motor çıktısını okur.
 * Şekli doğrulanamayan (eski/bozuk) kayıtlarda null döner — çağıran taraf
 * "kayıt okunamadı" durumunu gösterir; asla çökmez.
 *
 * `firstName`/`lastName` verilirse Harflerin Yankılanışı GÖSTERİM harfleri orijinal isimden
 * yeniden türetilir (Türkçe karakter bütünlüğü; canonical DEĞİŞMEZ).
 */
export function extractMotorFromAnalysisJson(raw: unknown, firstName?: string, lastName?: string): NumerolojiMotorOut | null {
  const o = asRecord(raw);
  if (!o) return null;
  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) return null;
  const ver = o.version;
  if (ver !== undefined && ver !== 1) return null;
  if (!isValidMotorShape(motor)) return null;
  return remapHarfDisplayLetters(motor as NumerolojiMotorOut, firstName, lastName);
}

/** Kaydın metodoloji damgası (yoksa null → eski kayıt). */
export function recordMethodologyStamp(raw: unknown): string | null {
  const calc = asRecord(asRecord(raw)?.calc);
  return typeof calc?.methodology === "string" ? calc.methodology : null;
}

export type ResolvedRecordMotor = {
  /** Kayıtlı snapshot (Model C: her zaman kaydedildiği hali; okunamazsa null). */
  motor: NumerolojiMotorOut | null;
  /** true → kayıt önceki hesaplama metodolojisiyle oluşturulmuş (damga yok/eski). */
  legacy: boolean;
  /** Bu kayıt başka bir kayıttan "Güncel yöntemle yeniden hesapla" ile üretildiyse kaynak id. */
  recalculatedFrom: string | null;
};

/** Kayıt "Güncel yöntemle yeniden hesapla" ile üretildiyse kaynak kayıt id'si. */
export function recordRecalculatedFrom(raw: unknown): string | null {
  const calc = asRecord(asRecord(raw)?.calc);
  return typeof calc?.recalculatedFrom === "string" ? calc.recalculatedFrom : null;
}

/**
 * ESKİ KAYIT POLİTİKASI — MODEL C (nihai kullanıcı kararı, 2026-10-03). UI + Word + toplu Word TEK KAYNAK.
 *
 * - Kayıt HER ZAMAN kaydedildiği gün üretilen snapshot ile gösterilir; motor açılışta rakamları
 *   sessizce değiştirmez (önceki PR'daki "güncel yöntemle yeniden hesaplayıp göster" — Model B — KALDIRILDI).
 * - Damgası güncel metodolojiye eşit olmayan kayıt `legacy: true` döner; çağıran yalnız
 *   bilgilendirme notu (LEGACY_METHOD_NOTE) ve "Güncel yöntemle yeniden hesapla" aksiyonu gösterir.
 * - Snapshot okunamıyorsa motor null döner (asla çökmez, asla sessiz yeniden hesap yok).
 */
export function resolveRecordMotor(row: {
  name?: string | null;
  surname?: string | null;
  birth_date?: string | null;
  analysis_data?: unknown;
}): ResolvedRecordMotor {
  const snapshot = extractMotorFromAnalysisJson(row.analysis_data, row.name ?? undefined, row.surname ?? undefined);
  return {
    motor: snapshot,
    legacy: recordMethodologyStamp(row.analysis_data) !== NUMEROLOJI_METHODOLOGY_VERSION,
    recalculatedFrom: recordRecalculatedFrom(row.analysis_data),
  };
}

/** Önceki metodoloji bilgilendirme metni (UI + Word aynı cümle). */
export const LEGACY_METHOD_NOTE = "Bu analiz önceki hesaplama metodolojisiyle oluşturulmuştur.";

/**
 * "Güncel yöntemle yeniden hesapla" için YENİ kayıt gövdesi. Orijinal kayda dokunmaz;
 * ad/soyad/doğum tarihi kayıttaki haliyle kullanılır, sonuç güncel motordan üretilir.
 * Sunucu `recalculatedFrom`u aynı tenant'taki kaynak kayda karşı doğrulayıp `calc` içine yazar.
 */
export function buildRecalculatedRecordBody(
  row: { id: string; name: string; surname: string; birth_date: string; analysis_data?: unknown },
  buildSummary: (motor: NumerolojiMotorOut) => string,
): { name: string; surname: string; birth_date: string; analysis_data: AnalysisDataPayload & { recalculatedFrom: string } } | null {
  const fn = String(row.name ?? "").trim();
  const ln = String(row.surname ?? "").trim();
  const bd = String(row.birth_date ?? "").trim();
  if (!fn || !ln || !bd) return null;
  let motor: NumerolojiMotorOut;
  try {
    motor = hesaplaNumeroloji({ firstName: fn, lastName: ln, birthDate: birthDateForEngine(bd) }) as unknown as NumerolojiMotorOut;
  } catch {
    return null;
  }
  if (!isValidMotorShape(motor) || (motor.hayatYolu as { display?: string }).display === "-") return null;
  const payload: AnalysisDataPayload & { recalculatedFrom: string } = {
    version: 1,
    motor,
    summary: buildSummary(motor),
    recalculatedFrom: row.id,
  };
  // Taş seçimleri ve görsel rapor ayarları kullanıcı girdisidir (hesap değildir) → yeni kayda taşınır.
  const tas = extractTasFromAnalysisData(row.analysis_data);
  if (tas) payload.tas = tas;
  const gorsel = extractGorselFromAnalysisData(row.analysis_data);
  if (gorsel) payload.gorsel = gorsel;
  return { name: fn, surname: ln, birth_date: bd, analysis_data: payload };
}

export function extractSummaryFromAnalysisData(raw: unknown): string | null {
  const o = asRecord(raw);
  if (!o) return null;
  const s = o.summary;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}

export function extractTasFromAnalysisData(raw: unknown): AnalysisTasData | null {
  const o = asRecord(raw);
  if (!o) return null;
  const tas = o.tas;
  if (!tas || typeof tas !== "object" || Array.isArray(tas)) return null;
  const t = tas as Record<string, unknown>;
  const out: AnalysisTasData = {};
  if (typeof t.bileklik === "string" && t.bileklik.trim()) out.bileklik = t.bileklik.trim();
  if (typeof t.kolye === "string" && t.kolye.trim()) out.kolye = t.kolye.trim();
  if (typeof t.kutle === "string" && t.kutle.trim()) out.kutle = t.kutle.trim();
  if (typeof t.notlar === "string" && t.notlar.trim()) out.notlar = t.notlar.trim();
  return Object.keys(out).length > 0 ? out : null;
}

export function extractGorselFromAnalysisData(raw: unknown): AnalysisGorselData | null {
  const o = asRecord(raw);
  if (!o) return null;
  const gorsel = o.gorsel;
  if (!gorsel || typeof gorsel !== "object" || Array.isArray(gorsel)) return null;
  const g = gorsel as Record<string, unknown>;
  const out: AnalysisGorselData = {};
  if (typeof g.temaId === "string") out.temaId = g.temaId as GorselTemaIdKayit;
  if (typeof g.uzmanAdi === "string") out.uzmanAdi = g.uzmanAdi;
  if (typeof g.gorselTaslariGoster === "boolean") out.gorselTaslariGoster = g.gorselTaslariGoster;
  if (typeof g.tasBileklik === "string") out.tasBileklik = g.tasBileklik;
  if (typeof g.tasKolye === "string") out.tasKolye = g.tasKolye;
  if (typeof g.tasKutle === "string") out.tasKutle = g.tasKutle;
  return Object.keys(out).length > 0 ? out : null;
}

export function kayitBolumYokMesaji(): string {
  return KAYIT_BOLUM_YOK;
}

/** Virgülle ayrılmış taş listesinde her parçanın ilk harfini Türkçe büyük yapar. */
export function formatVirgulluTasGirdi(value: string): string {
  if (!value) return value;
  return value
    .split(",")
    .map((part) => {
      const lead = part.match(/^\s*/)?.[0] ?? "";
      const body = part.trim();
      if (!body) return part;
      const first = body.charAt(0).toLocaleUpperCase("tr-TR");
      const rest = body.slice(1);
      return `${lead}${first}${rest}`;
    })
    .join(",");
}

export function mergeGorselIntoAnalysisData(
  raw: unknown,
  gorsel: AnalysisGorselData,
): AnalysisDataPayload | null {
  const o = asRecord(raw);
  if (!o) return null;
  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) return null;
  const summary = typeof o.summary === "string" ? o.summary : "";
  const payload: AnalysisDataPayload = {
    version: 1,
    motor: motor as NumerolojiMotorOut,
    summary,
    gorsel,
  };
  const tas = extractTasFromAnalysisData(raw);
  if (tas) payload.tas = tas;
  return payload;
}
