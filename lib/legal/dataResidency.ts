/**
 * Veri konumu (data residency) bilgisi — YAPILANDIRMA tabanlı (FAZ1 FINAL HARDENING — INFRA).
 *
 * KURAL: Veri bölgesi (ör. şehir/ülke) KODA YAZILMAZ. Değer, dağıtım ortamında
 * `NEXT_PUBLIC_DATA_REGION_LABEL` ile verilir (ör. "AB (Almanya)"); opsiyonel
 * `NEXT_PUBLIC_DATA_REGION_NOTE` ek açıklama taşır. Ayarlanmamışsa dürüst bir
 * yer tutucu gösterilir. Owner, Supabase proje bölgesini doğrulayıp env'e yazar.
 *
 * Saf modül: env nesnesi parametre olarak verilebilir (test edilebilir).
 */

export const DATA_REGION_PLACEHOLDER = "Bölge bilgisi yayın öncesi netleştirilecektir";

export type DataResidency = {
  /** Env ile gerçek bölge bilgisi verildi mi? */
  configured: boolean;
  /** Görünen bölge etiketi ya da yer tutucu. */
  label: string;
  /** Opsiyonel ek açıklama (env). */
  note: string | null;
};

type EnvLike = Record<string, string | undefined>;

function clean(value: string | undefined, max: number): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

export function getDataResidency(env: EnvLike = readPublicEnv()): DataResidency {
  const label = clean(env.NEXT_PUBLIC_DATA_REGION_LABEL, 120);
  const note = clean(env.NEXT_PUBLIC_DATA_REGION_NOTE, 400);
  return label
    ? { configured: true, label, note }
    : { configured: false, label: DATA_REGION_PLACEHOLDER, note: null };
}

/**
 * NEXT_PUBLIC_* değerleri build'de satır içine gömülür; bu yüzden anahtarlar
 * statik olarak okunur (dinamik process.env[x] erişimi istemcide çalışmaz).
 */
function readPublicEnv(): EnvLike {
  return {
    NEXT_PUBLIC_DATA_REGION_LABEL: process.env.NEXT_PUBLIC_DATA_REGION_LABEL,
    NEXT_PUBLIC_DATA_REGION_NOTE: process.env.NEXT_PUBLIC_DATA_REGION_NOTE,
  };
}
