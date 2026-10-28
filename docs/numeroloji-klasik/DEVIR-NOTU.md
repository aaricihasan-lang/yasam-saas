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

## Aşama durumu

Güncel durum için commit geçmişine (`git log 8a58ac1a..HEAD`) ve son owner raporuna bakın.
Tamamlanmamış iş tamamlanmış sayılmaz; production'a hiçbir şey alınmadı (migration uygulanmadı, bayrak kapalı).
