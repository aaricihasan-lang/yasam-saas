# BF-12B — Satış Öncesi Tam Yedekleme Aracı — Runbook

> **Amaç:** Satış öncesi **güvenli, tam-doğruluklu (full-fidelity) yedek** almak.
> **Bu bir cleanup aracı DEĞİLDİR.** Hiçbir veri silmez/değiştirmez.
> **Gerçek production backup çalıştırması AYRI, açık kullanıcı onayı gerektirir.**

Bu araç **local-only**dir: web endpoint'i yoktur, tarayıcıdan başlatılamaz, uygulama
runtime'ına dokunmaz. Yalnız operatörün makinesinde CLI olarak çalışır.

---

## 1. Ne yapar / ne yapmaz

Üretir (gerçek run'da):
- **Encrypted database archive** (AES-256-GCM, canonical JSON, sayfalı, truncation YOK)
- **Encrypted Storage binary archive** (opaque adlı, SHA-256 doğrulamalı)
- **İnsan-okunur Word arşivi** (restore kaynağı DEĞİL; PII içerir)
- **Public / private manifest**, **checksum**, **schema/FK fingerprint**, **restore planı**
- **Restore dry-run doğrulaması** + **archive validator**
- `COMPLETE` işaretçisi **yalnız tüm doğrulamalar PASS** olduğunda

Yapmaz:
- Gerçek restore (executor **yoktur**), cleanup, DELETE/UPDATE/INSERT, DDL, migration
- Storage delete/upload/update (yalnız list/read/download)
- Production write; Vercel env değişikliği

---

## 2. Gerekli kimlik bilgileri (isimler; değerleri repoya YAZILMAZ)

| Amaç | Nasıl verilir |
|---|---|
| DB read (salt-okunur) | **Yalnız env ADI**: `--db-url-env BF12B_DB_URL`. Gerçek DB URL değeri **argümanda verilmez**; `process.env`'den okunur. Ham `--db-url <değer>` production'da **reddedilir**. |
| Storage read | `--supabase-url <URL>` + service_role key **yalnız env** `--service-key-env BF12B_SERVICE_ROLE_KEY` (değer `process.env`'den) |
| Şifreleme passphrase | **yalnız** `--passphrase-file <dosya>` (argv/asla) |
| Proje doğrulaması | `--project-ref <ref>` |

env adı allowlist: `^[A-Z][A-Z0-9_]*$`. Env tanımsızsa **bağlantı kurulmadan** fail-closed.
Hata/log/manifest/Word/validation report **hiçbir** DB URL / host / user / password / key
göstermez (redaction uygulanır).

**Saklamayın:** bu değerleri repo/worktree/commit/log içine. `.env*`, `*.passphrase`,
`*.backup.enc` `.gitignore`'dadır. Service key/DB URL **echo edilmez**.

> **`pg` proje bağımlılığıdır** (`package.json` + `package-lock.json`, devDependency)
> ve `@types/pg` ile birlikte gelir. Temiz checkout + **normal bağımlılık kurulumu**
> sonrası araç hazırdır — gerçek run öncesi **ayrıca elle `pg` kurulumu GEREKMEZ**.
> Storage için mevcut `@supabase/supabase-js`, Word için mevcut `docx` kullanılır.

---

## 3. Passphrase güvenliği

- AES-256-GCM + scrypt (N=2^15). **Passphrase kaybolursa arşiv AÇILAMAZ** — güvenli sakla.
- Min. 16 karakter (araç zorlar). Argv'de verilemez; yalnız dosyadan.
- Key buffer bellekte best-effort sıfırlanır. Public manifestte passphrase/secret yok.

---

## 4. Çıktı klasörü güvenliği

- Çıktı **repo/worktree DIŞINDA**, **yeni/boş** bir klasör olmalı (araç default üretmez).
- Dolu klasör üzerine yazılmaz (fail-closed, overwrite yok). Symlink escape reddedilir.
- Atomik: önce `.bf12b-tmp-*`, başarıda `rename` ile final klasöre.
- **Öneri:** çıktıyı **harici disk**te tut; **en az iki ayrı güvenli ortamda** sakla.
- Word belgeleri **düz PII** içerir — şifreli/erişimi kısıtlı ortamda tut.

---

## 5. Komutlar

```bash
# Sentetik fixture backup + validate (gerçek veri YOK) — güvenli, her zaman çalışır
npm run yh:bf12b:fixture

# 30 senaryoluk tek kapsamlı harness (PASS/BLOCKED)
npm run yh:bf12b:harness

# Mevcut bir arşivi doğrula
npm run yh:bf12b:validate -- --backup-dir <path> --passphrase-file <file>

# GERÇEK PRODUCTION (AYRI ONAY KAPISI) — Windows PowerShell
# 1) Secret'ları ENV'e koy (argümana ASLA):
$env:BF12B_DB_URL = "<Supabase direct/read connection URL>"
$env:BF12B_SERVICE_ROLE_KEY = "<service role key>"

# 2) Çalıştır — DB URL yalnız ENV ADI ile geçilir (--db-url-env):
npm run yh:bf12b:backup -- `
  --source production `
  --execute `
  --project-ref ylasompuxavjvimbbfgd `
  --db-url-env BF12B_DB_URL `
  --supabase-url "<Supabase project URL>" `
  --service-key-env BF12B_SERVICE_ROLE_KEY `
  --out "E:\yasam-backups\yasam-backup-YYYYMMDD-HHMM" `
  --passphrase-file "E:\yasam-backups\secrets\bf12b.passphrase" `
  --i-understand-production-read `
  --origin-sha "<merged-production-SHA>"

# 3) Session sonrası secret env'leri temizle:
Remove-Item Env:BF12B_DB_URL
Remove-Item Env:BF12B_SERVICE_ROLE_KEY
```

Kurallar:
- **Ham `--db-url <değer>` kullanma** (production'da reddedilir). DB URL yalnız `--db-url-env`.
- Bash `$VAR` genişletmesini DB URL argümanı olarak **kullanma** (argv'de secret görünür).
- Eksik/geçersiz env'de araç **production'a bağlanmaz**, redakte edilmiş fail-closed hata verir.
- Gerçek secret'ı terminal history'ye yazmamaya dikkat et; `pg` normal `npm install` ile gelir.

---

## 6. Gerçek backup öncesi hazırlık

1. **Freeze/maintenance önerilir:** run sırasında Storage/DB değişirse pre/post
   fingerprint uyuşmaz → run **FAIL-CLOSED** olur. Yazma trafiğini durdurun.
2. Owner kapısı: `role=admin AND admin_level=owner AND active AND owner-tenant`
   koşuluna uyan **tam 1** kullanıcı olmalı (yoksa BLOCKED).
3. Passphrase dosyasını hazırlayın, güvenli saklayın.
4. Harici diskte boş output klasörü hazırlayın.

## 7. Gerçek backup sonrası doğrulama

1. `COMPLETE` işaretçisi var mı? (yoksa backup **geçersiz**).
2. `npm run yh:bf12b:validate -- --backup-dir <out> --passphrase-file <file>` → PASS.
3. `validation/checksum-report.json` tüm dosyalarla eşleşmeli.
4. `manifest.public.json` içindeki sayaçları census ile karşılaştırın.
5. **restore dry-run** PASS (gerçek restore bu araçta YOK).
6. Backup'ı **en az iki** ayrı güvenli ortama kopyalayın; checksumları saklayın.

---

## 8. Failure recovery

- Herhangi bir kapı (owner/sensitive/coverage/storage-drift/pagination) fail → run durur,
  **COMPLETE yazılmaz**, kısmi çıktı **geçerli backup sayılmaz**.
- Hata raporu `validation/` altında; secret loglanmaz.
- Kök nedeni gider (ör. beklenmeyen dolu hassas kolon için explicit policy), tekrar çalıştır.

## 9. Güvenlik notları

- `users.password_hash` **yalnızca** encrypted archive'a girer (hesap geri yükleme için);
  public manifest/Word/log'da **görünmez**. Plaintext `users.password` non-null → **fail**.
- Session/token/secret alanları arşivden dışlanır (DO_NOT_RESTORE / metadata-only).
- Word'de password/hash/token/secret/session **yoktur**; hassas kolonlar redakte edilir.
- Public manifest **ham path / PII / secret içermez**; Storage adları opaque'tir.

## 10. Cleanup ile ilişki (ÖNEMLİ)

- **Cleanup, backup doğrulanmadan başlatılmaz.**
- Owner/admin tenant (`aa8b960b…`) ve `stone_knowledge_articles` owner shared-read
  satırları **KEEP** — backup'a dahil, cleanup'a **girmez**.
- Test uzman tenantları backup **sonra** silme adayıdır (ayrı BF-12C kapısı, ayrı onay).

## 11. Retention / güvenli silme

- Backup kopyalarını satış/geçiş tamamlanana kadar saklayın.
- Word (PII) belgelerini gereksizse güvenli silin (shred). Encrypted arşiv passphrase
  ile korunur; passphrase'i arşivden **ayrı** saklayın.

---

**Sonraki tek gerçek risk kapısı:** *production backup execution* — ayrı açık onay
olmadan başlatılmaz.
