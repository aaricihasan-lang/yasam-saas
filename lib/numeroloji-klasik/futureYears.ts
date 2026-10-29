/**
 * Klasik Numeroloji — "Gelecek Yılları Göster" alt-yetkisi (NK-R3; SAF, istemci ve sunucu güvenli).
 *
 * Yetki kararı Mevcut Numeroloji ile AYNI kaynaktan gelir (`canSeeNumerologyFutureYears(profile)` —
 * `module_permissions.numerology_future_years`; sunucu doğrulanmış profil ile çağırır). Kural da Mevcut modülün
 * görüntüleme süzgeciyle (app/numeroloji/utils/futureYearsRedaction.ts) AYNIDIR:
 *   dönemin başlangıç yılı (doğum yılı + başlangıç yaşı) ≤ içinde bulunulan yıl (Europe/Istanbul) → dönem TAM görünür;
 *   başlangıç yılı > içinde bulunulan yıl → dönem yetkisiz uzmana GÖNDERİLMEZ.
 * Klasik ekole özgü ek kural: hedef tarihi içinde bulunulan yıldan SONRAKİ bir yıla düşen zamanlama sonuçları
 * (kişisel yıl / ay / gün, Günün Sayısı) yetkisiz uzmana gönderilmez; yetkisiz uzman böyle bir hedef tarihle yeni
 * hesap da başlatamaz (sağlayıcı kredisi harcanmadan 403).
 *
 * - Veritabanındaki kayıt DEĞİŞMEZ: yalnız uzmana giden kopya (API yanıtı, Word, PNG, karşılaştırma) daraltılır.
 * - Doğum yılı çözülemezse kronolojik yapılar güvenli tarafta BOŞALTILIR (fail-closed).
 * - Daraltılmış kopya `futureYearsView: { restricted: true, limitYear, hidden }` taşır (ekran "gizlendi" notu için).
 */

export type FutureYearsOpts = { futureYears: boolean; currentYear: number };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Kayıt girdisinden doğum yılı (kişi analizi; yoksa null). */
export function birthYearOf(input: unknown): number | null {
  const b = isObj(input) && isObj(input.birth) ? input.birth : null;
  const y = b ? num(b.year) : null;
  return y !== null && y >= 1000 && y <= 9999 ? y : null;
}

/** YYYY-MM-DD → yıl (yoksa null). */
export function yearOfIso(iso: unknown): number | null {
  const m = typeof iso === "string" ? /^(\d{4})-\d{2}-\d{2}/.exec(iso) : null;
  return m ? Number(m[1]) : null;
}

/** Yetkisiz uzman bu hedef tarihle hesap başlatabilir mi? (hedef yoksa = bugün → izinli) */
export function targetAllowed(targetDate: string | null | undefined, opts: FutureYearsOpts): boolean {
  if (opts.futureYears) return true;
  const y = yearOfIso(targetDate ?? null);
  return y === null || y <= opts.currentYear;
}

function periods(list: unknown, birthYear: number | null, limitYear: number): { kept: unknown[]; hidden: number } {
  if (!Array.isArray(list)) return { kept: [], hidden: 0 };
  if (birthYear === null) return { kept: [], hidden: list.length };
  const kept = list.filter((p) => {
    const s = isObj(p) ? num(p.startAge) : null;
    return s !== null && birthYear + s <= limitYear;
  });
  return { kept, hidden: list.length - kept.length };
}

export type FutureYearsHidden = { pinnacles: number; challenges: number; timing: string[] };

/**
 * Kayıtlı Klasik analiz `result` nesnesinin görüntüleme kopyası. futureYears=true → GİRDİ AYNEN döner.
 * `referenceDate`: kaydın hedef tarihi (provider_meta.reference_date / input.targetDate).
 */
export function redactClassicResultForFutureYears(
  result: unknown,
  ctx: { input: unknown; referenceDate: string | null },
  opts: FutureYearsOpts,
): unknown {
  if (opts.futureYears === true || !isObj(result)) return result;
  const limitYear = opts.currentYear;
  const birthYear = birthYearOf(ctx.input);
  const refYear = yearOfIso(ctx.referenceDate) ?? (isObj(ctx.input) ? yearOfIso(ctx.input.targetDate) : null);
  const futureRef = refYear !== null && refYear > limitYear;
  const out: Obj = { ...result };
  const hidden: FutureYearsHidden = { pinnacles: 0, challenges: 0, timing: [] };

  if (isObj(out.chart)) {
    const chart: Obj = { ...out.chart };
    const p = periods(chart.pinnacles, birthYear, limitYear);
    const c = periods(chart.challenges, birthYear, limitYear);
    if ("pinnacles" in chart) chart.pinnacles = p.kept;
    if ("challenges" in chart) chart.challenges = c.kept;
    hidden.pinnacles = p.hidden;
    hidden.challenges = c.hidden;
    if (futureRef && "personalYear" in chart) {
      delete chart.personalYear;
      hidden.timing.push("personal_year");
    }
    out.chart = chart;
  }
  if (futureRef) {
    for (const k of ["personal_day", "daily"] as const) {
      if (k in out) {
        delete out[k];
        hidden.timing.push(k);
      }
    }
  }
  const any = hidden.pinnacles + hidden.challenges + hidden.timing.length > 0;
  return any ? { ...out, futureYearsView: { restricted: true, limitYear, hidden } } : out;
}
