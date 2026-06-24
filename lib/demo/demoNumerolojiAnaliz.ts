// Demo numeroloji — kullanıcının oluşturduğu TEK örnek analizin girdileri.
// Yalnızca is_demo_account=true hesapta kullanılır. Analizin kendisi DB'ye
// yazılmaz; bu girdiler localStorage'da tutulur ve sayfa yeniden açıldığında
// analiz tekrar hesaplanarak gösterilir (çıkış yapana kadar görünür).
//
// IP bazlı oluşturma hakkı bu key'de DEĞİL, server'da (demo_numerology_ip_usage)
// tutulur — bu key logout'ta temizlenir ama hak sıfırlanmaz.

export const DEMO_NUMEROLOJI_ANALIZ_KEY = "yasam_demo_numeroloji_analiz";

export type DemoNumerolojiAnalizInput = {
  firstName: string;
  lastName: string;
  /** Görünüm formatı: GG/AA/YYYY */
  birthDate: string;
};

export function readDemoNumerolojiAnaliz(): DemoNumerolojiAnalizInput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_NUMEROLOJI_ANALIZ_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoNumerolojiAnalizInput>;
    const firstName = String(parsed.firstName ?? "").trim();
    const lastName = String(parsed.lastName ?? "").trim();
    const birthDate = String(parsed.birthDate ?? "").trim();
    if (!firstName || !lastName || !birthDate) return null;
    return { firstName, lastName, birthDate };
  } catch {
    return null;
  }
}

export function saveDemoNumerolojiAnaliz(input: DemoNumerolojiAnalizInput): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_NUMEROLOJI_ANALIZ_KEY, JSON.stringify(input));
  } catch {
    // localStorage doluysa sessizce geç
  }
}

export function clearDemoNumerolojiAnaliz(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_NUMEROLOJI_ANALIZ_KEY);
}
