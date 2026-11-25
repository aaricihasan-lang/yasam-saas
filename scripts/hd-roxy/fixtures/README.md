# HD Roxy fixture'ları

`roxy-bodygraph-2018-07-20.json` — **İNGİLİZCE (`lang=en`) dönemine ait, eski bir gerçek RoxyAPI `POST /human-design/bodygraph` yanıtıdır.**
TR (`lang=tr`) yanıtı DEĞİLDİR: `*Localized` alanları yoktur, açıklama metinleri İngilizcedir.

- Sayısal / kanonik içerik (26 aktivasyon, tip, otorite, profil, tanım, merkezler, kanallar, haç kapıları) güncel sağlayıcı yanıtıyla
  birebir aynıdır (ROXY ajanı, I18N-F1-R5 25.11.2026: sayısal 140/140 eşit).
- Anlatı metinleri (typeDescription vb.) güncel EN yanıttan farklıdır (sağlayıcı metinleri o tarihten sonra değişti).
- Bu yüzden hesap / normalizasyon / çizim testlerinde kanonik veri kaynağı olarak kullanılabilir; "TR anlatı" ya da güncel anlatı
  örneği olarak KULLANILMAMALIDIR. Güncel TR + EN ham yanıtlar: `C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/roxy/ham/hd/`
  (repo dışı kanıt; `scripts/hd-i18n/system-reading-en.harness.ts` ve `narrative.harness.ts` `HD_NARRATIVE_EN_RAW` ile kullanır).
- Dosya içeriği DEĞİŞTİRİLMEZ (çok sayıda harness ve SHA kontrolü buna bağlı).
