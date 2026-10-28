# Klasik Numeroloji × Doğaltaş — Eşleştirme Sözleşmesi

Durum: geliştirme (branch `work/numeroloji-merkezi-roxy`). Ürüne bağlı DEĞİL; ekran / route bağlantısı ayrı adımdır.
Kod: `lib/numeroloji-klasik/stones/**` · Test: `scripts/numeroloji-klasik/stones/matcher.harness.ts` ·
Çevrimdışı analiz: `scripts/numeroloji-klasik/stones/offline-index.ts`.

## 1. Veri kaynakları

| Kaynak | Ne verir | Nasıl okunur |
|---|---|---|
| `/chart` → `luckyAssociations` | `gemstones[]` (serbest metin, istek dilinde), `rulingPlanet`, `element`, `colors`, `day`, uyumlu/uyumsuz sayılar. Yaşam Yolu'nun yönetici gezegeninden türetilir. | Klasik analiz kaydından (0 ek çağrı). |
| Doğaltaş Kütüphanesi (`lib/stone-library/**`) | Yayındaki taşların slug'ı, TR/EN adı, takma adları, `numerical_vibration`, `planet`, `chakra`, `element`, eşlikçi taşlar (`pairings`). | YALNIZ uzman yayın RPC'leri: `stone_library_viewer_allowed` → `stone_library_expert_search` → `stone_library_expert_stone`. Her kart kütüphanenin beyaz liste + sızıntı filtresinden (`toExpertStoneDoc`, `findStoneLibraryLeaks`) geçer. |
| `dogaltas_inventory` (tenant) | Uzmanın stok adları + adet. | YALNIZ `select name, adet` + `tenant_id = oturum tenant'ı`. |

Sağlayıcının kristal açıklama metinleri bu modülde KULLANILMAZ ve repoya KOPYALANMAZ. Çevrimdışı analiz yalnız ad /
kimlik / sayı okur; ham dosyalar repo dışındadır (`C:/YasamSistemi-QA/...`).

## 2. Doğrudan ↔ türetilmiş öneriler

