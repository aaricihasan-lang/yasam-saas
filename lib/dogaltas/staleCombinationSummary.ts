/**
 * B6.2 (05.11 canlı denetim, owner kararı A — migration YOK): kombinasyonun taşları değiştirildiğinde
 * kayıt anında üretilmiş OTOMATİK özetler (notes_text = "Arama Koşulları: …", notes_text_2 =
 * "Stok: x/y stokta …") artık eski taş listesine aittir. Bu özetler yeniden HESAPLANMAZ; başına
 * kalıcı bir "güncel değil" satırı eklenir. Özgün özet metni aynen altında kalır (silinmez/ezilmez).
 *
 * Uyarı satırı, özetin ait olduğu ÖZGÜN taş listesini de taşır. Taşlar daha sonra tam olarak o listeye
 * geri döndürülürse uyarı kaldırılır ve özgün metin birebir geri gelir (tahmin yok: liste kayıtlıdır).
 * Özgün listeyi taşımayan uyarılar hiç kaldırılmaz.
 *
 * Yalnız kombinasyon oluşturucunun ürettiği biçimdeki metinler işaretlenir; kullanıcının veya
 * eski kaynakların serbest metinlerine (ve kullanıcı notuna) DOKUNULMAZ.
 * Genel kombinasyon (combinations) ve danışana özel kombinasyon (client_combinations) ortak kullanır.
 */

export const STALE_SUMMARY_PREFIX = "⚠ GÜNCEL DEĞİL";

/** Oluşturucunun mineral/koşul özeti biçimi (buildConditionsSummary). */
export function isAutoConditionsSummary(text: string | null | undefined): boolean {
  return String(text ?? "").trimStart().startsWith("Arama Koşulları:");
}

/** Oluşturucunun uyarı/stok özeti biçimi (buildWarningStockSummary). */
export function isAutoStockSummary(text: string | null | undefined): boolean {
  return /^Stok: \d+\/\d+ stokta/.test(String(text ?? "").trimStart());
}

export function isStaleMarkedSummary(text: string | null | undefined): boolean {
  return String(text ?? "").trimStart().startsWith(STALE_SUMMARY_PREFIX);
}

const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr");
const splitStones = (csv: string | null | undefined) => String(csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function sameStoneSet(a: string[], b: string[]): boolean {
  const x = a.map(normName).filter(Boolean).sort();
  const y = b.map(normName).filter(Boolean).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Taş listesi (sıra önemsiz, Türkçe büyük/küçük harf duyarsız) gerçekten değişti mi? */
export function stoneListsDiffer(before: string | null | undefined, after: string[]): boolean {
  return !sameStoneSet(splitStones(before), after);
}

const STALE_LIST_RE = /önceki taş listesine \((.*)\) aittir ve yeniden hesaplanmadı\.$/;

/**
 * Otomatik özetin başına "güncel değil" satırını ekler (özgün taş listesiyle). Boş, zaten işaretli veya
 * otomatik biçimde OLMAYAN (serbest) metin → null (yazılacak bir şey yok).
 */
export function markStaleSummary(
  text: string | null | undefined,
  kind: "conditions" | "stock",
  dateLabel: string,
  originalStones: string[] = [],
): string | null {
  const t = String(text ?? "");
  if (!t.trim() || isStaleMarkedSummary(t)) return null;
  const auto = kind === "conditions" ? isAutoConditionsSummary(t) : isAutoStockSummary(t);
  if (!auto) return null;
  const list = originalStones.join(", ").replace(/[\r\n]+/g, " ");
  const tail = list
    ? `Aşağıdaki özet önceki taş listesine (${list}) aittir ve yeniden hesaplanmadı.`
    : "Aşağıdaki özet önceki taş listesine aittir ve yeniden hesaplanmadı.";
  return `${STALE_SUMMARY_PREFIX}: Kombinasyonun taşları ${dateLabel} tarihinde değiştirildi. ${tail}\n\n${t}`;
}

/** Uyarı satırındaki özgün taş listesi; liste taşımayan / işaretsiz metin → null. */
export function staleSummaryOriginalStones(text: string | null | undefined): string[] | null {
  const t = String(text ?? "");
  if (!isStaleMarkedSummary(t)) return null;
  const firstLine = t.trimStart().split("\n")[0];
  const m = STALE_LIST_RE.exec(firstLine);
  return m ? splitStones(m[1]) : null;
}

/** İşaretli metinden özgün özeti birebir geri verir (uyarı satırı + boş satır çıkarılır). */
function unmarkStaleSummary(text: string): string {
  const t = text.trimStart();
  const i = t.indexOf("\n\n");
  return i >= 0 ? t.slice(i + 2) : t;
}

export type StaleSummaryFields = { notes_text?: string; notes_text_2?: string };

/**
 * Taş listesi `nextStones` olacaksa özet alanlarında yapılacak değişiklik:
 *  - `mark`: yeni eklenecek uyarılar (taşlar özgün listeden uzaklaşıyor),
 *  - `unmark`: kaldırılacak uyarılar (taşlar uyarıda kayıtlı özgün listeye BİREBİR geri döndü).
 * Gerek yoksa ikisi de null. Serbest metin / liste taşımayan uyarı → dokunulmaz.
 */
export function staleSummaryChanges(
  prev: { stones_text?: string | null; notes_text?: string | null; notes_text_2?: string | null },
  nextStones: string[],
  dateLabel: string,
): { mark: StaleSummaryFields | null; unmark: StaleSummaryFields | null } {
  const before = splitStones(prev.stones_text);
  const mark: StaleSummaryFields = {};
  const unmark: StaleSummaryFields = {};
  const fields: Array<["notes_text" | "notes_text_2", "conditions" | "stock"]> = [["notes_text", "conditions"], ["notes_text_2", "stock"]];
  for (const [key, kind] of fields) {
    const text = prev[key];
    const orig = staleSummaryOriginalStones(text);
    if (orig) {
      if (orig.length && sameStoneSet(orig, nextStones)) unmark[key] = unmarkStaleSummary(String(text));
      continue;
    }
    if (sameStoneSet(before, nextStones)) continue;
    const m = markStaleSummary(text, kind, dateLabel, before);
    if (m) mark[key] = m;
  }
  return { mark: Object.keys(mark).length ? mark : null, unmark: Object.keys(unmark).length ? unmark : null };
}

/** Geriye uyumlu kısa yol: yalnız eklenecek uyarılar (geri dönüş dikkate alınmaz). */
export function staleSummaryMarks(
  prev: { stones_text?: string | null; notes_text?: string | null; notes_text_2?: string | null },
  nextStones: string[],
  dateLabel: string,
): StaleSummaryFields | null {
  return staleSummaryChanges(prev, nextStones, dateLabel).mark;
}
