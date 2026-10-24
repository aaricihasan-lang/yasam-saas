// 2026-10-24 — Dashakoot Rasi TUTARLILIK UYARISI (SAF; istemci de import edebilir). Yalnız GÖSTERİM: kayıtlı / canlı teknik
// veriden türetilir; puan, toplam, kısıt ve servis değerlendirmesi DEĞİŞTİRİLMEZ (sessiz düzeltme yok).
//
// Kanıt (QA 54-dashakoot + 58-dashakoot-paket; 44 gerçek yanıt, sentetik kişiler): hesaplama servisinin belgelediği ve satır
// notunda kendisinin yazdığı kural, Rasi kriterinde gelinden (2. rol) damada (1. rol) 6., 8. ve 12. sayımları karşılanmamış
// sayar. Buna karşın servis bazı sayım-6 çiftlerinde satırı "karşılandı · 1" bildirir (44 yanıtın 8'i). Uyarı YALNIZ bu
// kanıtlanmış çelişki koşulunda görünür: Rasi satırı karşılandı · 1 VE sayım ∈ {6, 8, 12}.
// Karar duyarlılığı (ölçülen servis eşiği: kesin kısıt yoksa toplam ≥ 5 → önerilir, < 5 → sınırda) yalnız kısıtlar etkin
// değilken ve toplam TAM 5 iken yazılır; metin hüküm etiketi taşımaz (teknik katman kuralı), yalnız koşullu ifade kullanır.

import { SIGN_IDS, type SignId } from "./western";
import { countFrom } from "./vedicPorutham";

const RASI_RULE_COUNTS: ReadonlySet<number> = new Set([6, 8, 12]);
const SERVICE_THRESHOLD = 5;

export type DashakootRasiNotice = {
  /** Gelinin (2. rol) Ay burcundan damadınkine (1. rol) dahil sayım (6, 8 veya 12). */
  count: number;
  /** Servisin bildirdiği karşılanan kriter sayısı (DEĞİŞTİRİLMEZ). */
  total: number;
  /** Rasi satırı yöntem kuralına göre karşılanmamış sayılsaydı karşılanan kriter sayısı (yalnız koşullu gösterim). */
  totalUnderRule: number;
  /** Kesin kısıt (Rajju / Vedha) etkin değil ve toplam tam eşikte → genel değerlendirme bu satıra duyarlı. */
  decisionSensitive: boolean;
};

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const signOf = (c: unknown): SignId | null => {
  const raw = isObj(c) ? c.raw : null;
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
};

/**
 * Kayıtlı / canlı Dashakoot teknik verisinden uyarı koşulunu türetir. Veri eksik ya da tanınmıyorsa null (uyarı YOK).
 * Sayım satırdaki `count`tan okunur; eski kayıtta yoksa iki burç sınıflamasından türetilir (yeni hesap değildir).
 */
export function dashakootRasiNotice(t: unknown): DashakootRasiNotice | null {
  if (!isObj(t) || !Array.isArray(t.rows)) return null;
  const total = t.total;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1 || total > 10) return null;
  const row = (t.rows as unknown[]).find((r): r is O => isObj(r) && r.id === "rasi");
  if (!row || row.matched !== true || row.points !== 1) return null;
  let count = typeof row.count === "number" && Number.isInteger(row.count) ? row.count : null;
  if (count === null) {
    const s1 = signOf(row.person1), s2 = signOf(row.person2);
    if (!s1 || !s2) return null;
    count = countFrom(SIGN_IDS.indexOf(s2), SIGN_IDS.indexOf(s1), 12);
  }
  if (!RASI_RULE_COUNTS.has(count)) return null;
  const rj = isObj(t.rajju) ? t.rajju.active : undefined;
  const vd = isObj(t.vedha) ? t.vedha.active : undefined;
  const noConstraint = rj === false && vd === false;
  return { count, total, totalUnderRule: total - 1, decisionSensitive: noConstraint && total === SERVICE_THRESHOLD };
}

export const DASHAKOOT_RASI_BADGE = "tutarlılık uyarısı";
export const DASHAKOOT_RASI_NOTICE_TITLE = "Rasi kriteri — tutarlılık uyarısı";

/** Ekran ve Word/PDF ortak metinleri (tek kaynak). */
export function dashakootRasiNoticeTexts(n: DashakootRasiNotice): { row: string; total: string; decision: string | null } {
  return {
    row: `Bu satırda 2. rolün (geleneksel: gelin) Ay burcundan 1. rolün (geleneksel: damat) Ay burcuna sayım ${n.count} çıkıyor. Bu hesaplamanın yöntem kuralına göre 6., 8. ve 12. sayımlar karşılanmamış kabul edilir; buna karşın hesaplama servisi bu satırı karşılandı olarak bildirmiştir. Gösterilen puan ve toplam değiştirilmemiştir. Bu satır uzman tarafından ayrıca değerlendirilmelidir.`,
    total: `Rasi satırı yöntem kuralına göre karşılanmamış sayılırsa karşılanan kriter sayısı ${n.totalUnderRule} / 10 olur.`,
    decision: n.decisionSensitive
      ? `Kesin kısıt (Rajju / Vedha) etkin değil ve toplam ${n.total}; servisin genel değerlendirme eşiği ${n.total} ile ${n.totalUnderRule} arasında gözlendiğinden yorum bölümündeki genel değerlendirme bu satıra duyarlıdır ve kesin kabul edilmemelidir.`
      : null,
  };
}
