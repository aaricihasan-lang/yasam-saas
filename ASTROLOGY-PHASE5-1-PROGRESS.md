# ASTROLOJİ AŞAMA 5.1 — İLERLEME KAYDI (Vedik eksikler, doğruluk, premium kalite)

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline f132a624..HEAD` okuyun. Golden çağrı yapmadan
> önce `scripts/astrology/fixtures/golden/vedic-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `f132a624` (Aşama 5 yerel mühür; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production / migration: YOK. KP: YOK (Aşama 6 ayrı onay).

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 5.1A Vedik Transit (Gochara) | ✅ tamam | (5.1A commit) |
| 5.1B D2–D60 bağımsız doğrulama | ⏳ sırada | — |
| 5.1C Kuzey/Güney/Doğu görsel denetim | ⏳ | — |
| 5.1D Türkçe gezegen etiketleri | ⏳ | — |
| 5.1E Graha Drishti yöntem denetimi | ⏳ | — |
| 5.1F Dasha alt düzey testleri | ⏳ | — |
| 5.1G KB/kayıtlı analiz/güvenlik/regresyon/mutasyon + nihai rapor | ⏳ | — |

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Neden | Sonuç | Sayı |
|---|---|---|---|---|
| (Aşama 0–5) | — | — | — | 23 |
| 5.1A | POST /vedic-astrology/transit (sentetik A, an 2026-10-07 09:00 UTC = Batı transit golden'ıyla aynı an) → `vedic-transit.json` | Gochara yanıt şemasının gerçek doğrulaması (belge yalnız şema) | OK, 6 üst alan, şema belgeyle uyumlu | 1 |

Toplam: **24**.

## 5.1A — Gochara bulguları ve kararlar

- Roxy `POST /vedic-astrology/transit` VAR (belge: "Transit Analysis … (Gochar)"). **Ayanamsa alanı YOK**: `coordinateSystem`
  `sidereal` = Lahiri sabit (`tropical` da var — ASLA gönderilmez). → `vedic.transit` yalnız Lahiri; başka ayanamsada birim YOK
  (0 istek + açık neden), Drishti/Panchanga ile aynı kural.
- **Tek timezone alanı** hem doğum hem transit saatine uygulanır → transit anı (UTC) doğum ofsetinde yerel saate çevrilip gönderilir
  (09:00 UTC, +3 → 12:00:00). Yanıt `transitDatetime`/`birthDatetime` yankısı denetlenir (uyuşmazsa kaydedilmez).
- Yanıt: natal 9 graha (Lagna'dan bütün-burç ev), transit 9 graha: `natalHouse` (Lagna'dan), `houseFromMoon` (Janma Rashi — klasik
  Gochara referansı), `drishtiToNatal` (**bütün-burç Parashari**; Rahu/Ketu bakış atmaz; güç hep 100), `kaksha` (Gochara Kaksha:
  3°45′ dilim, yönetici, bindu, binduCount), `keyTransits` (yavaş grahalar + anlatı).
- `aspectsToNatal` = **Batı sözlüğü** (kare/üçgen/altmışlık, derece+orb) → Vedik teknik katmana ALINMAZ (Batı transitle karışmasın).
  `keyTransits[].description` → yalnız yorum katmanı (yetki/önizleme kapısı).
- Kaksha `bindu` sağlayıcının "favourable/unfavourable" diye açıkladığı alan — UI'da hüküm dili YOK, yalnız "bindu var/yok" +
  "kaksha yöneticisi bindu vermiş/vermemiş"; Rahu/Ketu `null` = "uygulanmaz" (asla olumsuz gösterilmez).
- Not bağlamı yalnız `ayanamsa:lahiri` (an not bağlamına girmez; notlar tarih tarih bölünmez). Konu türleri ayrı:
  `gochara_graha_in_rashi`, `gochara_from_moon`, `gochara_in_bhava`, `gochara_drishti` (bağlam `vedic_gochara`; DB regex uyumlu).
- Migration YOK (teknik adı DB CHECK `^[a-z][a-z0-9_.]{2,63}$` ile uyumlu).

### 5.1A bağımsız doğrulama (golden)

- Transit boylamları = astronomy-engine tropikal − Lahiri(transit anı) **≤ 0.0066°** (9/9; Rahu/Ketu ortalama düğüm).
- Natal = Vedik D1 golden birebir; Lagna (Terazi) ve Janma Rashi (Balık) D1 ile aynı.
- BPHS bindu tabloları (yalnız test kodunda) Roxy Ashtakavarga golden'ını **8×12 aynen** üretiyor → kaksha `binduCount` = natal BAV (7/7),
  `bindu` = kaksha yöneticisinin BAV katkısı (7/7).
- Drishti listesi Parashari bütün-burç kuralıyla birebir (Jüpiter → natal Rahu 12.09° "orb" ile de tam bakış: orb koşul değil).

### 5.1A testler

- `phase51.harness.ts`: 10/10 PASS (golden gövde, projeksiyon, 4 bağımsız doğrulama, 17 fail-closed mutasyon, motor/önbellek/
  Lahiri-dışı/TIME_REQUIRED/"şimdi", Batı↔Vedik ayrımı, yorum kapısı + KB + not + kayıtlı analiz 0 istek + tenant 404).

## Sıradaki kesin adım

5.1A commit → 5.1B (D2–D60 bağımsız doğrulama).
