/**
 * NUMEROLOJİ — "Gelecek Yılları Göster" alt-yetkisi için SUNUCU TARAFI görüntüleme verisi (owner talimatı 25.10.2026).
 *
 * Alt-yetkisi OLMAYAN uzmana giden `analysis_data` yanıtından, İÇİNDE BULUNULAN YILDAN SONRA BAŞLAYAN
 * dönemlerin sonuçları ÇIKARILIR (yalnız ekranda gizlemek yerine). Kural, arayüzün (useChronoView +
 * chronoCutoff) ve Word'ün (numerologySavedSection) uyguladığı kuralla AYNIDIR:
 *   başlangıç yılı ≤ içinde bulunulan yıl → dönem TAM aralığıyla görünür; başlangıç > yıl → gizli.
 *
 * - Veritabanındaki kanonik kayıt DEĞİŞMEZ: kopya üzerinde çalışılır.
 * - Motor / hesaplar DEĞİŞMEZ; yalnız gönderilen görüntüleme kopyası daraltılır.
 * - Arayüzün türetme biçimi korunur (iki metotlu Zirve, Kitap 2 Mücadele biçim tespiti): görünmeyen tek
 *   metot yaşı / gelecekteki ana mücadele / gelecek harf segmentinin zamanlaması, gerçek değer yerine açıkça
 *   "gizli" yer tutucularla değiştirilir (REDACTED_* — gerçek bir sonuç değildir; arayüzün süzgeci bunları göstermez).
 * - Kronolojik ham metinler (Değişim, Zirve, Mücadele, Harfler) yalnız "Doğum Tarihi:" satırına indirilir
 *   (arayüz doğum tarihini bu satırdan okur; dönem listeleri yapısal veriden / doğum tarihinden üretilir).
 * - Doğum yılı çözülemezse (bozuk kayıt) kronolojik yapılar güvenli tarafta BOŞALTILIR (fail-closed).
 */
import { parseBirthDate } from "@/lib/numeroloji";
import { dogumTarihiFromOut } from "./chronoCutoff";

/** Yaşam süresi dışı yaş: "bu dönem gizli" yer tutucusu (birthYear + 999 > her sınır yılı). */
export const REDACTED_FUTURE_AGE = 999;
/** Gizli ana mücadele konusu yer tutucusu (geçerli konular 0–8). */
export const REDACTED_TOPIC = -1;
/** Gizli takvim yılı yer tutucusu (her sınır yılından büyük). */
export const REDACTED_FUTURE_YEAR = 9999;

const CHRONO_TEXT_KEYS = ["degisimDonusumMetni", "zirveYillariMetni", "mucadeleYillariMetni", "harflerinYankilanisiMetni"] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function birthLine(text: unknown): string {
  const m = String(text ?? "").match(/Doğum Tarihi:\s*[^\n\r]+/i);
  return m ? m[0].trim() : "";
}

function redactZirve(z: unknown, vis: (age: number) => boolean): unknown {
  if (!isObj(z) || !Array.isArray(z.peaks)) return z;
  const peaks = z.peaks as Obj[];
  const ikiMetot = peaks.every((p) => isObj(p) && num(p.yasMetot1) !== null && num(p.yasMetot2) !== null);
  let out: Obj[];
  if (ikiMetot) {
    out = peaks.flatMap((p) => {
      const v1 = vis(num(p.yasMetot1)!);
      const v2 = vis(num(p.yasMetot2)!);
      if (!v1 && !v2) return [];
      const q: Obj = { ...p };
      if (!v1) q.yasMetot1 = REDACTED_FUTURE_AGE;
      if (!v2) q.yasMetot2 = REDACTED_FUTURE_AGE;
      const a = num(p.age);
      if (a !== null && !vis(a)) q.age = REDACTED_FUTURE_AGE;
      return [q];
    });
  } else {
    out = peaks.filter((p) => isObj(p) && num(p.age) !== null && vis(num(p.age)!));
  }
  return { ...z, peaks: out };
}

