// Doğaltaş Kütüphanesi · owner "Yayınla" kapısı (SAF; IO yok).
//
// Tek adım yayın (DB stone_library_publish_internal) ÖNCE taşın bekleyen güncel metin kayıtlarını ve yapısal değerlerini
// owner adına onaylar, SONRA hazırlığı yeniden denetler; engel kalırsa yayın yapılmaz (SL090). Yayın öncesi hazırlık
// raporundaki "records_pending" / "facets_pending" engelleri bu yüzden yayının KENDİSİNCE çözülür; bekleyen kayıtlar
// onaylanınca görünür içerik oluşabileceği için "no_visible_content" da kesin engel sayılmaz. Son karar her zaman sunucudadır.

export type ReadinessLike = { ready: boolean; blockers: string[]; warnings?: string[] };

/** Tek adım yayının kendisinin çözdüğü hazırlık engelleri. */
export const RESOLVED_BY_SINGLE_STEP_PUBLISH: readonly string[] = ["records_pending", "facets_pending"];

export type PublishGate = {
  /** Owner "Yayınla" düğmesine basabilir mi (sunucu yine son kontrolü yapar). */
  canTry: boolean;
  /** Yayının çözemeyeceği engeller (düğmeyi kilitler). */
  hard: string[];
  /** Yayın sırasında owner adına onaylanacak bekleyen kayıt türleri. */
  resolvedOnPublish: string[];
};

export function publishGate(r: ReadinessLike): PublishGate {
  const blockers = Array.isArray(r.blockers) ? r.blockers : [];
  const resolvedOnPublish = blockers.filter((b) => RESOLVED_BY_SINGLE_STEP_PUBLISH.includes(b));
  let hard = blockers.filter((b) => !RESOLVED_BY_SINGLE_STEP_PUBLISH.includes(b));
  if (resolvedOnPublish.length) hard = hard.filter((b) => b !== "no_visible_content");
  return { canTry: hard.length === 0, hard, resolvedOnPublish };
}

/** Sunucu yayın reddinin (SL090) iletisinden kalan engel kodlarını çıkarır: "…yayına hazır değil: ["kod", …]". */
export function blockersFromPublishError(message: string | null | undefined): string[] {
  const m = /\[([^\]]*)\]/.exec(String(message ?? ""));
  if (!m) return [];
  return m[1].split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => /^[a-z_]{3,60}$/.test(x));
}
