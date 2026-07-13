# CLAUDE ÇALIŞMA PROTOKOLÜ

> Bu dosya, bu repoda çalışan **her Claude oturumu** için **TEK DOĞRU** çalışma
> protokolüdür. Bu repo aynı anda birden fazla Claude oturumu ile
> geliştirilmektedir. Bir oturumun hatası tüm paylaşımlı `git index`'i ve diğer
> oturumların çalışmasını bozabilir. Bu nedenle aşağıdaki kurallar **istisnasız**
> uygulanır.
>
> **Öncelik:** Bu protokol ile `CLAUDE.md` / `AGENTS.md` çeliştiğinde, git ve
> commit güvenliği konularında bu dosya esas alınır. Diğer tüm konularda proje
> talimatları geçerlidir.

---

## Doküman Öncelik Sırası

Her Claude oturumu işe başlarken ve çalışırken aşağıdaki dokümanları **bu sırayla**
okur ve bu öncelikle esas alır. Üstteki doküman, alttakiyle çelişince **üstteki
kazanır**. Kod, her zaman en sonda gelir.

1. **`CLAUDE_PROTOCOL.md`** — Nasıl çalışılacağı (kurallar, git, güvenlik). Bağlayıcı sözleşme.
2. **`PROJECT_STATUS.md`** — Projenin güncel durumu ve doğrulanmış production referansları.
3. **`CURRENT_TASK.md`** — Şu an üzerinde çalışılan tek görev.
4. **`ARCHITECTURE_DECISIONS.md`** — Mimari kararların gerekçeleri.
5. **`CHANGELOG_AI.md`** — Alınan önemli kararların kronolojik günlüğü.
6. **Daha sonra kod.** — Yukarıdaki dokümanlar okunup içselleştirilmeden koda geçilmez.

### Yaşayan Doküman İlkesi

Bu dokümanlar **yaşayan dokümandır**. Yeni bir kural veya süreç değişikliği
olduğunda **önce ilgili doküman güncellenir, sonra geliştirmeye devam edilir**.
Sıra asla tersine çevrilmez: "önce kodu yapayım, sonra dokümana yazarım" yaklaşımı
yasaktır. Doküman, kaynağın kendisidir; kod onu takip eder.

---

## Amaç

Bu protokolün amacı:

- Birden fazla Claude oturumunun **aynı repo** üzerinde **çakışmadan** çalışmasını sağlamak.
- Paylaşımlı `git index` üzerinden **yabancı dosyaların** yanlışlıkla commit'lenmesini önlemek.
- Her değişikliğin **analiz → plan → onay → uygulama → doğrulama** akışıyla ilerlemesini garanti etmek.
- Geri alınması zor (irreversible) git işlemlerini tamamen yasaklayarak veri/geçmiş kaybını engellemek.
- Alınan önemli kararları izlenebilir kılmak ve kurumsal hafızayı korumak.

Bu protokol, hız için değil **güven ve tekrarlanabilirlik** için tasarlanmıştır.

---

## Temel Prensipler

1. **Önce analiz, sonra plan, sonra onay, sonra kod.** Sıra asla değişmez.
2. **Kullanıcı onayı olmadan** kod yazılmaz, commit yapılmaz, push yapılmaz.
3. **Kapsam izolasyonu:** Bir oturum yalnızca kendi görev kapsamındaki dosyalara dokunur.
4. **Path-scoped işlem:** Stage ve commit her zaman açık dosya yollarıyla yapılır. Toplu (`-A`, `.`) işlem yasaktır.
5. **Şeffaflık:** Yapılan her git işlemi öncesi ve sonrası çıktı ile raporlanır.
6. **Geri alınamaz işlem yok:** `reset`, `rebase`, `revert`, `--amend`, `--force` kullanılmaz.
7. **Şüphede DUR:** Beklenmeyen bir durum (yabancı staged dosya, çakışma, belirsizlik) görülürse işlem durdurulur ve rapor edilir.
8. **Diğer oturumlara saygı:** Başka bir oturumun dosyalarına, branch'lerine, worktree'lerine ve commit'lerine dokunulmaz.

---

## Analiz Süreci

Her göreve şu adımlarla başlanır:

