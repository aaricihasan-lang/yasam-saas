/**
 * I18N-F1-R3 — Refleksoloji senkron rozeti metninin GÖSTERİM anahtarı (saf; React yok).
 *
 * Senkron yardımcıları (lib/refleksolojiAtlasSync, lib/atlasStorage, notlar/lib/notesSync) durum mesajını Türkçe
 * yazar; bu metinler testlerce kilitlidir ve senkron mantığına DOKUNULMAZ (kural 4). Kaynak dilde (tr) rozet
 * `status.message`'ı AYNEN gösterir. Diğer dillerde mesaj bu tabloyla `reflexology.errors.sync.<anahtar>`'a
 * eşlenir; tabloda olmayan mesaj (gelecekte eklenen) durum bazlı genel metne (`sync.state.<state>`) düşer —
 * Türkçe metin ekrana yapıştırılmaz. Tablonun lib'deki TÜM mesajları kapsadığını
 * scripts/i18n-mod-k2/reflexology-i18n.test.ts statik olarak doğrular.
 */
import { ATLAS_CONFLICT_MESSAGE, ATLAS_QUOTA_CONFLICT_MESSAGE } from "@/lib/refleksolojiAtlasSync";

export type SyncMessageKey = { key: string; values?: Record<string, string> };

// i18n-ignore: lib senkron mesajlarının KANONİK Türkçe metinleri → gösterim anahtarı (karşılaştırma tablosu; ekranda gösterilmez)
const EXACT: Record<string, string> = {
  "Notlar eşitleniyor…": "notesSyncing",
  "Çevrimdışı — notlar cihazda saklandı.": "notesOffline",
  "Notlar eşitlenemedi.": "notesFailed",
  "Bazı notlar başka bir cihazda veya sekmede değiştirilmiş. Yerel metniniz korundu; sunucudaki güncel sürümü yeniden yükleyebilirsiniz.":
    "notesConflict",
  "Notların bir kısmı eşitlenemedi.": "notesPartial",
  "Notlar eşitlendi": "notesSynced",
  "Atlas sunucudan alınamadı.": "atlasFetchFailed",
  "Atlas eşitlendi": "atlasSynced",
  "Atlasta henüz eşitlenmemiş değişiklikler var.": "atlasPending",
  "Atlas sunucuya gönderiliyor…": "atlasSyncing",
  "Çevrimdışı — atlas bu cihazda saklandı, bağlantı gelince gönderilecek.": "atlasOffline",
  "Atlas sunucuya gönderilemedi (zaman aşımı) — bu cihazda saklandı.": "atlasTimeout",
  "Atlas sunucuya gönderilemedi — bu cihazda saklandı.": "atlasFailed",
  "Atlas verisi sunucu tarafından reddedildi — bu cihazda saklandı.": "atlasRejected",
  [ATLAS_CONFLICT_MESSAGE]: "atlasConflict",
  [ATLAS_QUOTA_CONFLICT_MESSAGE]: "atlasQuotaConflict",
};

// i18n-ignore: sayı içeren iki not mesajının kanonik kalıpları (notesSync şablonlarıyla birebir)
const OVERSIZE_RE = /^(\d+) not çok büyük olduğu için sunucuya gönderilemedi \(ekler en fazla 3 MB\)\. Eki küçültüp notu yeniden kaydedin\.$/;
// i18n-ignore: (yukarıdakiyle aynı gerekçe)
const REJECTED_RE = /^(\d+) not eşitlenemedi \(geçersiz içerik veya ekler çok büyük\)\. İşaretli notu düzenleyip yeniden kaydedin; diğer notlar eşitlendi\.$/;

export function syncMessageKey(message: string | null | undefined): SyncMessageKey | null {
  if (typeof message !== "string" || !message) return null;
  const exact = EXACT[message];
  if (exact) return { key: exact };
  const o = OVERSIZE_RE.exec(message);
  if (o) return { key: "notesOversize", values: { count: o[1] } };
  const r = REJECTED_RE.exec(message);
  if (r) return { key: "notesRejected", values: { count: r[1] } };
  return null;
}
