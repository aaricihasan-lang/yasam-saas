import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

// =======================================================
// Aromaterapi FAZ B1 — Blend / Karışım Oluşturucu veri katmanı
//
// İLKELER:
//  - AI önerisi YOK. Sistem yağ önermez; uzman yağları kendi seçer.
//  - Tedavi iddiası YOK. Sistem yalnızca hesaplar + bilinen veriyi gösterir.
//  - "Güvenlidir" denmez; uyarı yoksa "bilinen uyarı bulunamadı" denir.
//  - GÜVENLİK: İstemci aromatherapy_blends tablosuna DOĞRUDAN erişmez.
//    Tüm okuma/yazma /api/aromaterapi/blends (service_role + verifyUserRequest)
//    üzerinden gider. tenant_id oturumdan belirlenir; buradan GÖNDERİLMEZ (IDOR kapalı).
// =======================================================

// -------------------------------------------------------
// Tipler
// -------------------------------------------------------

/** Blend kalemi — kayıt anındaki yağ bilgisinin SNAPSHOT'ı (8 alan).
 *  Yağ sonradan değişse/silinse bile eski blend/reçete bozulmaz. */
export type BlendItem = {
  oil_id: string | null;
  oil_name: string;
  latin_name: string;
  oil_type: string;
  drops: number;
  is_photosensitive: boolean;
  contraindications: string;
  safety_notes: string;
};

export type Blend = {
  id: string;
  tenant_id: string;
  name: string;
  notes: string;
  carrier_oil_id: string | null;
  carrier_oil_name: string;
  bottle_ml: number;
  dilution_percent: number;
  drops_per_ml: number;
  total_drops: number;
  items: BlendItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

/** Kaydetme girdisi (id/meta olmadan). */
export type BlendInput = {
  name: string;
  notes: string;
  carrier_oil_id: string | null;
  carrier_oil_name: string;
  bottle_ml: number;
  dilution_percent: number;
  drops_per_ml: number;
  total_drops: number;
  items: BlendItem[];
};

// -------------------------------------------------------
// Sabitler (varsayımlar açık ve ayarlanabilir)
// -------------------------------------------------------

/** Varsayım: 1 ml ≈ 20 damla. Gerçekte 20–40 arası değişir; UI'da etiketlenir. */
export const DEFAULT_DROPS_PER_ML = 20;
export const BOTTLE_ML_PRESETS = [10, 30, 50, 100] as const;
export const DILUTION_PERCENT_PRESETS = [0.5, 1, 2, 3] as const;

// -------------------------------------------------------
// Hesaplar (saf fonksiyonlar — DB'ye dokunmaz)
// -------------------------------------------------------

/** Toplam uçucu yağ ml = şişe ml × oran / 100.
 *  Toplam damla = uçucu yağ ml × damla/ml, tam sayıya yuvarlanır.
 *  Örn: 30 ml × %2 = 0.6 ml → 0.6 × 20 = 12 damla. */
export function calcTotalDrops(
  bottleMl: number,
  dilutionPercent: number,
  dropsPerMl: number = DEFAULT_DROPS_PER_ML,
): number {
  if (!(bottleMl > 0) || !(dilutionPercent > 0) || !(dropsPerMl > 0)) return 0;
  const essentialMl = (bottleMl * dilutionPercent) / 100;
  return Math.round(essentialMl * dropsPerMl);
}

/** Toplam damlayı N yağa olabildiğince eşit dağıtır; kalan damlalar baştan +1 verilir.
 *  Dönen dizinin toplamı her zaman totalDrops'a eşittir (totalDrops ≥ 0 için). */
export function distributeEqually(totalDrops: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.floor(totalDrops));
  const base = Math.floor(safeTotal / count);
  let remainder = safeTotal - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}

/** Kalemlerdeki damlaların toplamı. */
export function sumDrops(items: Pick<BlendItem, "drops">[]): number {
  return items.reduce((acc, it) => acc + (Number.isFinite(it.drops) ? it.drops : 0), 0);
}

export type BlendFillStatus = "empty" | "under" | "exact" | "over";

/** Mevcut damla toplamının hedefe göre durumu (UI rozeti: eksik/tam/fazla). */
export function fillStatus(currentDrops: number, targetDrops: number): BlendFillStatus {
  if (targetDrops <= 0 && currentDrops <= 0) return "empty";
  if (currentDrops < targetDrops) return "under";
  if (currentDrops > targetDrops) return "over";
  return "exact";
}

// -------------------------------------------------------
// Güvenlik uyarıları (veri-temelli — yorum/tedavi iddiası YOK)
// -------------------------------------------------------

export type BlendSafetyWarning = {
  oil_name: string;
  kind: "photosensitive" | "contraindication" | "safety_note";
  label: string;
  detail: string;
};

export type BlendSafetyResult = {
  warnings: BlendSafetyWarning[];
  hasWarnings: boolean;
  /** UI'da gösterilecek özet. "Güvenli" DEMEZ. */
  summary: string;
};

/** Seçilen yağların snapshot alanlarından bilinen uyarıları toplar.
 *  Kaynak: is_photosensitive + contraindications + safety_notes.
 *  Kesin tıbbi hüküm vermez; yalnız veriyi gösterir. */