1. **Görevi anla:** Kullanıcının ne istediğini netleştir. Belirsizlik varsa soru sor.
2. **Mevcut durumu incele:** İlgili dosyaları, mimariyi ve bağımlılıkları oku.
3. **Etki alanını belirle:** Değişikliğin dokunacağı dosyaların **tam listesini** çıkar.
4. **Kapsam dışını işaretle:** Dokunulmayacak alanları (özellikle diğer modüller) açıkça belirt.
5. **Riskleri tespit et:** Güvenlik, veri kaybı, geriye dönük uyumluluk, çoklu oturum çakışması.
6. **Planı yaz:** Adım adım ne yapılacağını, hangi dosyaların değişeceğini açıkça listele.
7. **Onay iste:** Plan olmadan uygulamaya geçilmez.

---

## Kod Yazma Kuralları

- Kod, **çevresindeki kodun stiliyle** uyumlu yazılır (isimlendirme, yorum yoğunluğu, deyimler).
- Yalnızca **görev kapsamındaki** dosyalar değiştirilir.
- Gereksiz refactor, "yol üstü temizlik" veya kapsam dışı iyileştirme **yapılmaz**.
- Her değişiklik **tek ve net bir amaca** hizmet eder.
- Bu proje standart Next.js değildir; kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehber okunur (bkz. `AGENTS.md`).
- Değişiklik tamamlandığında, dokunulan dosyaların listesi zihinde tutulur; commit tam olarak bu liste ile yapılır.

---

## Git Kuralları

Aşağıdaki komutlar **KESİNLİKLE YASAKTIR**. Hiçbir gerekçeyle kullanılmaz:

| Yasak Komut | Neden |
|---|---|
| `git add -A` | Yabancı/kapsam dışı dosyaları stage'ler |
| `git add .` | Yabancı/kapsam dışı dosyaları stage'ler |
| `git commit -a` | Tüm izlenen değişiklikleri commit'ler |
| `git reset` | Staged/commit durumunu bozar, diğer oturumları etkiler |
| `git rebase` | Geçmişi yeniden yazar, geri alınamaz |
| `git cherry-pick` | Kapsam dışı commit taşır, karışıklık üretir |
| `git revert` | Onaysız geçmiş değişikliği |
| `git commit --amend` | Var olan commit'i bozar, paylaşımlı geçmişi kirletir |
| `git push --force` | Uzak geçmişi ezer, veri kaybına yol açar |

**Kural:** Yukarıdaki komutlardan biri gerekiyor gibi görünüyorsa, bu bir **DUR ve rapor et** durumudur. Komut çalıştırılmaz; durum kullanıcıya anlatılır.

---

## Stage Kuralları

- Stage **yalnızca path-scoped** yapılır:

  ```bash
  git add -- dosya1 dosya2
  ```

- `--` ayıracı, dosya adlarının komut seçeneği olarak yorumlanmasını engellemek için **her zaman** kullanılır.
- Toplu stage (`git add -A`, `git add .`) **asla** kullanılmaz.
- Yalnızca göreve ait, önceden planlanmış dosyalar stage'lenir.
- Stage sonrası daima staged içerik doğrulanır (bkz. *Commit Öncesi Kontroller*).

---

## Commit Öncesi Kontroller

Commit'ten **önce** aşağıdaki üç kontrol **zorunludur**:

```bash
git status --short
git diff --cached --name-status
git diff --cached --check
```

- `git status --short` → Working tree ve stage'in genel durumunu gösterir.
- `git diff --cached --name-status` → Tam olarak nelerin stage'lendiğini listeler.
- `git diff --cached --check` → Whitespace/conflict marker gibi hataları yakalar.

**Doğrulama:** Staged dosya listesi, planlanan dosya listesiyle **birebir** aynı olmalıdır. Fazladan tek bir dosya bile varsa → **DUR** (bkz. *Hata Durumunda Yapılacaklar*).

---

## Commit Kuralları

- Commit **her zaman** açık dosya yollarıyla yapılır:

  ```bash
  git commit -m "..." -- dosya1 dosya2
  ```

- Commit mesajı **anlamlı ve kapsamlı** olur: ne yapıldığı, neden yapıldığı ve varsa güvenlik/etki notu.
- Bir commit **tek bir mantıksal değişikliği** kapsar; birbirinden bağımsız işler ayrı commit'lere bölünür.
- Commit mesajı `type(scope): kısa özet` biçimini takip eder (örn. `security(dogaltas): ...`, `feat(yasam-hafizasi): ...`).
- Commit'ten **sonra** doğrulama zorunludur:

  ```bash
  git show --name-status HEAD
  ```

  Bu çıktı, commit'in **yalnızca** planlanan dosyaları içerdiğini teyit etmek için okunur.

---

## Push Kuralları

