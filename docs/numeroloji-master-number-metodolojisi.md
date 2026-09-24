# Numeroloji — Master Number / 19 Metodolojisi (Şeffaflık Notu)

> NUM-012 kapsamında hazırlanmıştır. Bu bir **hata düzeltmesi değildir**; mevcut,
> **bilinçli** ve iç tutarlı metodolojinin belgelenmesidir. Hesap motorunun matematiği
> (`lib/numeroloji/**`) bu çalışmada **DEĞİŞTİRİLMEMİŞTİR**.

## Özet

Motor iki ayrı özel-sayı kümesi kullanır ve bunları farklı hesaplarda bilinçli olarak
uygular:

| Sabit | Değer | Nerede korunur |
|---|---|---|
| `MASTER_NUMBERS` | `{11, 22, 33}` | **Hayat Yolu** (`reduceKeepMaster`) — klasik kural: **19 indirgenir** |
| `SPECIAL_NUMBERS` | `{11, 19, 22, 33}` | **İfade Sayısı**, **Ana/Yan Kulvar**, **Kişisel Yıl** — **19 korunur** (karmik borç) |

Kaynak: `lib/numeroloji/ortak.ts` (`MASTER_NUMBERS`, `SPECIAL_NUMBERS`, `reduceKeepMaster`,
`reduceNumber`). İlgili kullanım noktaları: `hayatYolu.ts`, `ifadeSayisi.ts`, `anaKulvar.ts`,
`yanKulvar.ts`, `kisiselYil.ts`.

## Neden 19 farklı işleniyor?

- **Hayat Yolu**: klasik (Pisagor) Hayat Yolu yönteminde yalnız 11/22/33 usta sayı olarak
  korunur; 19 tek haneye indirgenir. Motor bunu `reduceKeepMaster` ile uygular.
- **İfade / Kulvar / Kişisel Yıl**: bu katmanlarda 19 "karmik borç" sayısı olarak anlamlıdır
  ve korunur. Motor bunu `SPECIAL_NUMBERS` üyeliğiyle uygular.

## Zirve / Mücadele / Değişim / PIN

Bu hesaplar gün/ay/yıl alt-rakamları üzerinde `reduce1To9` / `reduceToDigit` ile çalışır;
tasarım gereği usta sayı / 19 koruması **uygulanmaz** (tek haneli çalışma sayıları üretir).

## Bağlayıcı kural

Bu metodoloji **kilitlidir**. "Daha tutarlı olsun" gerekçesiyle 11/19/22/33 davranışı
değiştirilmez. Değişiklik yalnızca ürün sahibinin açık onayıyla ve golden regresyon
vektörleri güncellenerek yapılır (bkz. `scripts/numeroloji-canonical/harness.ts`).
