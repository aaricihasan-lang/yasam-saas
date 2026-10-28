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