Push **yalnızca kullanıcı onayı** ile yapılır. Push'tan **önce** uzak durum kontrolü zorunludur:

```bash
git fetch
git status -sb        # ahead / behind bilgisi
```

- **ahead** (yerel önde): Push'lanacak commit'ler doğrulanır.
- **behind** (uzak önde): **DUR.** Önce durum kullanıcıya raporlanır; `reset`/`rebase` yapılmaz.
- **diverged** (ıraksama): **DUR.** Kesinlikle `push --force` yapılmaz; durum raporlanır.

Push her zaman **normal** yapılır:

```bash
git push
```

`--force`, `--force-with-lease` ve benzeri zorlama bayrakları **yasaktır**.

---

## Çoklu Claude Kuralları

Bu repo aynı anda birden fazla Claude oturumu ile geliştirilir. Bu nedenle:

1. **Paylaşımlı index bilinci:** `git index` tüm oturumlarca paylaşılır. Bir oturumun stage'lediği dosya, başka oturumun `git add -A` komutuyla yanlışlıkla commit'lenebilir. Bu yüzden **yalnızca path-scoped** işlem yapılır.
2. **Yalnız kendi modülün:** Her oturum yalnızca kendi görev modülünü commit eder. Başka modülün working-tree değişikliğine **dokunulmaz**.
3. **Yabancı değişikliği koru:** `git status`'ta göreve ait olmayan değişiklikler görülürse, bunlar **olduğu gibi bırakılır** — stage'lenmez, geri alınmaz, silinmez.
4. **Branch/worktree izolasyonu:** Başka oturumun branch'ine, worktree'sine veya commit'ine dokunulmaz.
5. **Commit öncesi ve sonrası** daima staged/commit içeriği doğrulanır; yabancı dosya sızması anında yakalanır.
6. **İki-durumlu değerlendirme:** Başka bir modülün build/tsc hatası, senin modülünün commit'ini engellemez; kendi kapsamını izole doğrula ve durumu net raporla.

### İzole Worktree Zorunluluğu

Paralel AI oturumlarının her biri ayrı branch ve ayrı Git worktree içinde çalışır.
Ana çalışma ağacında geliştirme yapılmaz. Her oturum yalnız tahsis edilen worktree,
branch ve görev dosyalarıyla sınırlıdır.

### Yalnız Kendi Görevinden Sorumluluk

**Her Claude yalnız kendi görevinden sorumludur.** Başka bir Claude'un:

- ❌ Görevini **tamamlamaz**.
- ❌ Commit'ini **düzeltmez**.
- ❌ Dosyasını **düzenlemez**.
- ❌ Kodunu **iyileştirmez**.
- ❌ **"Hazır buradayken bunu da düzelteyim"** mantığıyla hareket **etmez**.

Başka bir oturumun işi eksik, hatalı veya iyileştirilebilir görünse bile, bu senin
görevin değildir. Gözlemini yalnızca **rapor** edebilirsin; müdahale edemezsin.
Kapsam disiplini, çoklu oturum ortamında en güçlü güvenlik mekanizmasıdır.

---

## Yasaklar

Aşağıdakiler **her koşulda yasaktır**:

- ❌ `git add -A`, `git add .`, `git commit -a`
- ❌ `git reset`, `git rebase`, `git cherry-pick`, `git revert`, `git commit --amend`
- ❌ `git push --force` (ve tüm zorlama bayrakları)
- ❌ Onaysız kod yazmak
- ❌ Onaysız commit
- ❌ Onaysız push
- ❌ Kapsam dışı dosya değiştirmek
- ❌ Başka oturumun dosya/branch/worktree/commit'ine dokunmak
- ❌ Yabancı staged dosya varken commit/push/reset/restore yapmak
- ❌ Geri alınamaz işlemleri "hızlı çözüm" için kullanmak

### Kapsam Dışı Temizlik / Refactor Yasağı

Repo genelinde aşağıdakiler **yasaktır**:

- ❌ Kullanılmayan import (unused import) temizliği
- ❌ Lint düzeltmeleri
- ❌ Format (formatting) düzeltmeleri
- ❌ Boş satır ekleme/çıkarma düzenlemeleri
- ❌ İsim değiştirme (rename)
- ❌ Dosya taşıma (move)
- ❌ Toplu refactor
- ❌ Genel kod temizliği

**Kural:** Yalnızca **verilen görev kapsamındaki** dosyalarda, **görevin
gerektirdiği** değişiklikler yapılır. Bir dosya "yol üstünde" olsa bile, görevle
doğrudan ilgili değilse ona dokunulmaz. Bu temizlikler gerekli görülüyorsa ayrı,
**onaylı** bir görev olarak ele alınır — mevcut görevle birleştirilmez.

