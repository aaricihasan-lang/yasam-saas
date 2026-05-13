# Cursor Talimatı — Numeroloji Web Motoru V1

Bu paketteki dosyalar masaüstü Python hesaplama dosyalarından TypeScript'e çevrilmiş numeroloji hesap motorudur.

## Yapılacak işlem

1. Projede şu klasörü oluştur:

```txt
lib/numeroloji/
```

2. Bu paketteki `lib/numeroloji/` içindeki tüm `.ts` dosyalarını aynı isimlerle projedeki `lib/numeroloji/` klasörüne koy.

3. Hesaplama kurallarını değiştirme.

4. Bu dosyalarda refactor, sadeleştirme, otomatik kural tahmini, isim değiştirme yapma.

5. UI tarafı daha sonra bağlanacak. Şimdilik yalnızca hesap motoru dosyaları eklenecek.

## Önemli sabitler

- Türkçe karakterler korunacak.
- Ana Kulvar sesli harflerden hesaplanır.
- Yan Kulvar sessiz harflerden hesaplanır.
- Özel sayılar: 11, 19, 22, 33.
- PIN kodunda özel sayı aranmaz; her kutu tek haneye sadeleşir.
- Her bölüm ayrı dosyada kalacak.

## Dosya listesi

```txt
lib/numeroloji/ortak.ts
lib/numeroloji/anaKulvar.ts
lib/numeroloji/yanKulvar.ts
lib/numeroloji/ifadeSayisi.ts
lib/numeroloji/hayatYolu.ts
lib/numeroloji/pinKodu.ts
lib/numeroloji/cakraOmurgasi.ts
lib/numeroloji/elementler.ts
lib/numeroloji/degisimDonusum.ts
lib/numeroloji/zirveYillari.ts
lib/numeroloji/mucadeleYillari.ts
lib/numeroloji/harflerinYankilanisi.ts
lib/numeroloji/numerolojiMotor.ts
lib/numeroloji/index.ts
```

## Test için örnek kullanım

```ts
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";

const sonuc = hesaplaNumeroloji({
  firstName: "Hasan",
  lastName: "ARICI",
  birthDate: "14.02.1987",
});

console.log(sonuc.anaKulvar.display);
console.log(sonuc.yanKulvar.display);
console.log(sonuc.ifadeSayisi.display);
console.log(sonuc.hayatYolu.display);
```

## Git deploy hatırlatma

Test tamamlandıktan sonra PowerShell'de:

```powershell
git add .; git commit -m "Numeroloji hesap motoru eklendi"; git push
```
