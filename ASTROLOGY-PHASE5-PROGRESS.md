# ASTROLOJİ AŞAMA 5 — İLERLEME KAYDI (Vedik/Jyotish)

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline` okuyun. Golden çağrı yapmadan önce
> `scripts/astrology/fixtures/golden/vedic-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `ca534a37` (temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 5A Envanter + harita kabiliyeti | ✅ tamam (`docs/astrology/phase5a-vedic-inventory.md`) | (bu commit) |
| 5B D1 çekirdek | ⏳ sırada | — |
| 5C Nakshatra/Pada | ⏳ | — |
| 5D D9 + Varga | ⏳ | — |
| 5E Vimshottari Dasha | ⏳ | — |
| 5F Diğer Vedik teknikler | ⏳ | — |
| 5G KB / analiz / premium UI / kapanış | ⏳ | — |

## Kararlar

- Harita: Roxy'nin MIT lisanslı `@roxyapi/ui` kundli/varga bileşeni (tam sürüm sabit), ham yanıt değil
  kendi teknik projeksiyonumuzdan kurulan nesneyle beslenir; self-fetch öznitelikleri kullanılmaz.
- Ayanamsa: lahiri (varsayılan, belge), raman, kp-newcomb, kp-old. custom kapalı.
- Vedik uçlarda timezone varsayılanı 5.5 → doğum ofseti her zaman açıkça gönderilir.
- Tüm Vedik teknikler TIME_REQUIRED.
- Graha Drishti (/aspects) ayanamsa almaz (Lahiri sabit) → yalnız Lahiri seçiliyken.

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Sayı |
|---|---|---|
| (önceki aşamalar) | — | 14 |

Toplam: **14**. Aşama 5 bütçe planı ≈ 9–10.

## Son test sonuçları

- Aşama 4.1 kapanışı (ca534a37): astroloji 39/19/17/37/20/15/10 + PG PASS.

## Açık hatalar

- Yok.

## Sıradaki kesin adım

5B: `@roxyapi/ui@0.49.0` tam sürüm bağımlılığı → D1 golden (lahiri) → adaptör/model/teknik → görünüm.
