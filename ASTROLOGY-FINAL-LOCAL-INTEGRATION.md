# ASTROLOJİ — Son Yerel Entegrasyon (2026-10-10)

> **Sonuç:** Astroloji güncel main (H6a + HD Word pro) ile yerelde birleşti. Bütün testler ve build yeşil. **Açık P0 / P1 / P2 yok.**
> Production'a geçiş owner onayını bekliyor.

| | |
|---|---|
| Başlangıç SHA | `35bb3e7e` |
| Birleştirilen main | `origin/main` = `a157ec31` (#377 HttpOnly H6a `9923cfd6`, #375 HD Word profesyonel düzen) |
| Merge | `de19d0cd`: normal `--no-ff` merge, **çakışma yok**; rebase / force yok |
| Son SHA | bu raporun commit'i (`de19d0cd` üzerine) |
| Production / Frankfurt / Tokyo / Vercel env | **dokunulmadı** |
| Push / merge (GitHub) / deploy / production migration | **yok** |
| Gerçek Roxy çağrısı | **0** (toplam **50**) |
| Auth/session kodu | **değiştirilmedi** (yalnız Astroloji uyumu doğrulandı) |

**Owner kararları (kayıt):**
- Roxy kota kontrolü sonraya ertelendi; mevcut hak en az 9.900 çağrı.
- Vercel Pro'ya ilk ticari satıştan önce geçilecek.
- Gerçek Android testi production'a geçildikten hemen sonra, yalnız owner ve yetkili test hesabıyla yapılacak.

## 1. Birleştirmenin içeriği
- Main'den gelen 27 dosya: `lib/auth/**`, `app/layout.tsx`, `app/page.tsx`, `components/demo`, HD Word/rapor dosyaları ve testleri.
- **Astroloji dosyalarına dokunan bir değişiklik yok.**
- Paylaşılan dosyalar main'den yalnız Astroloji eklemeleriyle ayrılıyor: `app/page.tsx` +16, `package.json` +6. Statik kapsam testi satır satır denetliyor.
- **Main'de yeni migration ya da yedek değişikliği yok.**

## 2. HttpOnly uyumu (H6a ve bugünkü prod kill-switch)
Diğer oturumun bildirimi: H6a prod'da fresh-login regresyonu verdi. Prod'da kill-switch açık (`SESSION_COOKIE_WEB_HEADER=on`), yani web H5 davranışında; mod `primary`. **Prod env'deki `SESSION_COOKIE_*` değişkenlerine dokunulmadı ve dokunulmayacak.**

Astroloji istemcisi yalnız H5 yardımcılarını kullanıyor (`hasSessionCredential()`, `sessionTokenHeader()`), yani **iki modda da** çalışıyor. Birleşik build, yerel `next start` ve gerçek Chrome ile doğrulandı:

| Mod | `data-session-transport` | Astroloji isteği | Sonuç |
|---|---|---|---|
| H6a çerez taşıması | `cookie` | localStorage'da token **var ama gönderilmiyor** (`x-session-token` yok); kimlik HttpOnly çerez | Bilgi Bankası çağrısı (UI tıklaması) **200**, "Oturum bulunamadı" yok |
| Kill-switch (bugünkü prod) | `header` | Token başlığı gönderiliyor (H5) | UI **200**; çerezsiz yalnız başlık **200**; PDF **200** |
| Android (sunucu harness) | — | Çerez yok sayılır, token + başlık | 200 (httponly9c), Word/PDF 403 (report8) |

## 3. Migration doğrulaması
Birleşik kodda gerçek embedded PostgreSQL ile:

| Senaryo | Sonuç |
|---|---|
| pg7a (sıfırdan ×2, eski veri yükseltmesi) + çakışmada güvenli durma (beklenen-fail) | PASS |
| pg7b (sıfırdan 000000–000500 ×2 + liste ve silme) | PASS |
| pg9b (mevcut şema + eski KB → 000600 / 000700 ×2) | PASS |
| pg9c-A (sıfırdan 8 migration ×2) | PASS |
| pg9c-B (karma eski + yeni veritabanı, 000000–000700 ×2 yeniden; satır ve parmak izi, RLS, yetki, değişmezlik, tavan tetikleyicileri) | PASS |
| cap-concurrency (40 bağlantı, tavan−1 → 1 başarı, aşım 0; KB / profil / analiz) | 4/0 |

Toplam: 7 × RESULT PASS + EXPECTED-FAIL PASS.

## 4. Test sonuçları
Hepsi birleşik kodda, sıralı, `env -u ROXY_API_KEY`, zaman aşımıyla.

| Alan | Test | Sonuç |
|---|---|---|
| Astroloji | `npm run test:astrology` (21 harness) | **485 / 0** |
| | Word/PDF (report8) · Bilgi Bankası canlı (p2fix9b) · uzman yetkileri (perm7c) · tenant izolasyonu (phase7a/7c, httponly9c) · atomik tavan (p2fix9b + cap-concurrency) | test:astrology içinde, hepsi PASS |
| HttpOnly | h6a 19/0 · h5 30/0 · h1h4 29/0 · session-expiry-ux 27/0 · auth-session-p0 19/0 | PASS |
| Üye Yönetimi | faz1 check · faz2 check · 360 check (route 55/0) | PASS |
| Human Design | member 32/0 · tenant-scope PASS · presale-final 45/0 · word v2 182/0 · bilgi 83/0 · roxy 220/0 | PASS |
| | central-client | 126/1: yalnız bilinen P3 (L8: branch'te astrolog dosyası farkı; davranış hatası değil) |
| Danışan Yolculuğu | dy.harness (DY-A) 60/0 · wt7 unit 94/0 · wt7 dy-routes PASS · dy-presale-closeout routes 112/0 · dy-mobile-ux unit 23/0 | PASS |
| Silme güvenliği | delete-safety unit 88/0 · purge-route 33/0 · purge-db 57/0 | PASS |
| Yedekleme | backup.harness | 53/1: yalnız bilinen P3 (`admin_purge_context` sınıflandırılmamış; origin/main'de de aynı). Astroloji şema satırları (archived_at dahil) senkron |
| Tip / build | `tsc --noEmit` | 0 hata |
| | `next build` | PASS (Astroloji sayfa ve route'ları derlendi) |

**Askıda kalma önlemleri:**
- Testler tek tek, zaman aşımıyla koştu.
- PG bağlantıları kapandı; worktree'ye ait artık postgres süreci yok.
- Yerel sunucularım kapatıldı.
- Diğer oturumların süreçlerine dokunulmadı.

## 5. Açık bulgular
- **P0 / P1 / P2: yok.**
- Yeni P3: yok.
- Bilinen P3'ler yeniden açılmadı: `admin_purge_context` (main), HD L8 kapsam kontrolü, dev tohumunun `{}` snapshot satırları, HD analysis-flow sabit port.

## 6. Production sonrası gerçek Android kontrol listesi
**Kim:** yalnız owner ve yetkili test uzmanı. **Ne zaman:** canlıdan hemen sonra.

**Hazırlık:** test uzmanında `astrology` açık, `astrology_provider_interp` kapalı.

1. Android uygulamasında test uzmanıyla giriş yap. Astroloji kartı görünüyor mu?
2. Astroloji'yi aç: Çalışma Merkezi ve danışan listesi geliyor mu ("Oturum bulunamadı" ya da boş sayfa yok)?
3. Sentetik bir profil oluştur (saat bilinmiyor): kaydediliyor mu?
4. Kayıtlı bir analizi aç (Roxy harcamaz): tablolar geliyor mu, yorum bölümü "kapalı" mı?
5. Kayıtlı analiz ekranında **Word / PDF düğmesi görünmüyor** mu?
6. Uygulamayı kapat, 1 dk sonra aç: oturum duruyor mu, Astroloji yeniden giriş istemeden açılıyor mu?
7. Bilgisayardan (owner) bu uzmanın Astroloji iznini kapat. Telefonda yenileyince erişim kalkıyor mu? Sonra izni geri aç.
8. (İsteğe bağlı, **1 gerçek Roxy çağrısı**, owner onayıyla) yorum iznini aç, yeni bir natal hesapla: yorum bölümü görünüyor mu?
9. Çıkış yap: Astroloji adresi giriş ekranına yönlendiriyor mu?

Her adımın ekran görüntüsü alınır. Bu liste tamamlanmadan Android **PASS sayılmaz**. Sorun çıkarsa ilk müdahale: modülü yalnız o uzman için kapat ya da `ASTROLOGY_MODULE_ENABLED`'ı kapat (owner).

## 7. Freeze kalkınca, merge'den hemen önce son fark kontrolü
Diğer oturum "freeze kalktı" bildirdi. **Owner onayı olmadan yine de işlem yok.**

1. `git fetch origin` → `origin/main` hâlâ `a157ec31` mı? İlerlediyse:
   - `git log --oneline de19d0cd..origin/main`
   - `git diff --name-only <astro-merge>...origin/main`
2. Yeni farklarda `supabase/migrations/**`, `lib/auth/**`, `lib/backup/**`, `app/page.tsx`, `package.json`, `next.config.ts` ya da `lib/auth/moduleAccessCore.ts` / `modulePermissions.ts` varsa yeniden yerel merge yapılır ve şunlar koşulur:
   - `npm run test:astrology` (PG zinciri dahil), httponly h6a/h5, backup.harness, tsc, next build.
3. Main'e Astroloji'den **sonra** tarihli bir migration eklendiyse sıra yeniden değerlendirilir. Şu an Astroloji migration'ları (`20271101…`) repodaki en son migration'lar.
4. `git merge-tree --write-tree HEAD origin/main` çakışmasız olmalı.
5. Prod oturum durumu teyit edilir: kill-switch açık mı (H5 davranışı)? Astroloji iki modda da çalışıyor (§2); ek işlem gerekmez.

## 8. Production'a geçiş için güvenli işlem sırası (owner onayıyla, UYGULANMADI)
1. **Onay ve teyit:** owner'ın açık onayı; diğer oturumlarda devam eden prod işi yok; §7 fark kontrolü temiz.
2. **Frankfurt yedeği:** `pg_dump` (şema + veri). SHA256 ve satır sayıları kaydedilir.
3. **Yedek bütünlüğü:** SHA256 doğrulama + yerel geçici PG'ye geri yükleme denemesi.
4. **Prod deploy SHA'sını kaydet** (Instant Rollback hedefi).
5. **Migration öncesi salt-okunur kontrol:**
   - `astro_*` tabloları yok.
   - `clients_tenant_id_id_key` var.
   - `clients` kolonları beklendiği gibi.
   - Roller var.
   - `20271101%` uygulanmamış.
6. **Production migration** sırayla: `20271101000000` → `0100` → `0200` → `0300` → `0400` → `0500` → `0600` → `0700`. Her birinin sonucu kaydedilir. Sonra salt-okunur RLS, yetki ve tetikleyici doğrulaması.
7. **PR ve merge:** `work/astrology-roxy` → main (owner). Vercel production deploy READY, bölge fra1.
8. **Modül kapalıyken smoke:** `ASTROLOGY_MODULE_ENABLED` yok, `/api/astroloji/access` 404 dönmeli. Diğer modüllerde regresyon yok.
9. **Env (owner onayı):** `ASTROLOGY_MODULE_ENABLED=true`, sonra redeploy. `ROXY_API_KEY` HD ile ortak, zaten var. **`SESSION_COOKIE_*` değişkenlerine dokunulmaz.**
10. **Owner smoke:**
    - `/admin/astroloji` erişim, profil oluşturma, kayıtlı analiz açma, Word / PDF (masaüstü).
    - Test uzmanı (modül açık) 200; modül kapalı ve demo 404.
11. **Android gerçek cihaz testi** (§6).
12. **Roxy kullanımı izlenir.** Kota kontrolü owner kararıyla ertelendi; hak en az 9.900.

**Rollback:**
- **Önce:** `ASTROLOGY_MODULE_ENABLED` kapatılır (anında 404), gerekirse Vercel Instant Rollback.
- Astro tabloları DB'de kalır; zararsız ve izole.
- **Kör yedek geri yükleme yapılmaz.** Migration sonrası başka modüllere yazılan veri kaybolur.
- DB geri dönüşü yalnız astro nesnelerini düşürerek yapılır, gerçek Astroloji verisi yoksa ya da owner onaylarsa.
- `VACUUM (FULL)` gerekmez (prod'da eski astro verisi yok); ileride gerekirse ACCESS EXCLUSIVE kilit nedeniyle yalnız bakım penceresinde yapılır.

**Plan notu:** Vercel Pro'ya **ilk ticari satıştan önce** geçilecek. `engine/run` `maxDuration=300`; main'de 300 sn'lik route'lar bugün prod'da deploy oluyor, yani Fluid Compute açık.