---

## Raporlama Formatı

Her git işlemi ve her görev sonunda net rapor verilir. Standart rapor iskeleti:

```
### İşlem
<ne yapıldı>

### Kapsam (dosyalar)
- dosya1
- dosya2

### Doğrulama
- git status --short çıktısı özeti
- git diff --cached --name-status özeti
- git show --name-status HEAD özeti (commit sonrası)

### Sonuç
✅ Başarılı / ⚠️ Uyarı / ❌ Durduruldu (gerekçe)
```

Rapor kısa, dürüst ve kanıta dayalı olur. Test başarısızsa "başarılı" denmez; çıktı ile birlikte belirtilir.

---

## Çalışma Akışı

Standart uçtan uca akış:

1. **Analiz** — Görevi anla, ilgili kodu oku, etki alanını çıkar.
2. **Plan** — Adımları ve dokunulacak dosyaları listele.
3. **Onay** — Kullanıcıdan planı onaylat. *(Onay yoksa dur.)*
4. **Uygulama** — Yalnızca planlanan dosyalarda değişiklik yap.
5. **Yerel doğrulama** — Derleme/tip kontrolü/ilgili testler (kapsam-izole).
6. **Stage** — `git add -- <dosyalar>` (path-scoped).
7. **Commit öncesi kontrol** — `status --short`, `diff --cached --name-status`, `diff --cached --check`.
8. **Commit onayı** — Kullanıcıdan commit onayı al.
9. **Commit** — `git commit -m "..." -- <dosyalar>`.
10. **Commit sonrası doğrulama** — `git show --name-status HEAD`.
11. **Push onayı** — Kullanıcıdan push onayı al.
12. **Push öncesi kontrol** — `git fetch`, ahead/behind.
13. **Push** — `git push` (normal).
14. **Rapor** — Standart formatta özet.

Her aşamada bir sapma görülürse akış durur ve rapor edilir.

---

## Karar Alma Kuralları

- **Belirsizlik varsa sor.** Varsayımla ilerlemek yerine netleştir.
- **Küçük, tersine çevrilebilir kararlar** için makul varsayımla ilerle ve raporda belirt.
- **Büyük, geri alınamaz veya dışa dönük kararlar** için mutlaka onay al.
- **Mimari/kapsam etkisi olan kararlar** `CHANGELOG_AI.md`'ye kaydedilir.
- **Güvenlik kararlarında** en güvenli seçenek (fail-closed) tercih edilir.
- Bir karar başka bir modülü etkileyecekse, o modülün oturumunu/sahibini engellemeyecek şekilde izole edilir.

---

## Hata Durumunda Yapılacaklar

### Yabancı staged dosya tespit edilirse

Bu, çoklu oturum ortamının en kritik hata senaryosudur. Görülürse:

- **DUR.**
- ❌ Commit yok.
- ❌ Push yok.
- ❌ `reset` yok.
- ❌ `restore` yok.
- ✅ Yalnızca **rapor** ver: hangi yabancı dosyalar staged, hangileri senin kapsamına ait.
- Kullanıcıdan talimat bekle.

### Genel hata durumları

- **Push behind/diverged:** Dur, raporla, zorlama yapma.
- **Beklenmeyen merge conflict:** Dur, durumu raporla, kapsam dışına dokunma.
- **Build/test hatası:** Kök nedeni araştır; kapsam-izole doğrula; sonucu dürüst raporla.
- **Emin olmadığın herhangi bir git durumu:** Dur ve sor. Tahminle geri-alınamaz komut çalıştırma.

**Altın kural:** Şüphe anında verilecek doğru yanıt her zaman **"DUR ve raporla"**dır — "düzeltmeye çalış" değil.

---

## Güvenlik Kuralları

- **Sırlar (secrets) asla** koda veya commit'e gömülmez, loglara yazılmaz.
- Yeni uçlar (endpoint) **kimlik doğrulaması** ve gerektiğinde **yetki (admin/tenant)** kontrolüyle korunur.
- **Fail-closed** yaklaşımı esastır: yetki belirsizse erişim reddedilir.
- Tarayıcıdan `anon key` ile **PII/hassas veri** okuma/yazma yapılmaz; bu işlemler `service_role` ile korunan sunucu route'larına taşınır.
- Body whitelist, giriş doğrulama ve boyut/format sınırları uygulanır.
- Güvenlik değişiklikleri **kendi kapsamında** izole commit'lenir; başka modül dosyaları karıştırılmaz.
- DB seviyesi RLS/REVOKE gibi işlemler ayrı ve **onaylı** aşamalarda ele alınır.

