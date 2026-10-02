/**
 * lib/dogaltas/reportSafe.ts — Doğaltaş rapor savunmacı okuma yardımcıları (F-011).
 *
 * Legacy / admin→uzman transfer yoluyla gelmiş satırlarda structured JSONB alanları
 * (chakras, warning_tags, tags, related_stones, related_minerals, fiziksel, …) beklenen
 * `string[]` yerine string / number / object gibi YANLIŞ tipte olabilir. Rapor
 * builder'ındaki guard'sız `.join()/.map()/.filter()/.length` bu durumda TypeError atıp
 * TÜM tenant raporunu ham 500 ile öldürür (kanıtlanmış vektör: F-004 + verbatim transfer).
 *
 * Bu yardımcılar bilinmeyen değerden ANLAM ÜRETMEZ: geçerli bir `string[]` beğeni normalize
 * edilir; array değilse boş kabul edilir (rapor o alanı atlar, ama çökmez).
 */

/**
 * Bir JSONB alanını güvenli `string[]`'e indirger.
 *   - Array değilse → [] (raporda alan atlanır).
 *   - Array ise: her eleman String()'e çevrilip trim'lenir, boşlar atılır.
 * Sayı içeren array ("5" gibi) de kabul edilir (kayıp yerine görünür metin).
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item == null) continue;
    if (typeof item === "object") continue; // iç içe obje/array anlamı bilinmez → atla
    const s = String(item).trim();
    if (s) out.push(s);
  }
  return out;
}

/** Güvenli join: array değilse "" döner (guard'sız `.join` yerine). */
export function safeJoin(value: unknown, sep = ", "): string {
  return asStringArray(value).join(sep);
}

/** Güvenli uzunluk: array değilse 0. (`?.length` string üstünde yanıltıcı olabilir.) */
export function safeLen(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

// ─── P2-01: Mineral dizi alanları (rapor öncesi normalizasyon) ─────────────────

/** minerals tablosundaki `string[]` beklenen JSONB alanları (API yazma kapısı ile aynı liste). */
export const MINERAL_ARRAY_FIELDS = [
  "organ_etkileri",
  "fiziksel",
  "zihinsel",
  "cakralar",
  "fizyoloji",
  "eksiklik_belirtileri",
  "fazlalik_belirtileri",
  "doz_asimi",
  "iceren_taslar",
] as const;

/**
 * Bir mineral satırının dizi alanlarını rapor motoruna girmeden önce güvenli `string[]`'e
 * indirger. Geçerli (zaten string[] olan) alanlar BİREBİR korunur → normal UI'ın ürettiği
 * kayıtların rapor çıktısı değişmez. Bozuk alanlar:
 *   - dizi değil (string/sayı/nesne) → [] (alan raporda atlanır),
 *   - dizi içinde sayı/boolean → String() ile görünür metin,
 *   - dizi içinde nesne/dizi/null → atlanır.
 * Dönen `malformedFields` yalnız ALAN ADLARIDIR (içerik loglanmaz).
 */
export function sanitizeMineralArrays<T extends Record<string, unknown>>(
  row: T,
): { row: T; malformedFields: string[] } {
  const out: Record<string, unknown> = { ...row };
  const malformedFields: string[] = [];
  for (const field of MINERAL_ARRAY_FIELDS) {
    if (!(field in row)) continue;
    const value = row[field];
    if (value == null) continue;
    if (!Array.isArray(value)) {
      out[field] = [];
      malformedFields.push(field);
      continue;
    }
    let bad = false;
    const items: string[] = [];
    for (const item of value) {
      if (typeof item === "string") { items.push(item); continue; }
      bad = true;
      if (typeof item === "number" || typeof item === "boolean") items.push(String(item));
    }
    if (bad) {
      out[field] = items;
      malformedFields.push(field);
    }
  }
  return { row: out as T, malformedFields };
}

/**
 * Rapor için mineral satırlarını toplu normalize eder; bozuk kayıt varsa sunucu loguna
 * yalnız teknik bağlam yazar (route + kayıt id + alan adları; kayıt İÇERİĞİ yazılmaz).
 * Dönen `skipped` = normalize edilen bozuk kayıt sayısı.
 */
export function sanitizeMineralRowsForReport<T extends Record<string, unknown>>(
  rows: T[],
  ctx: { route: string; tenantId: string },
): { rows: T[]; malformedCount: number } {
  let malformedCount = 0;
  const out = rows.map((r) => {
    const { row, malformedFields } = sanitizeMineralArrays(r);
    if (malformedFields.length > 0) {
      malformedCount += 1;
      console.warn(
        `[${ctx.route}] bozuk mineral dizi alanı normalize edildi`,
        JSON.stringify({ tenant: ctx.tenantId, mineralId: String(r.id ?? "?"), fields: malformedFields }),
      );
    }
    return row;
  });
  return { rows: out, malformedCount };
}