Her öneri `reasons[]` taşır (yöntem + Türkçe açıklama). Bir taş yalnız EN GÜÇLÜ gerekçesinin grubunda listelenir;
diğer gerekçeleri aynı kartta görünür (tekilleştirme `stoneKey` = kütüphane slug'ı ile).

| Sıra | Yöntem | Tür | Kural |
|---|---|---|---|
| 1 | `provider_direct` | **Doğrudan** (klasik ekol listesi) | `gemstones` adları kütüphaneye çözülür. Kesilmez. |
| 2 | `vibration_exact` | Türetilmiş | Taş titreşimi === kişinin sayısı (Yaşam Yolu, İfade, Ruh Güdüsü, Kişilik, Doğum Günü). |
| 3 | `vibration_root` | Türetilmiş (ayrı etiket) | Usta sayı → kök (11→2, 22→4, 33→6) ya da bileşik sayı → indirgenmiş kök (ör. doğum günü 23 → 5). |
| 4 | `planet` | Türetilmiş | Taş gezegenleri ∋ yönetici gezegen. Bileşik değerler (`Venus & Neptune`) açılır; TR↔EN sözlük `vocab.ts`. |
| 5 | `pairs_with` | Türetilmiş | Yalnız **doğrudan eşleşen** taşların eşlikçileri. |
| 6 | `element` | Türetilmiş — **varsayılan KAPALI** | Taş elementleri ∋ `luckyAssociations.element`. |

Yok (uydurulmaz): **çakra** eşleşmesi — sayı → çakra ilişkisini veren veri alanı yok. **Karmik** sayılar (borç / ders)
için taş verisinde karşılık yok → yalnız not düşülür. **Renk** eşleşmesi bu aşamada yok (owner kararı, §7).

Tavan: türetilmiş gruplar grup başına 6, toplam 20 (ayarlanabilir). Sıralama kararlı: gerekçe sayısı ↓, sayı önceliği
(Yaşam Yolu > İfade > Ruh Güdüsü > Kişilik > Doğum Günü), Türkçe ad, slug. Doğrudan grup sağlayıcı sırasını korur.

## 3. Ad çözümü

Katlama `lib/stone-library/fold.ts` (`foldStoneLibraryText`) — DB `stone_library_fold` ile birebir; doğrudan içe aktarılır.
Sıra: tam ad (TR/EN/takma ad) → boşluksuz ad ("Kaplangözü") → yerel takma ad tablosu (`STONE_NAME_ALIASES`,
ör. Pırlanta→Elmas, Lal Taşı→Garnet, Dağ Kristali→Berrak Kuvars, Firuze→Turkuaz) → diğer dildeki ad (aynı sıra) →
kelime içerme. Durumlar:

- `matched` — tek kesin taş.
- `ambiguous` — birden çok aday ya da yalnız kelime içerme (`partial`: "Akik" ⊂ "Yosun Akik"; `variant`: "Safir" ⊂
  "Sarı Safir"). **Otomatik seçim YOK**; uzman seçer.
- `unmatched` — ad metin olarak gösterilir.
- `text_only` — kütüphane kapalı (yedek mod).

Sağlayıcı adı / URL içeren girdi adı çıktıya taşınmaz (düşürülür + not).

## 4. Usta sayı kuralları

- 11 / 22 / 33 her zaman usta sayıdır (sağlayıcı işareti "single" gelse bile). Titreşimi tam 11/22/33 olan taş `exact`;
  titreşimi kök sayı olan taş YALNIZ `vibration_root` (`rootKind: "master"`) — açıklama "birebir eşleşme değildir" der.
- 11 hiçbir yerde sessizce 2'ye eşitlenmez; aynı kişide tek basamaklı 2 (ör. Ruh Güdüsü) varsa o ayrı bir `exact` gerekçedir.
- Gözlenen veride titreşim değerleri yalnız 0–9 → usta sayılı Yaşam Yolu'nda titreşim eşleşmesi pratikte yalnız kök
  üzerinden olur.
- Titreşim **0 = bilinmiyor** → eşleşmeye alınmaz (gözlenen veride 91 taşın 35'i).

## 5. Kütüphane bağımlılığı ve yedek mod

`loadClassicStoneIndex` (sunucu): `STONE_LIBRARY_ENABLED` tam `"true"` değilse DB'ye gitmeden `library_disabled`;
uzmanın owner'dan aldığı etkin yetki yoksa `no_access`; RPC hatasında `unavailable` (yarım dizin kullanılmaz); yayında
taş yoksa `empty`. Bu durumların hepsinde eşleştirici **yedek modda** çalışır: doğrudan öneriler yalnız ad (bağlantı
yok), türetilmiş gruplar boş, açıklayıcı not. Dizin 10 dk süreç içi önbellekte tutulur (yayın yüzeyi tenant'sızdır);
erişim her çağrıda yeniden doğrulanır. Maliyet: dizin kurulumunda arama sayfası başına 1 + taş başına 1 RPC (DB içi;
sağlayıcı kredisi YOK).

Uzmana giden dizinde yalnız slug / ad / facet anahtarı vardır; iç uuid, kaynak / sağlayıcı adı, lisans, ham veri YOK.

## 6. Mevcut taş tablolarına yazma YOK

`stones`, `dogaltas_inventory`, `client_stones`, `stone_library_*` tablolarına bu modülden **hiçbir yazma** yapılmaz.
Stok rozeti mevcut Numeroloji rozetiyle aynı anlamdadır (normalize ad BİREBİR; içerme yok: "Akik" ≠ "Mor Akik"),
`app/numeroloji/**`'dan içe aktarılmaz.

## 7. Açık owner kararları

1. Element grubu açılsın mı? (Gözlenen veride element başına 13–38 taş → gürültülü; varsayılan KAPALI.)
2. `variant` adayları ("Sarı Safir" → Safir, "Siyah İnci" → İnci, "Mavi Topaz" → Topaz) uzman onayıyla mı, yoksa
   "çeşidi" rozetiyle doğrudan mı gösterilsin? (Şu an belirsiz → otomatik seçim yok.)
3. Yerel takma ad tablosuna ekleme (ör. "Kırmızı Jasp" → Kırmızı Jasper, "Hesonit" → Garnet çeşidi?) — owner onayı.
4. Kütüphanede olmayan uğurlu taşlar (Mercan, Kedi Gözü, Hesonit) kütüphaneye eklenecek mi?
5. Renk eşleşmesi (`luckyAssociations.colors` ↔ taş renk aileleri) istenir mi?

## 8. Gelecek: danışan taşlarına bağlantı (YALNIZ ÖNERİ)

Bu aşamada `client_stones`'a bağlantı/yazma YOK. Öneri: danışan dosyasında "Numeroloji önerisi" kartında taş adının
yanında, danışanın kayıtlı taşlarında BİREBİR normalize adla bulunan taşlar için salt-okunur "Danışanda kayıtlı" rozeti;
taş ekleme işlemi mevcut Doğaltaş danışan akışında, uzmanın açık eylemiyle ve ayrı onaylı bir PR'da.
