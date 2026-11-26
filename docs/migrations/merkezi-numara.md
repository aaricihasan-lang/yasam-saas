# Merkezi Migration Numarası (DB-03)

Paralel çalışan oturumların aynı migration numarasını almasını **teknik olarak** engelleyen sistem. Ücretli / harici hizmet yok:
yalnız GitHub deposunun kendisi ve `git`.

## Neden

DB-02 (`scripts/ci/migration-naming-check.mjs`) yalnız PR'ın kendi deposunu görür: başka dalları, açık PR'ları ve production
geçmişini görmez; mevcut migration'ların değiştirilmesini / yeniden adlandırılmasını da yakalamaz. Bu yüzden paralel oturumlar
aynı "sıradaki numarayı" seçebiliyordu (KP Transit PR #860: `20280126000000` ve `20280127000000` başka işlere gitti).

## Kullanım (Claude Code / geliştirici)

```bash
# 1) Numara al + dosyayı oluştur (numara alınamazsa HİÇBİR dosya yazılmaz)
npm run migration:numara -- yeni --modul atlas --ad kp_transit_ornek
#   AYRILDI: 20280128000100 → 20280128000100_kp_transit_ornek.sql
#   OLUŞTURULDU: supabase/migrations/20280128000100_kp_transit_ornek.sql

# 2) SQL'i yazın, commit edin, PR açın; ardından içeriği PR'a bağlayın (SHA-256, dal, PR no)
npm run migration:numara -- bagla --surum 20280128000100 --pr 870

# Diğer
npm run migration:numara -- liste            # etkin ayırmalar (dosyası olmayanlar işaretli)
npm run migration:numara -- iptal --surum S --neden "vazgeçildi"   # numara bir daha VERİLMEZ
npm run migration:numara -- dogrula          # defter dalının tüm geçmişi: yalnız ekleme + tutarlılık
```

Aynı (modül, ad, dal) için ikinci `yeni` çağrısı yeni numara vermez; mevcut ayırmayı döndürür. Numara **seçilmez**, sistem verir.

## Mimari

- **Defter:** uzak depoda ayrı dal `migration-rezervasyon`, tek dosya `rezervasyonlar.jsonl`. Her satır bir olay:
  `gecmis` (main / production'da önceden kullanılmış), `ayir`, `bagla`, `uygula`, `iptal`. Satır silinmez / değiştirilmez;
  durum olaylardan türetilir. Kişisel veri / sır yok (kimlik = git `user.name@makine`, işlem kimliği UUID).
- **Atomik ayırma (karşılaştır-ve-değiştir):** araç, uzak ucu işleme özgü geçici bir ref'e çeker, numarayı defterin O TAM
  içeriğine + main'e (+ verilirse production geçmişine) göre hesaplar, satırı ekleyip `commit-tree -p <uç>` ile commit üretir
  (çalışma ağacı / index'e dokunmaz) ve **force olmadan** push eder. Sunucu yalnız ileri-sarmayı kabul eder: arada başka bir
  oturum yazdıysa push reddedilir, araç ucu yeniden okur ve yeni numarayla tekrar dener. Bir numara ancak onu görmeyen hiçbir
  yazım araya girmemişse kaydedilebilir → aynı numara iki işe verilemez. Belirsiz sonuçta (bağlantı push sırasında koptu)
  işlem kimliği defterde aranır; çift kayıt oluşmaz.
- **Numara kuralı:** bilinen en büyük sürüm (defter + main + çekilen dallar + production) + 1 dakika ızgarası (`…0100` adımı;
  gün dolarsa ertesi gün `000000`). İptal edilenler "bilinen"e dahildir → geri verilmez.
- **CI kapısı (DB-03)** `scripts/ci/migration-reservation-check.mjs` (`guvenlik` işi, DB-02'den sonra):
  - base'deki migration değiştirilemez / silinemez / yeniden adlandırılamaz;
  - eklenen her migration defterde ayrılmış, iptal edilmemiş, dosya adı birebir, `gecmis` (main/production) değil;
    production'a uygulanmışsa içerik SHA-256'sı değişmemiş;
  - defter geçmişi yalnız eklemeyle büyümüş;
  - migration içermeyen PR ağa çıkmadan PASS; migration varsa ve defter okunamıyorsa **sessiz PASS yok**.
  - Kip: `scripts/migrations/numara/yapilandirma.json` → `"zorunlu": false` (UYARI kipi: bulgular yazılır, çıkış 0).
    Owner onayıyla `true` yapılınca hata = CI FAIL.
- **Production uygulama kapısı** `scripts/migrations/numara/prod-kapi.mjs` (SQL çalıştırmaz; çalıştırıcı dışarıdan verilir):
  proje kimliği → defterde ayırma (etkin, `bagla` ile PR'a bağlanmış SHA-256 = commit blob'u) → işlem içinde çalışamayan komut
  yok → TEK İŞLEM: `pg_advisory_xact_lock` (eşzamanlı uygulamalar sıraya girer) + kilit altında geçmiş yeniden okunur (sürüm
  doluysa `YSM01`, hiçbir DDL çalışmaz) + migration gövdesi + `schema_migrations` kaydı aynı işlemde (DDL ve geçmiş birlikte
  kalır ya da birlikte geri alınır). Toplu `supabase db push` YOK.
  - **Atomik OLMAYAN tek nokta:** veritabanı COMMIT'i ile defterdeki `uygula` olayı iki ayrı sistemdir. Defter yazımı başarısız
    olursa production uygulanmıştır ama defter `pr` der → `uygulaDefter()` yeniden çalıştırılır. Numara zaten ayrılmış olduğundan
    başka işe verilemez (güvenlik açığı değil, yalnız durum gecikmesi).
  - İşlem içinde çalışamayan migration'lar (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE … ADD VALUE`, …) kapı tarafından
    REDDEDİLİR; bunlar için tek-işlem garantisi verilemez, ayrı planlı uygulama gerekir.

## Doğrulama (otomatik, `npm run test:migration-numara`)

- `git-eszamanlilik.harness.mjs` — gerçek git (geçici bare depo), ayrı süreçler aynı anda: 2 / 5 / 50 (40 ayrı klon + 10
  aynı klon) talep → hepsi benzersiz; ham CAS kanıtı (aynı ebeveynli ikinci push sunucuda reddedilir); ağ yok / push reddi →
  dosya oluşmaz; belirsiz sonuç → çift kayıt yok; eski dal; iptal edilen numara; aynı migration ikinci kez; dosyasız ayırma;
  defter kurcalama (satır silme) yakalanır.
- `ci-kapi.harness.mjs` — PR senaryoları: ayrılmış numara PASS; iki PR aynı numara; ayrılmamış numara; yeniden adlandırma /
  içerik değişikliği / silme; production'da kullanılmış numara; iptal; uygulanmış içerik değişti; defter okunamıyor (zorunlu FAIL,
  uyarı kipinde çıkış 0); kurcalanmış defter; migration içermeyen PR.
- `prod-kapi-pg.harness.mjs` — izole PostgreSQL: mutlu yol; geçmiş ayırmadan sonra doldu (YSM01, DDL yok); aynı sürüme eşzamanlı
  iki uygulama (tam biri); farklı sürümler danışma kilidiyle sıraya girer; DDL hatası iz bırakmaz; içerik / bağlama / iptal /
  proje / işlem-dışı komut kapıları.
- GitHub'ın kendisi (2026-11-27, geçici `tmp/migration-numara-cas-testi-*` dalı, test sonrası silindi): aynı ebeveynli ikinci
  push **reddedildi**, uç ilk yazanda kaldı.

## Etkinleştirme (Owner onayı gerekir — bu PR'da YAPILMADI)

1. **Dal koruması:** `refs/heads/migration-rezervasyon` için kural seti: `deletion` + `non_fast_forward` (PR zorunluluğu YOK;
   araç doğrudan push eder). Bu olmadan CAS yine çalışır, ama yetkili biri force push ile defter geçmişini yeniden yazabilir.
2. **Tohum:** production geçmişi salt-okunur alınır (`version|name`), ardından
   `npm run migration:numara -- tohumla --prod-gecmis <dosya>` → dal oluşur; main + production'daki tüm sürümler `gecmis` olur
   (2026-11-27 provası: 443 sürüm).
3. **Zorunlu kip:** `yapilandirma.json` → `"zorunlu": true` (ayrı PR).
4. Uygulayıcı betikler (`apply.mjs` / `kp-prod.mjs` türü) `prod-kapi.mjs`'i çağıracak biçimde güncellenir.

## Mevcut açık işler (2026-11-27)

- **PR #841** (`work/i18n-f1-r1`, `20280126000000_user_locale_prefs.sql`): numara production'da `member_access_restriction`'a
  ait → zorunlu kipte FAIL (provada doğrulandı). Yayından önce `yeni` ile numara alıp dosyayı yeniden adlandırmalı (o PR'ın
  sahibi oturum yapar; bu PR dokunmaz). 50 i18n / tanı dalı aynı dosyayı taşıyor.
- Eski dallarda main'de olmayan `20271121000000_astrology_provider_quarantine`, `20271125–27…_hd_education_*` dosyaları:
  production'da yok; main'in en büyük sürümünden küçük oldukları için DB-02 sıra kuralına zaten takılırlar → ihtiyaç olursa
  yeni numarayla yeniden oluşturulmalı.
- Yeni sistem açık PR'ları geriye dönük bozmaz: zorunlu kip açılınca, henüz merge edilmemiş ve migration ekleyen her PR için
  sahibi `yeni`/`ayir` ile numara alır (numara değişirse dosya yeniden adlandırılır — henüz base'de olmadığı için DB-03'ün
  "yeniden adlandırma yasağına" girmez).
