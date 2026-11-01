/**
 * KAMPANYA MERKEZİ — Owner paneli için katalog AÇIKLAMA metinleri (SAF; istemci güvenli, sır/DB yok).
 *
 * Kaynak: KM-P0 v2 görsel PASS prototipi (C:/YasamSistemi-Gorsel-Tasarim/kampanya-merkezi/js/catalog.js) + main teknik denetimi.
 * Teknik kimlikleri, kredi, uygunluk ve yorum kaynakları YALNIZ lib/campaign/catalog.ts'ten gelir; bu dosya yalnız açıklama /
 * rapor kapsamı / ziyaretçi adı ekler. Eşlik testi (scripts/campaign/catalog-parity.test.ts) burada katalogda olmayan bir
 * anahtar bulunursa KIRILIR.
 */
import type { CampaignModule, CampaignReadiness, CommentSource } from "./catalog";

export const MODULE_UI: Readonly<Record<CampaignModule, { title: string; img: string; visitorShort: string; note: string }>> = Object.freeze({
  hd: { title: "Human Design", img: "/premium/landing/mod-humanDesign.webp", visitorShort: "BodyGraph ve standart rapor", note: "Kodda 8 alt bileşen var: 7 analiz + Sistem Yorumu. Sistem Yorumu ayrı analiz değil; BodyGraph sonucundan 0 kredi ile çıkan yorum katmanıdır." },
  numk: { title: "Klasik Numeroloji", img: "/premium/landing/mod-numeroloji.webp", visitorShort: "Pisagor ve Kalde — iki sistem", note: "Numeroloji Merkezi'ndeki yeni iki ekollü motor (/numeroloji-klasik)." },
  numb: { title: "Bütüncül Numeroloji", img: "/premium/landing/mod-numeroloji.webp", visitorShort: "Eğitim tekniklerine dayalı bütüncül çalışma", note: "Hesap tamamen yerel (0 kredi). Ana analiz yorumları uzmanın kendi Bilgi Bankası'ndan gelir — ücretsiz ziyaretçiye asla açılmaz; yalnız kitap kataloğu metinleri Owner kararıyla açılabilir." },
  atlas: { title: "Gökyüzü Atlası", img: "/premium/landing/mod-kozmikAjanda.webp", visitorShort: "Batı, Vedik ve KP teknikleri", note: "43 teknik: 42 motor tekniği (Batı 17 · Vedik 19 · KP 6) + yerel Lilly horary. Lilly dışındaki her teknik bugün kayıtlı doğum profili ister; oturumsuz akış KM-3'te." },
  kozmik: { title: "Kozmik Takvim", img: "/premium/landing/mod-kozmikAjanda.webp", visitorShort: "Ay fazları, retrolar, gezegen saatleri ve daha fazlası", note: "Owner kararı: altı özellik TEK PAKET — tek anahtar, ortak IP/gün hakkı ve günlük kontenjan. Hesap tarayıcıda yerel motorla yapılır (sağlayıcı kredisi 0). Kozmik Takvim'de ayrı harita özelliği yoktur." },
});

