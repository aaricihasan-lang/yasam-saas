// Astroloji — Relocation otomatik yorumu ↔ kayıtlı Yükselen / Tepe Noktası burcu tutarlılığı (SAF; ekran + Word + PDF ortak).
//
// Kök neden (2026-11-28 canlı kabul): sağlayıcının relocation özet cümlesi sabit kalıptır —
//   "Yükselen <burç> burcuna, Tepe Noktası ise <burç> burcuna geçer"
// — ve burç DEĞİŞMESE de "geçer" der (ör. natal Yükselen Terazi, relocation Yükselen yine Terazi). Kayıtlı açı/burç
// verisi doğrudur; yalnız cümle yanlış anlatır.
//
// Çözüm (localSpaceCenter.ts ile aynı ilke): kayıtlı snapshot DEĞİŞMEZ. Yalnız sunumda, kayıtlı natal ↔ relocation
// burçlarına göre en az biri DEĞİŞMEMİŞSE ve kalıp birebir (aynı burç adlarıyla) eşleşiyorsa cümle doğru ifadeyle gösterilir
// ve bunu AÇIKÇA söyleyen ayrı bir not eklenir. İki burç da değiştiyse sağlayıcı metni AYNEN kalır.

import { SIGN_LABELS } from "./labels/tr";
import { SIGN_IDS, type SignId } from "./model/western";

export type RelocationAngleSigns = { natalAsc: SignId; relAsc: SignId; natalMc: SignId; relMc: SignId };

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const signOf = (v: unknown): SignId | null => (isObj(v) && typeof v.sign === "string" && (SIGN_IDS as readonly string[]).includes(v.sign) ? (v.sign as SignId) : null);

/** Kayıtlı teknik katmandan natal ve relocation ASC/MC burçları; natal karşılaştırma birimi yoksa null (metin aynen kalır). */
export function relocationAngleSigns(technical: unknown): RelocationAngleSigns | null {
  if (!isObj(technical)) return null;
  const rel = isObj(technical.angles) ? technical.angles : null;
  const natal = isObj(technical.natal) && isObj(technical.natal.angles) ? technical.natal.angles : null;
  const relAsc = signOf(rel?.ascendant);
  const relMc = signOf(rel?.midheaven);
  const natalAsc = signOf(natal?.ascendant);
  const natalMc = signOf(natal?.midheaven);
  return relAsc && relMc && natalAsc && natalMc ? { natalAsc, relAsc, natalMc, relMc } : null;
}

// Sağlayıcı kalıbı (Türkçe yerelleştirilmiş burç adlarıyla). Yalnız bu bölüm değişir; cümlenin devamı aynen kalır.
const CLAUSE = /Yükselen (\S+) burcuna, Tepe Noktası ise (\S+) burcuna geçer/;

function correctedClause(s: RelocationAngleSigns): string | null {
  const ascSame = s.natalAsc === s.relAsc;
  const mcSame = s.natalMc === s.relMc;
  const A = SIGN_LABELS[s.relAsc];
  const M = SIGN_LABELS[s.relMc];
  if (ascSame && mcSame) return `Yükselen ${A}, Tepe Noktası ${M} burcunda kalır (yalnız dereceleri ve gezegenlerin ev yerleşimleri değişir)`;
  if (ascSame) return `Yükselen ${A} burcunda kalır (yalnız derecesi değişir), Tepe Noktası ise ${M} burcuna geçer`;
  if (mcSame) return `Yükselen ${A} burcuna geçer, Tepe Noktası ise ${M} burcunda kalır (yalnız derecesi değişir)`;
  return null;
}

/** Burç değişmemişse kalıptaki "… burcuna geçer" ifadesini doğru anlatımla gösterir; aksi hâlde metin AYNEN. */
export function relocationSummaryText(text: string, s: RelocationAngleSigns | null): string {
  if (!s) return text;
  const fixed = correctedClause(s);
  if (!fixed) return text;
  const m = CLAUSE.exec(text);
  // Kalıptaki burç adları kayıtlı relocation burçlarıyla AYNI değilse dokunulmaz (beklenmeyen metin değiştirilmez).
  if (!m || m[1] !== SIGN_LABELS[s.relAsc] || m[2] !== SIGN_LABELS[s.relMc]) return text;
  return text.replace(m[0], fixed);
}

/** Ayrı açıklama — yalnız cümle gerçekten düzeltildiyse. */
export function relocationSummaryNote(text: unknown, s: RelocationAngleSigns | null): string | null {
  if (typeof text !== "string" || !s || relocationSummaryText(text, s) === text) return null;
  const part = (label: string, a: SignId, b: SignId) => `${label} ${SIGN_LABELS[a]} → ${SIGN_LABELS[b]}${a === b ? " (burç aynı)" : ""}`;
  return (
    `Otomatik yorumun Yükselen / Tepe Noktası cümlesi sabit bir kalıptır ve burç değişmese de “burcuna geçer” der. ` +
    `Bu analizde kayıtlı haritaya göre ${part("Yükselen", s.natalAsc, s.relAsc)}, ${part("Tepe Noktası", s.natalMc, s.relMc)}; cümle buna göre gösterilmiştir. Diğer metin değiştirilmemiştir.`
  );
}

/** Rapor / ekran tablosu: Tepe Noktası burcu değişti mi (kayıtlı natal ↔ relocation; natal yoksa null). */
export function relocationMcSignChanged(technical: unknown): boolean | null {
  const s = relocationAngleSigns(technical);
  return s ? s.natalMc !== s.relMc : null;
}
