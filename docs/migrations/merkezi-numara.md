# Merkezi Migration Numarası (DB-03)

Paralel çalışan oturumların aynı migration numarasını almasını, bağlanmış SQL'in sessizce değişmesini ve bir PR'ın başka
PR'ın numarasını sahiplenmesini **teknik olarak** engelleyen sistem. Ücretli / harici hizmet yok: yalnız GitHub deposu ve `git`.

## Neden

DB-02 (`scripts/ci/migration-naming-check.mjs`) yalnız PR'ın kendi deposunu görür: başka dalları, açık PR'ları ve production
geçmişini görmez; mevcut migration'ların değiştirilmesini de yakalamaz. Paralel oturumlar aynı "sıradaki numarayı" seçebiliyordu
(KP Transit PR #860: `20280126000000` ve `20280127000000` başka işlere gitti). DB-03 DB-02'yi **tamamlar**, onu değiştirmez.

## Kullanım (Claude Code / geliştirici)

```bash
# 1) Numara al + dosyayı oluştur (numara alınamazsa HİÇBİR dosya yazılmaz). Ana dalda değil, iş dalında çalıştırın.
npm run migration:numara -- yeni --modul atlas --ad kp_transit_ornek
#   AYRILDI: 20280128000100 → 20280128000100_kp_transit_ornek.sql
# 2) SQL'i yazın → commit → push → PR açın. Sonra içeriği PR'a BAĞLAYIN (PR no + dal + depo + commit'teki blob SHA-256):
npm run migration:numara -- bagla --surum 20280128000100 --pr 870
# 3) SQL her değiştiğinde: commit → yeniden `bagla` (aynı PR). Bağlamadan push edilen değişiklik CI'da FAIL olur.

npm run migration:numara -- liste             # etkin ayırmalar (dosyası bu kopyada olmayanlar işaretli)
npm run migration:numara -- iptal --surum S --neden "vazgeçildi"   # numara bir daha VERİLMEZ
npm run migration:numara -- dogrula           # defter dalının TÜM geçmişi: doğrusal + yalnız ekleme + geçerli geçişler
```

Numara **seçilmez**, sistem verir. Aynı (modül, ad, dal) için ikinci `yeni` yeni numara vermez; mevcut ayırmayı döndürür.
Production'a uygulama YALNIZ `scripts/migrations/numara/uygula-prod.mjs` ile ve Owner onayıyla yapılır (aşağıda).

## Sık sorular

- **Numarayı elle yazıp dosya oluşturdum.** Zorunlu kipte CI FAIL ("ayrılmamış"). `yeni` ile numara alın, dosyayı o ada taşıyın
  (dosya henüz base'de olmadığı için yeniden adlandırma serbesttir).
- **PR numarası henüz yok.** `yeni` → SQL → commit → PR aç → `bagla --pr N`. Bağlanmamış ("ayrildi") migration zorunlu kipte geçmez.
- **SQL'i değiştirdim.** Commit edin ve `bagla`'yı yeniden çalıştırın. CI, PR'daki dosyanın git blob SHA-256'sını defterle karşılaştırır.
- **Windows CRLF?** Özet çalışma kopyasından değil, commit'teki **git blob**'dan alınır → satır sonu ayarı sonucu değiştirmez.
- **PR'ı kapattım, işi başka PR / dala taşıyorum.** `bagla --surum S --pr YENI --devir --neden "…"`. Devirsiz başka PR/dal RED;
  devir defterde kalıcı ve görünür.
- **İki PR aynı dosyayı taşıyor.** Yalnız defterde bağlı olan PR geçer; diğeri "PR #X'e bağlı; bu PR #Y" ile FAIL.
- **Başkasının numarasını kullanabilir miyim?** Hayır: numara + dosya adı + PR + dal + depo + SHA birlikte doğrulanır.
- **Eski bir migration'ı düzeltmem gerek.** Base'deki migration değiştirilemez / silinemez / yeniden adlandırılamaz; yeni migration ekleyin.
  Eski bir migration'ın içeriğini yeni numarayla kopyalamak da RED (aynı blob).
- **Defter okunamıyor (ağ / GitHub kesintisi).** Migration içeren PR zorunlu kipte FAIL (sessiz PASS yok); migration içermeyen PR etkilenmez.
- **Fork'tan PR.** Migration ekleyemez (deftere yazamaz, sahiplik kanıtlanamaz).
- **Numara aldım ama vazgeçtim.** `iptal --neden`. Numara sonsuza dek kullanılmaz; bir sonraki iş yeni numara alır.
- **Ana dal / production geçmişi ilerledi.** Numara her ayırmada güncel main + defter (+ verilirse production listesi) üzerinden
  hesaplanır; eski dal da güncel numarayı alır. Önceden alınmış numara geçerli kalır (sıra DB-02 kuralına tabidir).
- **İşlem içinde çalışamayan SQL (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, `VACUUM` …).** Uygulama kapısı RED eder;
  Owner onaylı ayrı planla uygulanır.
- **Uygulama sırasında bağlantı koptu.** Veritabanı işlemi tamamsa defter `pr` kalmış olabilir → `uygula-prod.mjs uzlastir`.
- **PR merge oldu, SQL'de hata gördüm.** Merge edilmiş migration yeniden bağlanamaz (`MAINDE`); yeni migration ekleyin.
- **Sembolik bağlantı / alt modül olarak migration?** RED: içerik git'te değildir, bağlanamaz.

## Mimari

- **Defter:** uzak depoda ayrı dal `migration-rezervasyon`, tek dosya `rezervasyonlar.jsonl`. Olaylar: `gecmis` (main /
  production'da önceden kullanılmış), `ayir`, `bagla`, `uygula`, `iptal`. Satır silinmez / değiştirilmez; durum olaylardan
  türetilir. Kişisel veri / sır yok (kimlik = git `user.name@makine`, işlem kimliği UUID).
- **Durum makinesi (her okumada tüm geçmiş için zorunlu):** `ayir` yalnız bir kez, dosya adı sürümle aynı; `bagla` yalnız
  ayrılmış + uygulanmamış + iptal edilmemiş numaraya, PR (pozitif tamsayı) + SHA-256 (64 hex) + `sahip/depo` + dal zorunlu;
  sahip değişimi yalnız `devir` + `neden`; `uygula` yalnız bağlı numaraya ve bağlı SHA ile, proje kimliğiyle; `iptal` neden
  zorunlu; `uygula` / `iptal` sonrası hiçbir olay yok. Tutarsız tek satır bile → tüm defter güvenilmez, tahsis durur.
- **Atomik ayırma (karşılaştır-ve-değiştir):** uç işleme özgü geçici ref'e çekilir, numara defterin O TAM içeriğine + main'e
  göre hesaplanır, satır `commit-tree -p <uç>` ile eklenir ve **force olmadan** push edilir. Sunucu yalnız ileri-sarmayı
  kabul eder (GitHub'da kanıtlandı); arada yazan olduysa push reddedilir, araç yeniden okur ve tekrar dener (varsayılan 200
  deneme, rastgele bekleme). Belirsiz sonuçta (push sunucuda kabul, istemci hata gördü) işlem kimliği defterde aranır → çift
  kayıt yok.
- **Defter bütünlüğü:**
  - her yeni uç, son doğrulanan uca göre **artımlı** doğrulanır (tek ebeveyn, ata ilişkisi, her commit önceki içeriğin
    öneki + geçerli yeni satırlar). Doğrulanan uç yerelde `refs/migration-numara/dogrulanmis/*` altında tutulur.
  - **dal silindi** (`DEFTER_SILINDI`), **geçmiş yeniden yazıldı** (`YENIDEN_YAZILDI`), **satır silindi / değişti**
    (`SILME`), **birleştirme / doğrusal olmayan geçmiş** (`BIRLESTIRME` / `DOGRUSAL_DEGIL`), **çapa yok** (`CAPA`) → tahsis DURUR; boş defterle yeniden başlamaz.
  - **geri sarma** (uç, doğrulanan ucun atasına force ile alındı): önce eski okuma sayılır ve yeniden okunur (aynı klasördeki
    eşzamanlı süreçler); uzak taraf ısrarla gerideyse `YENIDEN_YAZILDI`. Önbellek yalnız ileri taşınır (karşılaştır-ve-değiştir).
  - tohumlanmamış defter (`TOHUMSUZ`) numara vermez.
  - `yapilandirma.json` → `"capa"`: etkinleştirmede main'e yazılan güvenilir defter commit'i. CI ve araç, defter ucunun bu
    commit'i içerdiğini denetler → ilk kez gören makine / CI de yeniden kurulmuş bir defteri reddeder.
- **Numara kuralı:** bilinen en büyük sürüm (defter, iptaller dahil + main + çekilen dallar + production) + 1 dakika ızgarası.
- **CI kapısı** `scripts/ci/migration-reservation-check.mjs` (`guvenlik` işi, DB-02'den sonra). Kapı betiği ve
  `yapilandirma.json` **base daldan** alınır (`git archive` + `--yapilandirma-rev`): PR kapıyı, kipi ya da defter ref'ini
  değiştirerek denetimi kapatamaz. Okunan defter metni ile doğrulanan geçmiş aynı uç commit'ine aittir.
  - PR bağlamı (PR no, kaynak dal, kaynak/hedef depo) YALNIZ GitHub'ın olay dosyasından (`GITHUB_EVENT_PATH`); PR açıklaması
    ya da depo dosyası kanıt değildir. Olay `pull_request` değilse / dosya yoksa ve PR migration ekliyorsa → FAIL.
  - base'deki migration değiştirilemez / silinemez / yeniden adlandırılamaz; eklenen içerik base'deki bir migration'ın kopyası olamaz;
  - eklenen her migration: ayrılmış, `gecmis`/iptal değil, dosya adı birebir, **bağlı** (PR = olaydaki PR, dal = head.ref,
    depo = base depo), defter SHA-256 = PR commit'indeki blob SHA-256, aynı SHA başka numaraya bağlı değil; fork → FAIL;
  - defterin tüm geçmişi doğrulanır + çapa;
  - push (main): main'deki `gecmis` olmayan her migration bağlı/uygulanmış ve SHA eşleşmeli (yalnız zorunlu kipte);
  - migration içermeyen PR ağa çıkmadan PASS. CI deftere YAZMAZ, production sırrı kullanmaz (yalnız `contents: read`).
  - **CI'ın doğrulayamadıkları:** defter imzasızdır — depoya yazma yetkisi olan biri olay ekleyebilir (geçmişi değiştiremez, kural
    setiyle force/silme de engellenir). Kimlik alanı (`user.name@makine`) beyandır, kanıt değildir. İş akışı dosyasının
    (`ci.yml`) kendisi PR ile değiştirilebilir; bunu yalnız zorunlu inceleme / CODEOWNERS engeller (tek admin hesabıyla
    teknik olarak zorlanamaz → Owner incelemesi). Çapa (`capa`) ayarlanana dek, tutarlı biçimde baştan yeniden kurulmuş
    bir defteri ilk kez gören makine / CI ayırt edemez.
  - Kip: `yapilandirma.json` → `"zorunlu": false` (UYARI: bulgular yazılır, çıkış 0). Owner onayıyla `true` → bulgu = FAIL.
- **Production uygulama kapısı** `prod-kapi.mjs` + tek uygulama yolu `uygula-prod.mjs`:
  - kapılar: proje kimliği · DOĞRULANMIŞ defter (tüm geçmiş + çapa) · GÜNCEL production geçmişi okunmuş · uygulanan commit
    **`origin/main` içinde** (`MAIN_DEGIL`: incelenip merge edilmemiş SQL uygulanmaz) · defterde ayırma, `pr` durumunda, bağlı
    PR + SHA · o commit'teki blob SHA-256 = bağlı SHA · production geçmişindeki her sürüm defterde `gecmis`/`uygulandi`
    (değilse `UZLASMA`: kapı dışı uygulama ya da uzlaştırma bekliyor, dur) · sürüm production'da yok · SQL yapısı;
  - SQL yapısı: sözcük çözümleyici (yorum, iç içe blok yorum, dizge, yalnız bitişik `E''` kaçışı, tırnaklı ad, `$etiket$`
    gövdeleri; Türkçe karakter / `$` içeren tanımlayıcılar dolar-tırnak sanılmaz; `standard_conforming_strings` işlem içinde
    `on` yapılır ve gövdede değiştirilemez) → ilk deyim `BEGIN`, son deyim `COMMIT`; arada hiçbir işlem denetim deyimi
    (`commit`, `end`, `rollback`, `savepoint`, `begin`, … büyük/küçük harf; `BEGIN ATOMIC` gövdeleri de) ve işlem dışı komut
    yok; `COMMIT` sonrası deyim yok; dizge dışında ters eğik çizgi (psql `\gexec`, `\!`, `\i` …) yok;
  - ön koşullar yalnız beyaz liste: `to_regclass|to_regtype|to_regprocedure|…('ad') IS [NOT] NULL`, `AND`/`OR`/`NOT` ile;
  - TEK İŞLEM: `lock_timeout` → `pg_advisory_xact_lock(7314202811)` → kilit altında geçmiş (doluysa `YSM01`) → şema ön koşulları
    (`-- onkosul: <boolean SQL>`; sağlanmazsa `YSM02`) → gövde → `supabase_migrations.schema_migrations` kaydı (Supabase CLI
    biçimi: `version`, `name`, `statements` = dosyanın tam metni, `created_by = "migration-numara pr#N sha256:…"`) → `COMMIT`;
  - varsayılan **kuru çalıştırma**; `--uygula` olmadan yazma yok; production bağlantısı yalnız `--conn-mjs` (owner arşivi), `--dsn`
    yalnız localhost;
  - **atomik OLMAYAN nokta:** DB COMMIT ile defter `uygula` olayı iki sistemdir. Defter yazılamazsa (ya da psql zaman aşımı:
    `UYGULAMA_BELIRSIZ`, yeniden deneme yok) production'daki imza (PR + SHA) **ve kayıtlı metnin SHA-256'sı** bağlı SHA ile
    eşleşirse `uygula-prod.mjs uzlastir` olayı tamamlar; diğer her uyumsuzluk yalnız RAPOR edilir.
  - **Sınırlar:** imza ve kayıtlı metin DB'ye yazabilen biri tarafından taklit edilebilir (uzlaştırma kanıt değil tutarlılık
    denetimidir); proje kimliği `conn.mjs`'in bildirdiği değerdir (sunucudan sorgulanmaz); gövdeden dblink / pg_background
    gibi eklentilerle işlem dışı iş yapılabilir (production'da kurulu değillerse risk yok).
  - Tekrar uygulama: defter (`UYGULANMIS`), kapı (`PROD_DOLU`) ve işlem içi kilit (`YSM01`) üç ayrı katmanda engellenir.

## Doğrulama (otomatik, `npm run test:migration-numara`)

- `git-eszamanlilik.harness.mjs` (40) — gerçek git + ayrı süreçler: tohumsuz defter; tohum raporu; ham CAS; farklı / aynı modül;
  50 eşzamanlı (40 klon + 10 ortak klasör); push kabul + bağlantı kopması; geçici sunucu hatası; erişilemeyen sunucu; sürekli
  push reddi; yarıda kesilip yeniden başlama + tekrar gönderim; eski dal; iptal + ayırma yarışı; production ilerlerken ayırma;
  yanlış SHA / PR / sahiplenme / devir; uygulanmış numaraya olay; belirsiz sonuç; force ile yeniden yazma; satır silme; dal
  silme; geri sarma; çapa; kurcalanmış durum.
- `ci-kapi.harness.mjs` (34) — GitHub olay dosyasıyla: meşru PR; bağlanmamış; bağlamadan sonra SQL değişti + yeniden bağlama;
  yeni commit; CRLF; aynı dosya iki PR; aynı numara farklı dosya; yanlış PR no; fork; yanlış olay; sahte/eksik bağlam;
  başka dala bağlanmış; ana dal ilerledi; eski migration yeniden adlandırma / silip yeniden oluşturma / silme / içeriği yeni
  numarayla kopyalama; aynı SQL iki numarada; production numarası; ayırmasız dosya; iptal; uygulanmış içerik değişti; defter
  erişilemez (zorunlu / uyarı / yapılandırmadan zorunlu); sembolik bağlantı; PR'ın kipi kapatması (base yapılandırması);
  migration içermeyen PR; kurcalanmış defter; main push kipi; merge sonrası yeniden bağlama.
- `prod-kapi-pg.harness.mjs` (36) — izole PostgreSQL: Supabase biçimi; tekrar; yarış (YSM01); kapı dışı sürüm (UZLASMA);
  geçmiş okunmadan; ana dalda olmayan commit (MAIN_DEGIL); deftere yazılmamış uygulama + uzlaştırma; sahte imza; aynı sürüme eşzamanlı iki uygulama; danışma kilidi sırası; DDL hatası tam geri alma; ön koşul (YSM02);
  DB commit + defter kopması + uzlaştırma; küçük harf `commit;`, gövdede ROLLBACK/BEGIN, COMMIT sonrası deyim, `$f$` içi metin,
  CONCURRENTLY; `uygula-prod.mjs` kuru çalıştırma / yanlış proje / uzak DSN reddi / `--uygula` / tekrar / uzlaştırma.

## Etkinleştirme (Owner onayı gerekir — bu PR'da YAPILMADI)

1. **Kural seti** (ayrı, yeni ruleset; `main-koruma`'ya dokunulmaz): hedef `refs/heads/migration-rezervasyon`, kurallar
   `deletion` + `non_fast_forward`, bypass yok. PR zorunluluğu / gerekli kontrol EKLENMEZ (araç doğrudan push eder).
   Not: tüm oturumlar aynı Owner kimliğiyle push ettiğinden kural seti oturumları ayırt edemez; koruduğu şey silme ve geçmiş
   yeniden yazmadır (yazma yetkisini genişletmez, CI yalnız okur).
2. **Tohum:** production geçmişi salt-okunur alınır (`version|name`) →
   `npm run migration:numara -- tohumla --prod-gecmis <dosya> --rapor <json>` (2026-11-27 izole provası: 443 sürüm,
   ilk yeni numara `20280128000100`).
3. **Çapa + zorunlu kip** (ayrı PR): `yapilandirma.json` → `"capa": "<tohum commit'i>"`, `"zorunlu": true`.
4. Production uygulamaları yalnız `uygula-prod.mjs` ile; eski paket uygulayıcıları (`apply.mjs`, `kp-prod.mjs`, `efm-prod.mjs`
   türü, envanter: kanıt klasörü) emekliye ayrılır.

## Mevcut açık işler (2026-11-27)

- **PR #841** (`work/i18n-f1-r1`, `20280126000000_user_locale_prefs.sql`): numara production'da `member_access_restriction`'a
  ait → zorunlu kipte FAIL (provada doğrulandı). Yayından önce `yeni` ile numara alınıp dosya taşınmalı (o PR'ın sahibi yapar).
- Tarihsel: main'de aynı sürümü taşıyan 16 sürüm (2–3 dosya); production'da olup main'de olmayan 68 sürüm; main'de olup
  production geçmişinde olmayan 253 sürüm. Hepsi `gecmis` olarak korunur, hiçbiri yeniden verilmez, hiçbiri değiştirilmez.
- Zorunlu kip açılınca merge edilmemiş, migration ekleyen her PR'ın sahibi numara alıp bağlamalıdır.