export const SOURCE_UI: Readonly<Record<CommentSource, { label: string; origin: string }>> = Object.freeze({
  "hd.system": { label: "Sistem Yorumu", origin: "Hesaplama altyapısının Türkçe metni (tip, strateji, otorite, profil, tanım, haç, merkez, kanal, kapı açıklamaları); çevirisi olmayan metin İngilizce kalabilir" },
  "hd.relation": { label: "İlişki / grup açıklamaları", origin: "Yaşam Sistemi'nin kodda sabit açıklama metni" },
  "numk.meaning": { label: "Klasik yöntem yorumu", origin: "Hesaplama altyapısının Türkçe anlam blokları (açıklama, güçlü/zorlayıcı yönler, kariyer, ilişki, ruhsallık)" },
  "numb.book": { label: "Kitap kataloğu metinleri", origin: "Kodda sabit katalog (zamanlama, ilişki, ev/işyeri) — yayın hakkı doğrulanmadı" },
  "atlas.auto": { label: "Otomatik Yorum", origin: "Hesaplama altyapısının yorum katmanı (Türkçe istenir)" },
  "atlas.events": { label: "Olay Açıklamaları", origin: "Hesaplama altyapısı — transit takvimi olayları" },
  "atlas.system": { label: "Sistem Yorumu", origin: "Hesaplama altyapısı (profeksiyon, ek noktalar)" },
  "atlas.tech": { label: "Teknik Açıklama", origin: "Hesaplama altyapısının teknik açıklama metni" },
  "atlas.en": { label: "Anlatı (yalnız İngilizce)", origin: "Gochara anlatısı yalnız İngilizce gelir; yerel Türkçe teknik özet ayrıca vardır" },
  "kozmik.static": { label: "Sabit rehber metinleri", origin: "Kodda sabit genel metinler (kişiye özel değil). Hacamat kural metinleri bu kapsamın dışındadır." },
});

export const READINESS_UI: Readonly<Record<CampaignReadiness, { label: string; cls: "ok" | "warn" | "no"; hint: string }>> = Object.freeze({
  hazir: { label: "Hazır aday", cls: "ok", hint: "Motor tanımı oturumsuz akışta değişmeden kullanılabilir; yeni güvenli açık uç yine gerekir." },
  dogrulama: { label: "Entegrasyon doğrulaması gerekli", cls: "warn", hint: "Seçilebilir, ancak gerçek yayından önce doğrulama tamamlanmalı." },
  uygun_degil: { label: "Henüz uygun değil", cls: "no", hint: "İlk sürümde açılamaz." },
});

/** Rapor bölümü türü: veri | yorum | gizli (hiçbir koşulda) | yok */
export type ReportSection = readonly [string, "veri" | "yorum" | "gizli" | "yok"];
export type ReportScope = { formats: readonly string[]; sections: readonly ReportSection[]; note?: string };

const R: Record<string, ReportScope> = {
  hdWord: { formats: ["Word"], sections: [["Kapak", "veri"], ["Kimlik (tip, otorite, profil, tanım)", "veri"], ["BodyGraph ve aktivasyonlar", "veri"], ["Enkarnasyon haçı", "veri"], ["Merkezler", "veri"], ["Kanallar", "veri"], ["Kapılar", "veri"], ["Uzman Açıklamaları (uzman Bilgi Bankası)", "gizli"], ["Sistem Yorumu", "yorum"], ["Kapanış", "veri"]], note: "Mevcut Word raporunda “yorumsuz” seçeneği zaten var. PNG/PDF yok." },
  hdRel: { formats: ["Word (ilişki raporu)"], sections: [["Kişiler ve haritalar", "veri"], ["Bağlantı / grup tabloları", "veri"], ["İlişki açıklamaları", "yorum"], ["Uzman yorumu ve uzman Bilgi Bankası", "gizli"]] },
  screen: { formats: ["Yalnız ekran"], sections: [["Hesap sonucu", "veri"]], note: "Bu teknik için ayrı rapor yolu bulunmadı." },
  numkWord: { formats: ["Word (özet / teknik / tam)", "PNG (kişi analizleri)"], sections: [["Kimlik ve girdi", "veri"], ["Sayılar ve adım adım hesap", "veri"], ["Klasik yöntem yorumu", "yorum"], ["Taş önerileri (stok)", "gizli"]], note: "Mevcut üç rapor türünün hepsi yorum içerir — yorum kapalıyken yeni “yorumsuz” rapor türü gerekir." },
  numbPng: { formats: ["PNG infografik (tarayıcıda)"], sections: [["Sayılar ve çakra", "veri"], ["Hesap açıklamaları", "veri"], ["Kitap kataloğu metinleri", "yorum"], ["Bilgi Bankası yorumları ve Taş Notlarım", "gizli"]], note: "Word yalnız kayıtlı analizden üretilir; oturumsuz akışta yok." },
  atlas: { formats: ["Word", "PDF"], sections: [["Harita / tablolar", "veri"], ["Teknik ayrıntılar", "veri"], ["Yorum katmanı", "yorum"], ["Uzman notları", "gizli"]], note: "Bugün rapor yalnız kayıtlı analizden üretilir — oturumsuz akış için yeni rapor yolu gerekir." },
  lilly: { formats: ["Word", "PDF"], sections: [["Soru anının haritası", "veri"], ["Gösterge kuralları ve yöntem notları", "veri"], ["Otomatik hüküm", "yok"]], note: "Yerel motor; otomatik hüküm üretilmez." },
  kozmik: { formats: ["Yalnız ekran"], sections: [["Altı özelliğin takvim görünümleri", "veri"], ["Sabit rehber metinleri", "yorum"], ["Uzmanın Hacamat kuralları ve Hacamat PDF/Word raporu", "gizli"]], note: "Mevcut Hacamat PDF/Word raporu oturumlu ve uzmanın kendi kural kayıtlarını içerir — kampanyada kullanılmaz." },
};

