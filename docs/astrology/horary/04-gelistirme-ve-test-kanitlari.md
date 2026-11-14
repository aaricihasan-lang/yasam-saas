# D + E — Geliştirme Raporu ve Test Kanıtları (2026-10-18)

## Git güvenliği
- Ayrı worktree `C:/yasam-atlas-horary` (origin/main d59b1c04). Ana çalışma kopyası (`work/private-memory-tur2`,
  kirli) ve diğer 40+ worktree'ye dokunulmadı. `node_modules` aynı lockfile'a sahip bir worktree'den salt-okunur
  bağlantı (junction).
- Dallar: `work/atlas-kp-horary-complete` (PR #437), `work/atlas-western-horary-calc` (taslak PR #438),
  `work/atlas-horary-research` (bu belgeler). Commit'lerde yalnız ilgili dosyalar (`git add -A` yok).
- Merge 0 · production deploy 0 · production migration 0 · production veri değişikliği 0.

## PR #437 — HORARY-KP-01 (KP Horary tamamlama)
Değişen dosyalar: `app/admin/astroloji/_components/KpPanels.tsx`, `_components/TimingPanels.tsx`, `_lib/techniques.ts`,
`lib/astrology/engine/techniques.ts` (yalnız `kp.horary.parseOptions` → `displayTz`), `lib/astrology/report/model.ts`
(`kp.horary` bölümü), yeni `lib/astrology/view/kpHorary.ts`, `scripts/astrology/horary01.harness.ts`,
`scripts/astrology/horary01-ui.e2e.cjs`, `package.json` (test zinciri), `docs/astrology/horary/kp-horary-01-2026-10-18.md`.
Korunan motorlar: Roxy KP adaptörü, istek gövdeleri, önbellek anahtarı (test H1 `inputHash` eşitliği), 249 tablo,
significator projeksiyonu, KP Transit.
Güvenlik: yeni uç yok, yetki değişikliği yok, yeni veri alanı yalnız seçenek nesnesinde bir IANA adı; soru metni
saklanmaz/loglanmaz.

## PR #438 — HORARY-W-01 (Batı Horary hesap katmanı, taslak)
Yeni dosyalar: `lib/astrology/horary/western/{tables,calc}.ts`, `scripts/astrology/horaryWestern.harness.ts`,
`docs/astrology/horary/western-horary-calc-2026-10-18.md`, `package.json` (test zinciri). Hiçbir üretim kodu import etmez.

## Test komutları ve sonuçlar
| Komut | Dal | Sonuç |
|---|---|---|
| `npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horary01.harness.ts` | #437 | **11 PASS / 0 FAIL** |
| `npm run test:astrology` (29 harness + PG) | #437 | **PASS** (exit 0; harness başına 0 FAIL; tek "FAIL" satırı `20271101000300` beklenen-hata testi → "EXPECTED-FAIL: PASS") |
| `npx tsc --noEmit -p tsconfig.json` | #437, #438 | **0 hata** |
| `npx eslint <değişen dosyalar>` | #437, #438 | **0 hata** |
| `node scripts/astrology/horary01-ui.e2e.cjs http://localhost:3951 <klasör>` | #437 | **48 PASS / 0 FAIL** (1366×768, 1024×768, 768×1024, 390×844, 320×640) |
| `npx tsx … horaryWestern.harness.ts` | #438 | **11 PASS / 0 FAIL** |
| `static.harness`, `harness.ts` | #438 | 16/0, 39/0 |

Bağımsız doğrulamalar:
- **Zaman Lagna'sı** (horary01 H5): astronomy-engine GAST + gerçek eğim → tropikal ASC − sağlayıcı ayanamsası →
  bağımsız KP lordları = Roxy `rulingPlanets.lagna*`; sayının Lagna'sıyla burç lordu FARKLI (Mars ↔ Merkür).
- **Gün lordu** (H6): İstanbul gün doğumu astronomy-engine; Çarşamba → Merkür.
- **249 tablo** (H3): her sayının orta noktası kendi sayısına döner; sınırlar boşluksuz; bölünen 6 sub'ın parça toplamı
  = Vimshottari oranı.
- **Batı yaklaşan/ayrılan** (W8): 11 klasik açı Roxy `isApplying`/`orb` ile birebir; **sect + Şans noktası** (W6) Roxy
  ile birebir; **Ay boşlukta** (W10) 15 anda bağımsız taramayla aynı.

Ekran ↔ Word ↔ PDF: rapor ve ekran aynı `kpHorary.ts` fonksiyonlarını kullanır; H9 tablo hücreleri = ekran yardımcısı,
H10 Word ve PDF metninde aynı satırlar.

Kanıt sınırları (dürüst beyan):
- Yerel ekran testi `next dev --webpack` ile yapıldı: Turbopack, worktree dışına işaret eden `node_modules` bağlantısını
  reddetti; `next build --webpack` ise main'de zaten var olan, horary ile ilgisiz bir tip uyumsuzluğunda
  (`app/api/security/csp-report/route.ts` dışa aktarımı) durdu. **Turbopack üretim derlemesi bu dallarda çalıştırılmadı**
  — Vercel Preview derlemesi PR'larda gerçek kanıt olacaktır.
- Tarayıcı öykünmesidir; fiziksel cihaz testi değildir.
- Sahte veri: H8 ve W10 SENTETİK olarak etiketlidir; gerçek Roxy doğrulaması diye sunulmaz.

## Token / API tüketimi
- Bu çalışmada **gerçek Roxy çağrısı: 0** (yalnız depodaki golden kayıtlar; yerel sahte Roxy `local-fake-roxy-key`).
- İnternet: Roxy OpenAPI JSON'ları ve belge sayfaları (kimlik doğrulamasız, ücretsiz) indirildi.
- Owner onayıyla önerilen canlı doğrulama: en fazla **4** çağrı (bkz. `western-horary-calc-2026-10-18.md`).
