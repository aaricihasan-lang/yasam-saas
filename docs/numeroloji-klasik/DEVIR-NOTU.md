# Numeroloji Merkezi — Devir ve İlerleme Notu

Gizli bilgi ve kişisel veri içermez. Canlı ham yanıtlar, kredi defteri ve ekran görüntüleri repo dışında:
`C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/` (ledger.jsonl, raw/, BULGULAR-CANLI.md, DOGALTAS-ESLESME.md, regresyon/, ui-ekran/, word-ornek/).
Tasarım prototipi: `C:/YasamSistemi-Gorsel-Tasarim/numeroloji-merkezi-2026-10-29/` (OWNER GÖRSEL PASS: BEKLİYOR).

## Ortam

- Worktree `C:\yasam-numeroloji-roxy`, branch `work/numeroloji-merkezi-roxy`, taban main `8a58ac1a`.
- `node_modules` → `C:\yasam-atlas-transit\node_modules` junction (bağımlılıklar main ile birebir). Bu worktree'de `npm install` ÇALIŞTIRMA.
- Sağlayıcı anahtarı yalnız kullanıcı ortam değişkeni `ROXY_API_KEY`.

## Kredi kuralı

Oturum tavanı 500 istek (owner, 29.10.2026). Her deneme (kota sorgusu ve 400 dahil) 1 sayılır.
Gerçek çağrı yalnız `scripts/numeroloji-klasik/live/runner.ts` (veya defter sarmalayıcılı uçtan uca betik) ile.
Defter sayısını görmek: `grep -c '"event":"attempt"' C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/ledger.jsonl`.

## Test komutları (worktree kökünden)

| Komut | Amaç |
|---|---|
| `npx tsx scripts/numeroloji-klasik/guard/boundary.harness.ts` | mevcut Numeroloji'ye sıfır fark + yazma yok + marka |
| `npx tsx scripts/numeroloji-klasik/oracle/unit.harness.ts` | oracle birim (ağsız) |
| `npx tsx scripts/numeroloji-klasik/oracle/normalize.harness.ts` | tüm canlı yanıtların normalize edilmesi |
| `npx tsx scripts/numeroloji-klasik/oracle/live-compare.harness.ts` | sağlayıcı ↔ bağımsız oracle |
| `npx tsx scripts/numeroloji-klasik/stones/matcher.harness.ts` | Doğaltaş eşleştirici |
| `npx tsx scripts/numeroloji-klasik/compare/align.harness.ts` | karşılaştırma hizalaması |
| `npx tsx scripts/numeroloji-klasik/pg/migration.harness.ts` | migration (gömülü PG) |
| `npx tsx scripts/numeroloji-klasik/server/unit.harness.ts` | sunucu birim |
| `npx tsx scripts/numeroloji-klasik/server/routes.harness.ts` | API uçları (gömülü PG) |
| `npm run numeroloji:check` ve diğer `numeroloji:*` | mevcut Numeroloji regresyonu |

Ek: `npx tsx scripts/numeroloji-klasik/guard/route-guard-diff.harness.ts` (ortak yetki kuralları taban eşdeğerliği),
`npx tsx scripts/numeroloji-klasik/compare/align.harness.ts`, `report/docx.harness.ts`, `api2/routes.harness.ts`,
`catalog/import.harness.ts`, `ui/ui.harness.ts` (Playwright, mock API). Ücretli: `e2e-real/real-service.ts` (~10 istek).

## Durum (29.10.2026 devam oturumu sonu)

- Yeni: Günün Sayısı (`/daily`, opak HMAC tohumu, Kişisel Gün'den ayrı), danışan seçimi + `?clientId=` + sonuçtan
  bağlama + danışan dosyası kartı (`app/dashboard/clients/[id]/components/KlasikNumerolojiPanel.tsx`), görsel PNG rapor
  (`/api/numeroloji-klasik/rapor/gorsel`), NK-006 (başlık payı + 429 soğuması), bağımsız hata taraması düzeltmeleri
  (NK-R1/R2/R4/R8/R9/R11/R14/R15/R16), gerçek DB + gerçek tarayıcı E2E (`e2e-db/e2e.ts`, gerçek kütüphane 91 taş).
- Testler: e2e-db 252/0 (yeniden oynatma) · gerçek sağlayıcı modu 5 kredi, ürün akışı geçti · UI 469/0 · unit 172/0 ·
  routes 174/0 · api2 190/0 · docx 481/0 · png 75/0 · normalize 626/0 · oracle 2.615 eş / 3 kayıtlı sapma ·
  smoke-compare 21/0 (20 uç bugün) · boundary 7/7 · route-guard-diff 541/0.
- Kredi defteri: 367/500 (bu oturumda 28: usage 1 + uç tekrarı 22 + gerçek E2E 5).
- E2E çalıştırma: `npx tsx scripts/numeroloji-klasik/e2e-db/e2e.ts` (0 kredi). Gerçek mod (ücretli, ~5 kredi):
  `NUMK_E2E_PROVIDER=real NUMK_E2E_REAL_CONFIRM=EVET npx tsx scripts/numeroloji-klasik/e2e-db/e2e.ts`.
- Açık: NK-R3 (Klasik ekranlarında Gelecek Yıllar alt-yetkisi — owner politika kararı), NK-R5 (temizlik
  zamanlaması), NK-R6 (eşzamanlılık kilidi 90 sn), NK-R7, NK-R12 (harita önbelleği gün bazlı), NK-R13, NK-R17;
  RKS-3 etiketleri `rks-korumasiz-onayli` + `rks-kritik-onayli` (owner).

## Durum (29.10.2026 gece sonu)

- Yapıldı: canlı doğrulama (20 uç), oracle, normalize, sunucu/API, migration taslağı, Doğaltaş eşleştirici,
  karşılaştırma, Word, ekranlar, güvenlik denetimi + düzeltmeler, regresyon kanıtları. Commit'ler bu branch'te.
- BLOKE: `git push` (otomatik mod sınıflandırıcısı reddetti) → Draft PR açılmadı. Owner push etmeli.
- Production: hiçbir şey alınmadı. Migration uygulanmadı, bayraklar kapalı, katalog içe aktarılmadı.
- Owner adımları: migration, katalog içe aktarma (`scripts/numeroloji-klasik/catalog/import.ts`, yalnız yerel hedefe
  izinli — production için owner yöntemi), bayraklar, menü bağlantısı, kişisel veri temizlik zamanlaması (SAKLAMA.md),
  RKS-3 etiketleri / haritası, yedek kaydı açılışta `backup` sınıfına alma.
- Açık bulgular: NK-001..NK-006 (BULGULAR-CANLI.md + owner raporu); NK-006: yanıt başlığındaki kalan kota ile hesap
  `/usage` kalanı farklı sayaçlar — kota tabanı başlığa dayanır, hesap düzeyini olduğundan yüksek görebilir.
