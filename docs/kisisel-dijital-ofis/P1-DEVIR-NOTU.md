# Kişisel Dijital Ofis — P1 teknik devir notu

P1 yalnız güvenli veri altyapısını kurar: iki tablo, iki uç ve sunucu doğrulaması. Arayüz yoktur. Uçlar `EXPERT_WORKSPACE_DESIGN_ENABLED` bayrağı arkasındadır (varsayılan kapalı). Bayrak kapalıyken uçlar 404 döner ve ana sayfa aynen çalışır.

## 1. Kontrast güvenliği: kim neyi denetler

Owner kararı 1: okunabilirliği yetersiz tasarım **uygulanamaz**.

### Sunucu (P1'de yapıldı, gevşetilemez)
`lib/workspace/contrast.ts` dosyasındaki formüller, P0 son kabul prototipindeki `heroBg`, `lineColor` ve `isLarge` ile birebir aynıdır.

- **Ne zaman çalışır:** yalnız aktif görünümü değiştiren `apply` ve `restore` işlemlerinde. İhlal olursa yanıt `422 CONTRAST_INSUFFICIENT` olur ve sorun listesi döner.
- **Taslak serbesttir:** `saveDraft` ve `loadHistory` engellenmez, çünkü uzman düzeltme yapabilmelidir.
- **Denetlenen yüzeyler:**
  - Karşılama satırları; zemin rengi biliniyorsa: varsayılan, hazır tema, marka teması, C düzeni plaketi (fotoğrafta tona göre).
  - Eşikler: normal metin 4,5:1; büyük metin 3:1. Büyük metin, mobil ×0,74 ölçekle hesaplanır.
  - Marka paleti: koyu yazı (`ink`) ile zemin tonu (`soft`) arası ≥ 4,5:1.
- **Güvenli varsayılanlar:** "Otomatik" renkler her temada geçer (birim testi). Varsayılan tasarım ("Hoş geldiniz") her zaman geçer.

### İstemci: P4/P5 ZORUNLU kabul kriterleri (sunucu bunları ölçemez)
Sunucu görsel piksellerini görmez. Aşağıdakiler arayüz aşamasında **zorunlu kapı** olarak uygulanmalı ve Owner kabulünde test edilmelidir:

1. **Fotoğraf üzerindeki karşılama metni (A/B düzeni).** Metin kutusunun arkasındaki pikseller yerelde ölçülür (P0 `photoSmart.readability`). Katman yoğunluğu (`overlay`) ve tonu hesaba katılır. Masaüstü ve mobil ayrı ölçülür.
2. **Tüm sayfa fotoğrafı.** Kartlar, menü ve "Favorilerim" başlığı gündüz ve gece modunda ölçülür (P0 `pageReadability`). Yetersizse "Opak kart" veya katman artırma önerilir.
3. **Kapı davranışı:**
   - "Uygula" tıklanınca önce otomatik düzeltme önerilir.
   - Düzeltilemeyen sorun varsa Uygula düğmesi gösterilmez.
   - Hiçbir mod, URL parametresi veya gizli ayar bu kapıyı atlatamaz.
4. **Güvenlik payı:** model tabanlı ölçümde P0'daki +0,3 pay (4,8:1) korunur. Eşik düşürülmez.
5. **Kabul testi:** P0 piksel denetimi, yani 3 senaryo × A/B/C × 4 görünüm modu × 1440/390, yeni arayüzde yeniden koşulur. 4,5:1 (büyük yazıda 3:1) altında metin sayısı 0 olmalıdır.
6. Fotoğraf yükleme açılınca (`allowAssets`), görsel kimliği yalnız sunucunun ürettiği ve bu uzmana ait varlık kimliği olabilir. Sahiplik sunucuda doğrulanmalıdır.

## 2. Yedekleme
- İki tablo `lib/backup/registry.ts` içinde `backup` sınıfındadır, `naturalKey: "user_id"`.
- Geri yükleme yalnız eksik satırı ekler. Mevcut tasarım ve tercih ezilmez.
- Geçmiş, satırın içinde (jsonb) aynen taşınır.
- `tenant_id` ve `user_id` geri yüklemede oturuma zorlanır. Başka tenant'ın yedeği `id_conflict_other_tenant` ile reddedilir.
- Yedekten gelen içerik okunurken sunucu şemasından geçer. Şemaya uymayan içerik gösterilmez ama silinmez.

## 3. Canlıya çıkış sırası (Owner onayıyla)
1. Migration `20271227000000_expert_workspace_designs_prefs.sql` uygulanır. Kod bu tablolar yokken yedek dışa aktarmada "tablo okunamadı" uyarısı üretir. Bu yüzden önce migration, sonra kod.
2. Kod deploy edilir; bayrak **kapalı** kalır.
3. Bayrak yalnız Owner hesabıyla açılır, sonra test uzmanlarıyla, sonra herkese (karar 10). Her adım Owner PASS ister.
4. **Geri alma:** bayrak kapatılır. Veri silinmez. DROP / TRUNCATE içeren geri alma migration'ı yoktur.

## 4. Hesap silme
- Tablolarda `users`'a FK yoktur; Horary ve eğitim tablolarıyla aynı desen.
- Uzman kalıcı silme (`admin_purge_archived_expert`) yalnız tek kullanıcılı tenant'ta çalışır. tenant_id (uuid) kolonlu tüm tabloları siler, iki yeni tablo da buna dahildir. Sonra `users` ve `tenants` satırlarını siler.
- `users` satırını başka silen yol yoktur. Bu nedenle yetim satır oluşmaz.
- Benzersizlik `(tenant_id, user_id)` olarak tanımlıdır. İleride tenant değişikliği olursa yeni tenant'ta yeni satır açılır; eski satır eski tenant'la temizlenir.