export function collectSafetyWarnings(items: BlendItem[]): BlendSafetyResult {
  const warnings: BlendSafetyWarning[] = [];

  for (const it of items) {
    if (it.is_photosensitive) {
      warnings.push({
        oil_name: it.oil_name,
        kind: "photosensitive",
        label: "Fotosensitif / fototoksik bilgisi var",
        detail: "Güneşe maruz kalınan uygulamalarda dikkat gerekir; uzman değerlendirmesi gerekir.",
      });
    }
    const contra = (it.contraindications ?? "").trim();
    if (contra) {
      warnings.push({
        oil_name: it.oil_name,
        kind: "contraindication",
        label: "Kontrendikasyon bilgisi var",
        detail: contra,
      });
    }
    const notes = (it.safety_notes ?? "").trim();
    if (notes) {
      warnings.push({
        oil_name: it.oil_name,
        kind: "safety_note",
        label: "Güvenlik notu var",
        detail: notes,
      });
    }
  }

  const hasWarnings = warnings.length > 0;
  const summary = hasWarnings
    ? "Seçilen yağlarda dikkat edilmesi gereken bilgiler bulundu — uzman değerlendirmesi gerekir."
    : "Bilinen uyarı bulunamadı. Bu, güvenli olduğu anlamına gelmez; uzman değerlendirmesi esastır.";

  return { warnings, hasWarnings, summary };
}

// -------------------------------------------------------
// Snapshot yardımcısı
// -------------------------------------------------------

/** Kaynak yağ bilgisinden (tam detay tercih edilir) blend kalemi snapshot'ı üretir. */
export function makeBlendItem(
  source: {
    id: string | null;
    name: string;
    latin_name?: string | null;
    oil_type: string;
    is_photosensitive?: boolean | null;
    contraindications?: string | null;
    safety_notes?: string | null;
  },
  drops: number,
): BlendItem {
  return {
    oil_id: source.id,
    oil_name: source.name,
    latin_name: source.latin_name ?? "",
    oil_type: source.oil_type,
    drops: Math.max(0, Math.floor(drops || 0)),
    is_photosensitive: source.is_photosensitive ?? false,
    contraindications: source.contraindications ?? "",
    safety_notes: source.safety_notes ?? "",
  };
}

// -------------------------------------------------------
// Doğrulama
// -------------------------------------------------------

/** Kaydetme öncesi minimal doğrulama. Hata varsa mesaj döner, yoksa null. */
export function validateBlendInput(input: BlendInput): string | null {
  if (!input.name.trim()) return "Karışım adı zorunludur.";
  if (!(input.bottle_ml > 0)) return "Şişe hacmi 0'dan büyük olmalıdır.";
  if (!(input.dilution_percent > 0)) return "Seyreltme oranı 0'dan büyük olmalıdır.";
  if (!input.items || input.items.length === 0) return "En az bir uçucu yağ eklemelisiniz.";
  return null;
}

// -------------------------------------------------------
// Sorgular — yalnız /api/aromaterapi/blends üzerinden (service_role sunucuda)
// tenant_id oturumdan; istemci göndermez.
// -------------------------------------------------------

const BLENDS_API = "/api/aromaterapi/blends";
export const BLEND_MISSING_AUTH = "Oturum bulunamadı. Lütfen tekrar giriş yapın.";

function authHeaders(json = false): Record<string, string> | null {
  const userId = readYasamUser()?.id;
  const token = readSessionToken();
  if (!userId || !token) return null;
  const h: Record<string, string> = { "x-user-id": userId, "x-session-token": token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function fetchBlends(): Promise<{ blends: Blend[]; error: string | null }> {
  const headers = authHeaders();
  if (!headers) return { blends: [], error: BLEND_MISSING_AUTH };
  try {
    const res = await fetch(BLENDS_API, { headers, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: Blend[] };
    if (!res.ok || !json.ok) return { blends: [], error: json.error ?? `HTTP ${res.status}` };
    return { blends: json.rows ?? [], error: null };
  } catch (e) {
    return { blends: [], error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

export async function saveBlend(
  input: BlendInput,
): Promise<{ blend: Blend | null; error: string | null; demo?: boolean }> {
  const validationError = validateBlendInput(input);
  if (validationError) return { blend: null, error: validationError };

  const headers = authHeaders(true);
  if (!headers) return { blend: null, error: BLEND_MISSING_AUTH };

  // tenant_id GÖNDERİLMEZ — sunucu oturumdan belirler.
  const payload = {
    name: input.name.trim(),
    notes: input.notes ?? "",
    carrier_oil_id: input.carrier_oil_id ?? null,
    carrier_oil_name: input.carrier_oil_name ?? "",
    bottle_ml: input.bottle_ml,
    dilution_percent: input.dilution_percent,
    drops_per_ml: input.drops_per_ml || DEFAULT_DROPS_PER_ML,
    total_drops: input.total_drops,
    items: input.items,
  };

  try {
    const res = await fetch(BLENDS_API, { method: "POST", headers, body: JSON.stringify(payload) });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; blend?: Blend; demo?: boolean };
    if (!res.ok || !json.ok) return { blend: null, error: json.error ?? `HTTP ${res.status}` };
    return { blend: json.blend ?? null, error: null, demo: json.demo };
  } catch (e) {
    return { blend: null, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}

export async function deleteBlend(
  id: string,
): Promise<{ ok: boolean; error: string | null; demo?: boolean }> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: BLEND_MISSING_AUTH };
  try {
    const res = await fetch(`${BLENDS_API}/${encodeURIComponent(id)}`, { method: "DELETE", headers });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; demo?: boolean };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true, error: null, demo: json.demo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}