/** Teknik başına açıklama (yalnız katalog anahtarları). */
export const TECHNIQUE_UI: Readonly<Record<string, { visitorName?: string; why?: string; report: ReportScope; form: string }>> = Object.freeze({
  "hd:bodygraph": { visitorName: "BodyGraph'ımı oluştur", form: "Doğum tarihi, saati ve yeri", report: R.hdWord, why: "Danışan kaydı olmadan hesap için eğitim/kurgusal harita deseni yeniden kullanılabilir. Konum araması ücretsiz kaynaklarla sınırlanmalı." },
  "hd:variables": { form: "Doğum tarihi, saati ve yeri", report: R.screen, why: "Harita 1 + değişkenler 1. Ayrı izin ister; mevcut Word raporuna girmez. Owner tam analiz kararı olmadan kapalı." },
  "hd:transit": { form: "Tarih ve saat", report: R.screen, why: "Doğum verisi gerekmez; çoğu zaman yerel hesap + ortak önbellek (0 kredi)." },
  "hd:personal_transit": { form: "Doğum bilgileri ve bakılacak an", report: R.screen, why: "Bugün kayıtlı harita ister; önbellek yalnız bellekte." },
  "hd:connection": { visitorName: "İki kişilik ilişki haritası", form: "İki kişinin doğum bilgileri", report: R.hdRel, why: "Bugün iki kişinin kayıtlı haritası gerekir; profilsiz iki kişilik akış yeni geliştirme." },
  "hd:penta": { form: "3–5 kişinin doğum bilgileri", report: R.hdRel, why: "Kişi başına harita + 1 penta; çok kişilik kişisel veri." },
  "hd:local_engine": { form: "Doğum tarihi, saati ve yeri", report: R.screen, why: "Arayüzde kullanılmıyor; bazı tip/otoriteler doğrulanmamış." },
  "numk:core": { visitorName: "Çekirdek sayılarım", form: "Ad soyad ve doğum tarihi", report: R.numkWord },
  "numk:bridge": { form: "Ad soyad ve doğum tarihi", report: R.numkWord },
  "numk:personal_day": { form: "Doğum günü/ayı ve tarih", report: R.numkWord },
  "numk:daily": { form: "Tarih", report: R.numkWord },
  "numk:chaldean": { form: "Ad soyad", report: R.numkWord },
  "numk:dual": { visitorName: "İki sistemde sayılarım", form: "Ad soyad ve doğum tarihi", report: R.numkWord, why: "Çekirdek + Kalde; İki Sistem yerelde türetilir." },
  "numk:person_all": { form: "Ad soyad ve doğum tarihi", report: R.numkWord, why: "5 sağlayıcı çağrısı; İki Sistem bunlardan türetilir." },
  "numk:compatibility": { form: "İki kişinin adı ve doğum tarihi", report: R.numkWord },
  "numk:business_name": { form: "İşletme adı", report: R.numkWord },
  "numk:names": { form: "1–3 isim adayı", report: R.numkWord, why: "Aday sayısı kadar çağrı — ücretsizde aday sayısı sınırlanmalı." },
  "numb:analysis": { form: "Ad soyad ve doğum tarihi", report: R.numbPng, why: "Ana sayıların yorumu uzmanın Bilgi Bankası'ndan geldiği için ücretsizde yalnız sayılar ve hesap açıklamaları gösterilir." },
  "numb:timing": { form: "Ad soyad ve doğum tarihi", report: R.numbPng },
  "numb:relation": { form: "İki kişinin adı ve doğum tarihi", report: R.numbPng, why: "Bugün yalnız kayıtlı analiz detayında görünür; yeni giriş noktası gerekir." },
  "numb:place": { form: "Ev veya işyeri numarası", report: R.numbPng, why: "Bugün yalnız kayıtlı analiz detayında görünür; yeni giriş noktası gerekir." },
  "atlas:western.natal": { visitorName: "Doğum haritam", form: "Doğum tarihi, saati ve yeri", report: R.atlas },
  "atlas:western.solar_return": { visitorName: "Yıllık güneş dönüşüm haritası", form: "Doğum bilgileri ve yıl", report: R.atlas },
  "atlas:horary.lilly": { visitorName: "Sorunu gökyüzüne sor (Horary)", form: "Sorunuz, sorulduğu an ve yer — doğum bilgisi gerekmez", report: R.lilly, why: "Yerel motor, sağlayıcı ve veritabanı yok. Soru metni sunucuya gönderilmez." },
  "atlas:kp.horary": { form: "1–249 arası sayı, soru anı ve yer", report: R.atlas, why: "Doğum verisi kullanmaz ama motor profil hattı ister." },
  "atlas:western.synastry": { form: "İki kişinin doğum bilgileri", report: R.atlas, why: "Eş kişinin kayıtlı profil kimliği zorunlu." },
  "atlas:western.composite": { form: "İki kişinin doğum bilgileri", report: R.atlas, why: "Eş kişinin kayıtlı profil kimliği zorunlu." },
  "atlas:vedic.gun_milan": { form: "İki kişinin doğum bilgileri", report: R.atlas, why: "Eş profil zorunlu, 3 kredi." },
  "atlas:vedic.dashakoot": { form: "İki kişinin doğum bilgileri", report: R.atlas, why: "Eş profil zorunlu." },
  "atlas:vedic.papasamyam": { form: "İki kişinin doğum bilgileri", report: R.atlas, why: "Eş profil zorunlu." },
  "atlas:western.forecast": { form: "Doğum bilgileri ve dönem", report: R.atlas, why: "90 gün başına 1 kredi; ücretsizde gün sayısı sınırlanmalı." },
  "atlas:kp.transit": { form: "Bakılacak an", report: R.atlas, why: "Aralık modunda 15 isteğe çıkabilir — ücretsizde yalnız tek an." },
  "atlas:vedic.transit": { form: "Doğum bilgileri ve bakılacak an", report: R.atlas, why: "Anlatı yalnız İngilizce." },
  "atlas:western.fixed_stars": { form: "Doğum tarihi, saati ve yeri", report: R.atlas, why: "Anahtar kelimeler İngilizce gelir, yerel sözlükle çevrilir." },
  "kozmik:paket": { visitorName: "Kozmik Takvim'e gir", form: "Altı özellik tek pakette — kayıt gerekmez", report: R.kozmik, why: "Gerçek yayından önce Hacamat Takvimi'nin sağlık iddiaları ve hukuki uygunluğu incelenmeli; o zamana kadar yalnız tarafsız takvim bilgisi." },
});

