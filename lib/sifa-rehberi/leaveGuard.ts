/**
 * Şifa Rehberi — kaydedilmemiş değişiklik "ayrılma" koruması: SAF karar mantığı (SIFA-2).
 *
 * KÖK NEDEN (SIFA-2): `useUnsavedGuard` (beforeunload) yalnız sekme kapatma/yenilemeyi,
 * `useBackNavigationGuard` (popstate) yalnız tarayıcı geri/ileri'yi karşılar. Global üst
 * bardaki logo (`AppLogoLink`, Next `<Link href="/">`) ve diğer uygulama-içi linkler
 * istemci-tarafı navigasyondur → ikisi de TETİKLENMEZ → düzenleme sessizce kaybolur.
 *
 * ÇÖZÜM: belge seviyesinde capture-phase click dinleyicisi (Kupa/HD'de kanıtlanmış desen)
 * dirty iken AYNI-ORIGIN link tıklamasını yakalar ve uygulama-içi onay penceresi açar.
 * Bu modül yalnız "bu tıklama yakalanmalı mı, hedef nedir?" kararını verir (DOM'suz, test edilebilir).
 */

export type LeaveClickInput = {
  /** Formda kaydedilmemiş değişiklik var mı. */
  dirty: boolean;
  /** Kullanıcı ayrılmayı zaten onayladı mı (çift soru / döngü koruması). */
  leaving?: boolean;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Tıklanan elemanın en yakın `a[href]` atası (yoksa null). */
  anchor: { href: string; target?: string | null; download?: boolean } | null;
  /** Mevcut sayfa adresi (window.location.href). */
  currentHref: string;
};

/**
 * Tıklama yakalanmalıysa uygulama-içi hedef yolu (pathname+search+hash) döner; aksi hâlde null
 * (tarayıcı/Next normal davranışına bırakılır).
 *
 * Yakalanmaz: dirty değil · zaten ayrılıyor · başka biri preventDefault etti · sol tık değil ·
 * Ctrl/Cmd/Shift/Alt (yeni sekme/pencere) · target≠_self · download · farklı origin (harici) ·
 * aynı sayfa (yalnız hash / aynı path+search) · ayrıştırılamayan href.
 */
export function resolveGuardedLinkTarget(input: LeaveClickInput): string | null {
  if (!input.dirty || input.leaving) return null;
  if (input.defaultPrevented) return null;
  if (input.button !== 0) return null;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return null;
  const a = input.anchor;
  if (!a) return null;
  if (a.target && a.target !== "_self") return null;
  if (a.download) return null;
  let current: URL;
  let url: URL;
  try {
    current = new URL(input.currentHref);
    url = new URL(a.href, current);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null; // mailto:, tel:, javascript:
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * "Vazgeç" ile atılan taslakta, bu oturumda YÜKLENMİŞ ama kayda hiç yazılmamış görsellerin
 * storage yolları (orphan temizliği için). `saved` = kayıtlı görsel listeleri, `draft` =
 * taslaktaki listeler. Temizlik sunucuda membership-korumalıdır (referanslı obje silinmez).
 */
export function unsavedUploadPaths(saved: unknown[][], draft: unknown[][]): string[] {
  const pathOf = (img: unknown): string | null => {
    if (!img || typeof img !== "object") return null;
    const p = (img as { file_path?: unknown }).file_path;
    return typeof p === "string" && p.trim() ? p : null;
  };
  const keep = new Set<string>();
  for (const list of saved) for (const img of Array.isArray(list) ? list : []) {
    const p = pathOf(img);
    if (p) keep.add(p);
  }
  const out = new Set<string>();
  for (const list of draft) for (const img of Array.isArray(list) ? list : []) {
    const p = pathOf(img);
    if (p && !keep.has(p)) out.add(p);
  }
  return [...out];
}

/** Uygulama-içi link ile ayrılma onayı (ConfirmProvider). */
export const SIFA_LEAVE_CONFIRM = {
  title: "Kaydedilmemiş değişiklikler",
  message: "Bu kayıttaki değişiklikler kaydedilmedi. Sayfadan ayrılırsanız değişiklikleriniz kaybolur.",
  confirmText: "Kaydetmeden ayrıl",
  cancelText: "Sayfada kal",
  tone: "warning" as const,
};

/** "Vazgeç" (düzenlemeyi/yeni kaydı iptal) onayı (ConfirmProvider). */
export const SIFA_DISCARD_CONFIRM = {
  title: "Değişiklikler kaydedilmedi",
  message: "Kaydedilmemiş değişiklikleriniz silinecek. Düzenlemeden çıkmak istiyor musunuz?",
  confirmText: "Değişiklikleri sil ve çık",
  cancelText: "Düzenlemeye devam et",
  tone: "warning" as const,
};

/** 409 sonrası "Son hali yükle" — taslağı atmadan önce açık onay (ConfirmProvider). */
export const SIFA_RELOAD_CONFIRM = {
  title: "Son hali yükle",
  message:
    "Kaydın sunucudaki son hali yüklenecek ve bu sekmedeki kaydedilmemiş değişiklikleriniz silinecek. Devam etmek istiyor musunuz?",
  confirmText: "Son hali yükle",
  cancelText: "Vazgeç",
  tone: "warning" as const,
};
