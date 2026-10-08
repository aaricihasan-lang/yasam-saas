# ASTROLOJİ AŞAMA 6.1 — KP TEKNİK TUTARLILIK İLERLEME KAYDI

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline 3e7f7230..HEAD` okuyun.

- Başlangıç: HEAD `3e7f7230` (Aşama 6 yerel mühür) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Başlangıçta çalışma ağacı temizdi; upstream yoktu.
- Gerçek Roxy çağrısı başlangıç: **44**. Push / preview / merge / production / migration: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 6.1A Rahu/Ketu yöntem denetimi | ✅ rapor + etiketler + test | (6.1A commit) |
| 6.1B Dasha "bugün" rozeti | ⏳ | — |
| 6.1C KP sınırlarının sunumu | ⏳ | — |
| 6.1D Regresyon | ⏳ | — |
| 6.1E Güvenlik ve kapanış | ⏳ | — |

## 6.1A

Rapor: `docs/astrology/phase6-1-rahu-ketu-method-audit.md`.

Roxy düğüm significator'larında üç kural uyguluyor; bunlar golden'larla bağımsız olarak sınandı:

| Uç | Kural | Durum |
|---|---|---|
| kp/chart | sade | doğrulandı |
| dasha | ajan ekli: burç lordu + aynı burç + 7. burç | 4 düğüm × 4 düzey birebir; "bakış" kapsamı kısmen belirsiz |
| horary | `signifies` ajan ekli, `allHouses`/`houseWise` sade | aynı yanıtta iki yöntem (sağlayıcı iç tutarsızlığı) |
| ruling | Ketu = burç lordu Ay'ın kümesi | belgelenmemiş; tek örnek; sıra açıklanamadı |

- Hesap hatası bulunmadı. Sorun, yöntemin uçtan uca değişmesi ve iki uçta belge ile verinin çelişmesi.
- Ürün: düğüm satırlarına yöntem etiketi ve açıklama kutusu eklendi (hesap yok). Listeler birleştirilmiyor; Bilgi Bankası anahtarları zaten ayrı.
- Yeni gerçek Roxy çağrısı: 0.
