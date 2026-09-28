/**
 * USAGE360 — Refleksoloji senkron şişmesi koruması (SAF; iş davranışını DEĞİŞTİRMEZ).
 *
 * Refleksoloji verisi localStorage-öncelikli + sunucu senkronludur. Aynı içeriğin tekrar
 * gönderilmesi (yeniden deneme / arka plan senkronu) kullanım olayı SAYILMAMALI. Bu
 * yardımcılar yalnız "gerçekten değişti mi?" kararını verir; yazma yolu aynen sürer.
 *
 * JSONB anahtar sırası Postgres'te istemci sırasından farklı döner → karşılaştırma
 * anahtarları sıralanmış kanonik JSON ile yapılır.
 */

function canonical(value: unknown, omitKeys: ReadonlySet<string>, depth: number): unknown {
  if (Array.isArray(value)) return value.map((v) => canonical(v, omitKeys, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      if (depth === 0 && omitKeys.has(k)) continue;
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) continue;
      out[k] = canonical(v, omitKeys, depth + 1);
    }
    return out;
  }
  return value ?? null;
}

/**
 * İki JSON değeri içerikçe eşit mi? `omitTopLevelKeys` yalnız kök düzeyde yok sayılır
 * (ör. protokol raw_json.updatedAt — her kayıtta artan sürüm belirteci, içerik değil).
 */
export function sameJsonContent(
  a: unknown,
  b: unknown,
  omitTopLevelKeys: readonly string[] = [],
): boolean {
  const omit = new Set(omitTopLevelKeys);
  try {
    return JSON.stringify(canonical(a, omit, 0)) === JSON.stringify(canonical(b, omit, 0));
  } catch {
    return false;
  }
}

/**
 * by-uid PUT: gelen protokol içerik alanları sunucudaki satırla AYNI mı? (yalnız gelen
 * alanlar karşılaştırılır; raw_json.updatedAt her kayıtta değişen sürüm belirtecidir.)
 */
export function protocolContentUnchanged(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  const keys = Object.keys(incoming);
  if (keys.length === 0) return true;
  return keys.every((k) =>
    k === "raw_json"
      ? sameJsonContent(current[k], incoming[k], ["updatedAt"])
      : sameJsonContent(current[k], incoming[k]),
  );
}
