/**
 * GİRİŞ GÜVENLİĞİ — admin sayfasına DOĞRUDAN gelişte "geri dönüş" yolu (saf; IO yok; proxy + istemci ortak).
 *
 * Sorun: HttpOnly geçişinden sonra admin kabuk çerezi (yasam_admin_session, 24 sa) yalnız girişte / "Admin Paneli" tıklamasında
 * kuruluyordu; süresi dolunca veya başka siteden (SameSite=Strict) gelinince doğrudan /admin/... adresi ana sayfaya düşüyordu.
 * Çözüm: proxy çerez yoksa "/?yonetim=<yol>" adresine yönlendirir; ana sayfa admin çerezini SUNUCUDA geçerli oturumla yeniden kurar
 * (/api/auth/admin-session, __Host-yasam_sid) ve YALNIZ başarıda bu yola gider. Çerez / yetki kuralı gevşemez: yetki kararı yine
 * sunucuda (proxy çerez ister, admin layout DB'de doğrular).
 *
 * Güvenlik: yalnız aynı kökende "/admin" veya "/admin/..." yolları; şema / alan adı / "//" / "\" / kontrol karakteri / "..",
 * aşırı uzunluk → null (açık yönlendirme yok).
 */
export const ADMIN_RETURN_PARAM = "yonetim";
const MAX_LEN = 300;

export function safeAdminReturnPath(raw: string | null | undefined): string | null {
  const v = String(raw ?? "");
  if (!v || v.length > MAX_LEN) return null;
  if (!(v === "/admin" || v.startsWith("/admin/") || v.startsWith("/admin?") || v.startsWith("/admin#"))) return null;
  // Yüzde kodlu biçim de denetlenir (ör. %0d%0a, %2e%2e, %2f%2f); çözülemeyen yol reddedilir.
  let decoded: string;
  try { decoded = decodeURIComponent(v); } catch { return null; }
  for (const x of [v, decoded]) {
    if (x.includes("//") || x.includes("\\") || /[\u0000-\u001f\u007f]/.test(x) || /(^|\/)\.\.(\/|$|\?|#)/.test(x)) return null;
  }
  return v;
}
