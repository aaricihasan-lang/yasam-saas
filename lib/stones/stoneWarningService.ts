import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

export type StoneWarningResult = {
  /** Veritabanındaki stones.id — detay linki için */
  stoneId: string;
  /** Veritabanındaki stone_name değeri */
  stoneName: string;
  /** Doğaltaş modülündeki uyarı metni */
  warningText: string | null;
  /** Doğaltaş modülündeki uyarı etiketleri */
  warningTags: string[] | null;
};

/**
 * Virgülle veya satır sonu ile ayrılmış taş adı girişini diziye çevirir.
 * Boşlukları temizler, boş değerleri atar.
 *
 * Örnekler:
 *   "Ametist, Labradorit, Sitrin"  → ["Ametist", "Labradorit", "Sitrin"]
 *   "Ametist\nLabradorit\nSitrin" → ["Ametist", "Labradorit", "Sitrin"]
 */
export function parseStoneNames(input: string): string[] {
  if (!input || !input.trim()) return [];
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Verilen taş adlarını, uyarısı olanlar için GÜVENLİ server API'sinden sorgular.
 *
 * Eskiden bu kontrol client/anon Supabase ile `stones` tablosunu tarıyordu; RLS
 * güvenlik kilidi sonrası anon erişim 401 alıp uyarılar sessizce kaybolduğu için
 * (K-1) artık `/api/dogaltas/stone-warnings` (service_role + oturum doğrulaması)
 * üzerinden çalışır. Tenant izolasyonu ve library dahil-etme kararı SUNUCUDA verilir.
 *
 * Hata durumunda uyarı akışı danışan kaydını BLOKLAMAZ: uyarı bulunamamış gibi []
 * döner ama sessiz kalmaz — konsola uyarı (warn) bırakılır ki regresyon fark edilsin.
 */
export async function checkStoneWarnings(
  stoneNames: string[],
): Promise<StoneWarningResult[]> {
  if (!stoneNames || stoneNames.length === 0) return [];

  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();
  if (!userId || !sessionToken) {
    console.warn("[stoneWarnings] Oturum bilgisi yok; taş uyarı kontrolü atlandı.");
    return [];
  }

  try {
    const res = await fetch("/api/dogaltas/stone-warnings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ stoneNames }),
    });

    if (!res.ok) {
      console.warn(`[stoneWarnings] Uyarı API'si başarısız (HTTP ${res.status}); uyarı gösterilemedi.`);
      return [];
    }

    const json = (await res.json()) as { ok?: boolean; warnings?: unknown };
    if (!json?.ok || !Array.isArray(json.warnings)) {
      console.warn("[stoneWarnings] Uyarı API'sinden beklenmeyen yanıt; uyarı gösterilemedi.");
      return [];
    }

    return json.warnings as StoneWarningResult[];
  } catch (err) {
    console.warn("[stoneWarnings] Taş uyarı kontrolü sırasında hata:", err);
    return [];
  }
}