/** Atlas teknikleri için varsayılan açıklama (tekniğe özel kayıt yoksa). */
export const DEFAULT_TECHNIQUE_UI = { form: "Doğum tarihi, saati ve yeri", report: R.atlas } as const;

export function techniqueUi(key: string): { visitorName?: string; why?: string; report: ReportScope; form: string } {
  return TECHNIQUE_UI[key] ?? (key.startsWith("atlas:") ? DEFAULT_TECHNIQUE_UI : { form: "", report: R.screen });
}

/** 10 hazır slogan (prototip kütüphanesi). */
export const SLOGANS: readonly { group: string; text: string; sub: string }[] = Object.freeze([
  { group: "Keşif", text: "Profesyonel analiz deneyimini ücretsiz keşfedin", sub: "Yaşam Sistemi'nin uzmanlara sunduğu gerçek analiz altyapısını kayıt olmadan deneyin." },
  { group: "Keşif", text: "Bugün sizin için gökyüzü ve sayılar konuşuyor", sub: "Seçili analizler sınırlı kontenjanla ücretsiz açık." },
  { group: "Keşif", text: "Uzmanların kullandığı araçları siz de deneyin", sub: "Danışanlarıyla çalışan profesyonellerin tercih ettiği analizleri ücretsiz inceleyin." },
  { group: "Human Design", text: "Kendi BodyGraph'ınızı ücretsiz oluşturun", sub: "Tam harita ve standart rapor; doğum bilgilerinizle birkaç saniyede." },
  { group: "Human Design", text: "Tasarımınızı tanıyın, kararlarınıza güvenin", sub: "Tipinizi, otoritenizi ve profilinizi profesyonel kalitede görün." },
  { group: "Numeroloji", text: "Adınızdaki sayıların hikâyesini keşfedin", sub: "Pisagor ve Kalde sistemleriyle iki farklı bakış açısı." },
  { group: "Numeroloji", text: "Sayılarınız, iki sistem, tek ekran", sub: "Hesabın her adımını açıkça gösteren profesyonel numeroloji." },
  { group: "Gökyüzü", text: "Doğduğunuz anın gökyüzüne bakın", sub: "Natal haritanızı ücretsiz oluşturun." },
  { group: "Gökyüzü", text: "Sorunuzu gökyüzüne sorun", sub: "William Lilly geleneğinde horary: doğum bilgisi gerekmeden, sorduğunuz anın haritası." },
  { group: "Gökyüzü", text: "Yeni yaşınızın gökyüzü haritası", sub: "Solar return ile önümüzdeki yılın temalarına bakın." },
]);