---

## Büyük Dersler (Lessons Learned)

### Vaka: `83adab2` — Karışık (mixed) Commit Olayı

#### Ne oldu?

`83adab2` commit'i, **Doğaltaş** modülüne ait bir güvenlik düzeltmesiydi:
"Taş Bilgi Kütüphanesi" ekranı `stone_knowledge_categories` tablosunu tarayıcıdan
`anon key` ile okuyup yazıyordu; bu, kimlik doğrulamalı bir sunucu route'una
(`/api/dogaltas/knowledge/categories`) taşındı. Commit'in **asıl kapsamı** yalnızca
şu iki dosya olmalıydı:

- `app/api/dogaltas/knowledge/categories/route.ts`
- `app/dogaltas/tas-bilgi-kutuphanesi/page.tsx`

Ancak commit'e, **başka bir oturumun** (YAŞAM HAFIZASI™ / indexer) working-tree'de
duran, tamamen ilgisiz iki dosyası da karıştı:

- `lib/yasam-hafizasi/indexer/sources.ts`
- `lib/yasam-hafizasi/indexer/tenantResolve.ts`

Sonuç: Doğaltaş güvenlik commit'i, `yasam-hafizasi` indexer değişikliklerini de
içererek **iki farklı modülün işini tek commit'te** birleştirdi.

#### Neden oldu?

- Bu repo **birden fazla Claude oturumu** ile paralel geliştiriliyor ve tüm
  oturumlar **aynı paylaşımlı `git index`**'i kullanıyor.
- Commit sırasında **toplu stage** (`git add -A` / `git add .`) veya kapsam
  doğrulaması yapılmadan geniş bir commit yaklaşımı kullanıldığında, o an working
  tree'de duran **yabancı dosyalar** da stage'e/commit'e dahil oldu.
- **Commit öncesi** `git diff --cached --name-status` doğrulaması ile staged listenin
  planlanan liste ile karşılaştırılması yapılmadığı için sızma anında yakalanamadı.
- **Commit sonrası** `git show --name-status HEAD` teyidi yapılsaydı bile, ancak
  commit atıldıktan sonra fark edilirdi.

#### Nasıl çözüldü / ele alındı?

- Geçmiş **yeniden yazılmadı**: `reset`, `rebase`, `revert`, `--amend` gibi
  geri-alınamaz düzeltmeler kullanılmadı (bunlar diğer oturumları ve paylaşımlı
  geçmişi daha da bozardı).
- Olay, kurumsal hafızaya işlendi ve bir daha yaşanmaması için **kesin git
  kapsam kuralları** protokole eklendi. Kök neden "insan hatası" değil, **süreç
  eksikliği** olarak ele alındı ve süreç sıkılaştırıldı.

#### Bir daha olmaması için getirilen kurallar

1. **Toplu stage yasağı:** `git add -A`, `git add .`, `git commit -a` **kesinlikle** kullanılmaz.
2. **Path-scoped zorunluluğu:** Stage ve commit yalnızca açık dosya yollarıyla yapılır:
   `git add -- <dosyalar>` ve `git commit -m "..." -- <dosyalar>`.
3. **Commit öncesi zorunlu doğrulama:** `git status --short`, `git diff --cached --name-status`,
   `git diff --cached --check` çalıştırılır; staged liste planlanan liste ile **birebir** eşleşmelidir.
4. **Commit sonrası zorunlu teyit:** `git show --name-status HEAD` ile commit'in yalnızca
   planlanan dosyaları içerdiği doğrulanır.
5. **Yabancı staged dosya → DUR:** Kapsam dışı bir dosya staged görülürse commit/push/reset/restore
   yapılmaz; yalnızca rapor verilir.
6. **Çoklu oturum izolasyonu:** Her oturum yalnızca kendi modülünü commit eder; başka modülün
   working-tree değişikliğine dokunmaz.

#### Alınan ders (özet)

> Paylaşımlı `git index` ortamında **güvenli varsayılan yoktur**. Güvenlik,
> her commit'te **açık dosya listesi** ve **öncesi/sonrası doğrulama** ile
> kazanılır. Geri-alınamaz git komutları bir "düzeltme aracı" değil, bir
> **risk kaynağıdır**; şüphede tek doğru hamle **DUR ve raporla**dır.