function redactMucadele(m: unknown, vis: (age: number) => boolean): unknown {
  if (!isObj(m)) return m;
  const items = (Array.isArray(m.method1) ? (m.method1 as Obj[]) : []).filter(isObj);
  const isOnceki = "method2" in m || num(m.anaMucadele) === null;
  if (isOnceki) {
    const byAge = (arr: unknown) => (Array.isArray(arr) ? (arr as Obj[]).filter((it) => isObj(it) && num(it.cutoffAge ?? it.age) !== null && vis(num(it.cutoffAge ?? it.age)!)) : arr);
    return { ...m, method1: byAge(items), ...("method2" in m ? { method2: byAge(m.method2) } : {}) };
  }
  // Kitap 2: dönem BAŞLANGICI = kendi startAge'i ya da bir önceki geçiş sınırı (mucadeleDonemleri ile aynı türetme).
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => (num(a.it.index) ?? a.i) - (num(b.it.index) ?? b.i));
  const keep = new Set<Obj>();
  sorted.forEach(({ it }, i) => {
    const prev = i > 0 ? sorted[i - 1]!.it : null;
    const start = num(it.startAge) ?? (i === 0 ? 0 : num(prev!.cutoffAge) ?? num(prev!.age) ?? 0);
    if (vis(start)) keep.add(it);
  });
  const last = sorted.length ? sorted[sorted.length - 1]!.it : null;
  const anaStart = num(m.anaMucadeleBaslangicYasi) ?? (last ? num(last.cutoffAge) ?? num(last.age) : null);
  const anaVisible = anaStart !== null && vis(anaStart);
  return {
    ...m,
    method1: items.filter((it) => keep.has(it)),
    ...(anaVisible
      ? { anaMucadeleBaslangicYasi: anaStart }
      : { anaMucadele: REDACTED_TOPIC, anaMucadeleBaslangicYasi: REDACTED_FUTURE_AGE }),
  };
}

// Harf segmentleri isim harflerine SIRAYLA eşlenir (görsel rapor harf kartları, harf → segment): dizi kısaltılırsa
// eşleme kayar. Bu yüzden gelecekte başlayan segment yerinde kalır; yalnız ZAMANLAMASI (yaş / yıl) gizli yer
// tutucuya çevrilir. Harf ve çakra isimden türeyen sabit eşlemedir (gelecek sonucu değildir).
function redactHarf(segs: unknown, birthYear: number, limitYear: number): unknown {
  if (!Array.isArray(segs)) return segs;
  return (segs as unknown[]).flatMap((s) => {
    if (!isObj(s)) return [];
    const ys = num(s.yearStart) ?? (num(s.ageStart) !== null ? birthYear + num(s.ageStart)! : null);
    if (ys !== null && ys <= limitYear) return [s];
    return [{ ...s, ageStart: REDACTED_FUTURE_AGE, ageEnd: REDACTED_FUTURE_AGE, yearStart: REDACTED_FUTURE_YEAR, yearEnd: REDACTED_FUTURE_YEAR }];
  });
}

/**
 * `analysis_data` görüntüleme kopyası. futureYears=true → GİRDİ AYNEN döner (tam analiz).
 * `birthDate`: kayıt doğum tarihi (motor metinlerinde bulunamazsa yedek).
 */
export function redactAnalysisDataForFutureYears(
  analysisData: unknown,
  opts: { futureYears: boolean; currentYear: number; birthDate?: string | null },
): unknown {
  if (opts.futureYears === true || !isObj(analysisData) || !isObj(analysisData.motor)) return analysisData;
  const motor = analysisData.motor;
  const bd = dogumTarihiFromOut(motor as never) ?? (opts.birthDate ? String(opts.birthDate) : null);
  const birthYear = bd ? parseBirthDate(bd.replace(/\//g, ".").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2.$1"))?.year ?? null : null;
  const limitYear = opts.currentYear;
  const out: Obj = { ...motor };

  if (birthYear === null) {
    // Zaman ekseni kurulamıyor → gelecek/geçmiş ayrımı yapılamaz: kronolojik yapılar gönderilmez.
    if (isObj(out.zirveYillari)) out.zirveYillari = { ...(out.zirveYillari as Obj), peaks: [] };
    if (isObj(out.mucadeleYillari)) out.mucadeleYillari = { ...(out.mucadeleYillari as Obj), method1: [], anaMucadele: REDACTED_TOPIC, anaMucadeleBaslangicYasi: REDACTED_FUTURE_AGE };
    if (Array.isArray(out.harflerinYankilanisi)) out.harflerinYankilanisi = [];
    for (const k of CHRONO_TEXT_KEYS) if (k in out) out[k] = "";
  } else {
    const vis = (age: number) => birthYear + age <= limitYear;
    if ("zirveYillari" in out) out.zirveYillari = redactZirve(out.zirveYillari, vis);
    if ("mucadeleYillari" in out) out.mucadeleYillari = redactMucadele(out.mucadeleYillari, vis);
    if ("harflerinYankilanisi" in out) out.harflerinYankilanisi = redactHarf(out.harflerinYankilanisi, birthYear, limitYear);
    for (const k of CHRONO_TEXT_KEYS) if (k in out) out[k] = birthLine(out[k]);
  }
  return { ...analysisData, motor: out, futureYearsView: { restricted: true, limitYear } };
}
