/**
 * Doğaltaş taş OKUMA görünürlüğü — tek kaynak (list, detay, Word, koşul arama,
 * uyarılar aynı kuralı kullanır; kopya iş kuralı YOK).
 *
 * KURAL (satış öncesi 2026-10): Ortak/merkezî "Admin Kütüphanesi" ürün modeli YOKTUR. Herkes —
 * owner (admin + uzman), normal uzman ve DEMO hesap — YALNIZ kendi tenant'ının taşlarını okur.
 * Owner tenant'ı (eski adıyla ADMIN_LIBRARY) owner'ın GERÇEK uzman verisidir; demo hesaba
 * (giriş bilgileri herkese açık) UNION EDİLMEZ. Başka tenant taşının id'si bilinse bile okunamaz.
 *
 * Yazma (PATCH/DELETE) bu helper'ı KULLANMAZ; daima `.eq("tenant_id", tenantId)`.
 * `isDemo` parametresi çağıranlarla imza uyumu için korunur (davranışı DEĞİŞTİRMEZ).
 */
export function stoneReadTenantIds(tenantId: string, _isDemo: boolean): string[] {
  void _isDemo;
  return [tenantId];
}