export const AFFIRMATIONS: readonly string[] = Object.freeze([
  "Kendini tanımak, en değerli yolculuktur.",
  "Her sayı bir hikâye, her hikâye bir başlangıç.",
  "Doğanı fark et, kendine güven.",
  "Bugün kendine bir adım daha yakınsın.",
  "Gökyüzü değişir; sen kendi ritmini bulursun.",
]);

/** Kampanya görseli seçenekleri: image_ref (DB izin listesi) → gerçek public dosya. */
export const IMAGE_OPTIONS: readonly { ref: string | null; label: string; src: string | null }[] = Object.freeze([
  { ref: null, label: "Görsel yok", src: null },
  { ref: "assets/hero-manzara.webp", label: "Manzara", src: "/premium/ana-sayfa/hero-manzara.webp" },
  { ref: "assets/hero-sahne.webp", label: "Sahne", src: "/premium/landing/hero-sahne.webp" },
  { ref: "assets/mod-humandesign.webp", label: "Human Design", src: "/premium/landing/mod-humanDesign.webp" },
  { ref: "assets/mod-numeroloji.webp", label: "Numeroloji", src: "/premium/landing/mod-numeroloji.webp" },
]);

export function imageSrc(ref: string | null | undefined): string | null {
  return IMAGE_OPTIONS.find((o) => o.ref === ref)?.src ?? null;
}
