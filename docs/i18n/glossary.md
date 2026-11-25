# Yaşam Sistemi — Global Terminoloji Sözleşmesi (Glossary)

> FAZ 1 / AŞAMA 3 — **English (en) canonical terminology KİLİTLİ.** DE/FR sonraki aşamalarda.
>
> **Kritik kural:** Bu sözlük yalnız **DISPLAY LABEL** (arayüz metni) içindir.
> **CANONICAL VALUE ≠ DISPLAY LABEL.** DB'de saklanan kanonik değerler
> (burç: `Koç`; element: `Ateş`; analysis_data anahtarları: `GÜNEŞ`, `AY`, …;
> mizaç: `safra`; homework status: `devam`) **asla** çevrilmez / rename edilmez.
> English yalnız DISPLAY katmanında (i18n + `t.has` korumalı display-map) uygulanır.

## Çekirdek Terimler (core)

| TR (source) | EN | Not |
|---|---|---|
| Kaydet | Save | `common.save` |
| İptal | Cancel | `common.cancel` |
| Sil | Delete | `common.delete` |
| Düzenle | Edit | `common.edit` |
| Ara | Search | `common.search` |
| Yükleniyor… | Loading… | `common.loading` |
| Onayla | Confirm | `common.confirm` |
| Vazgeç | Cancel | ikincil "geri al" — bağlama göre "Discard" değil "Cancel" |
| Aç / Gör | Open / View | |
| Yenile | Refresh | |
| Güncelle | Update | |

## Danışan Modülü Terimleri (client module)

| TR (source) | EN (locked) | Not |
|---|---|---|
| Danışan | **Client** | Ana varlık — **"Patient" KULLANMA** (sağlık/hastane dili değil) |
| Danışan Yolculuğu | **Client Journey** | Modül adı |
| Genel Bilgiler | General Info | |
| Randevu | Appointment | |
| Seans | Session | ⚠️ DB `title` default'u canonical TR "Seans" kalır; yalnız yeni-form seed display'i |
| Not / Notlar | Note / Notes | |
| Ödev / Ödevler | Homework | practitioner→client assignment |
| Taşlar | Stones / Gemstones | doğaltaş bağlamı → "Stones" |
| Seanslar | Sessions | |
| Analizler | Analyses | |
| Yaşam Hafızası | Life Memory | modül adı |
| Kombinasyon | Combination | mineral kombinasyonu |
| Yeni Kayıt | New Record | |
| Doğum Tarihi | Date of Birth | |
| Görüşme Tarihi | Meeting Date | son görüşme |
| Kan Grubu | Blood Type | değer değişmez (A Rh+ vb.) |
| Burç | Zodiac Sign | display-map (aşağı) |
| Mizaç | Temperament | display-map (aşağı) |
| Toplam / Geçmiş / Yaklaşan | Total / Past / Upcoming | randevu sayaç/statü |
| Tamamlandı / Gecikti / Devam Ediyor / İptal / Bekliyor | Completed / Overdue / In Progress / Cancelled / Pending | homework status display |
| Uyarı / Kritik / Bilgi | Alert · Warning / Critical / Info | bağlama göre |
| Seans Öncesi / Seans Sonrası | Before Session / After Session | çakra formu |
| Enerji / Eril Enerji / Dişil Enerji | Energy / Masculine Energy / Feminine Energy | |
| Çakra | Chakra | |
| Gezegen | Planet | |
| Word Raporu | Word Report | |
| Tarih Aralığı | Date Range | |
| Arama / Filtreleme | Search / Filter | |

## Canonical → English DISPLAY MAP (data DEĞİŞMEZ)

### Burç (canonical Türkçe → EN display)
Koç→Aries · Boğa→Taurus · İkizler→Gemini · Yengeç→Cancer · Aslan→Leo · Başak→Virgo
· Terazi→Libra · Akrep→Scorpio · Yay→Sagittarius · Oğlak→Capricorn · Kova→Aquarius · Balık→Pisces
*(DB/filter/computeBurc hâlâ Türkçe canonical döner; display `t.has` ile map'lenir, bilinmeyen→raw.)*

### Mizaç (canonical value → EN display) — humoral/Unani mizaç
safra (sarı safra/yellow bile) → **Choleric** · sovdavi (sevda/black bile) → **Melancholic**
· dem (kan/blood) → **Sanguine** · balgam (phlegm) → **Phlegmatic**
*(Rasyonel: geleneksel/Unani tıbbında dört mizaç humor karşılığıyla adlandırılır. Write payload `value="safra"` vb. DEĞİŞMEZ. TR display "Safra/Sovdavi/Dem/Balgam" korunur.)*

### Element (analysis_data DATA key → EN display)
Hava→Air · Su→Water · Ateş→Fire · Toprak→Earth
*(P0: `values[...Hava]` lookup + persisted key aynen kalır; yalnız görünen etiket map'lenir.)*

### Gezegen (analysis_data DATA key → EN display)
GÜNEŞ→Sun · AY→Moon · MERKÜR→Mercury · MARS→Mars · VENÜS→Venus
*(P0: `values[${scope}_${row.key}_${planet}]` GÜNEŞ vb. ile üretilir; DEĞİŞMEZ.)*

### Analiz tipi (code → EN display)
chakra → Chakra Analysis · planet → Chakra-Planet Analysis · (diğer) → Analysis
*(Paylaşımlı `analysisTypeLabel` helper server Word-route için TR döndürmeye devam eder; UI display i18n.)*

## Çevrilmeyen Kanonik Değerler (DO-NOT-TRANSLATE)

- **Burç** persisted: Koç…Balık (TR canonical) — display-map dışında dokunulmaz
- **Kan grubu:** `A Rh+`, `0 Rh-`, … (value=display, EN'de aynı)
- **analysis_data anahtarları:** GÜNEŞ, AY, MERKÜR, MARS, VENÜS + Hava, Su, Ateş, Toprak
- **Mizaç:** `safra`, `sovdavi`, `dem`, `balgam` (value ≠ label)
- **HomeworkStatus:** `bekliyor`, `devam`, `tamamlandi`, `gecikti`, `iptal` (write payload)
- **YolculukTab META:** type/durum/odevDurum/alertCat/scoreStage code'ları + `["Hava","Su","Ateş","Toprak"]`
- **Ücret:** TRY / `₺` — currency conversion YOK (yalnız format)

## I18N-F1 ekleri (2026-11-24)

**Tek terminoloji kaynağı:** kimlik listeleri `lib/i18n/terms/registry.ts`, etiketler `messages/<dil>/terms.json` (`terms.zodiac.*`, `terms.body.*`, `terms.element.*`, `terms.moonPhase.*`). Türkçe etiketler `lib/astrology/labels/tr.ts` ile birebir aynıdır (`npm run i18n:unit` denetler). Modüller burç/gezegen/element listesini YENİDEN TANIMLAMAZ; yeni alanlar (`terms.hd.*`, `terms.numerology.*`, `terms.stones.*`) koordinatör onayıyla buraya eklenir.

**Çevrilmeyecek (kanonik) değerler — ek liste:**
- `clients.burc` (Türkçe burç adı; okumada `fromLegacyTr("zodiac", …)` ile kimliğe çevrilir)
- Human Design bilgi bankası kategori değerleri ("Kapılar", "Tipler", "Otoriteler" — `lib/human-design/codeHelpers.ts`)
- Numeroloji uyum sınıfları ("İYİ" / "KÖTÜ" / "KÇB") ve element değerleri; Türkçe alfabe tabanlı harf→sayı hesabı (`tr-TR` katlama KALIR)
- Kozmik Ajanda burç/gezegen/ay evresi anahtarları (Kozmik dalgasına kadar)
- Doğaltaş kanonik listeleri (`lib/dogaltas/stoneTaxonomy.ts`), taş/mineral adları

**Kod içi kanonik değer işareti:** sabit metin dedektörü kullanıcıya görünür Türkçe metni sayar; kanonik değerler aynı satırda `// i18n-ignore: <gerekçe>` ile işaretlenir (gerekçesiz işaret PR incelemesinde reddedilir).

**Yazım:** İngilizce biçimlendirme en-GB (GG/AA/YYYY yerine ürün sözleşmesi GG.AA.YYYY korunur, 24 saat). İngiliz/Amerikan yazım kararı Owner'da (bkz. `docs/i18n/F1-altyapi.md` §6).

**Modül adları — İngilizce (Owner kararı, F1-R1, en-GB):** Gökyüzü Atlası → Celestial Atlas · Şifa Rehberi → Natural Wellness Guide ·
Kupa / Hacamat → Cupping & Hijama · Danışan Yönetimi → Client Management · Doğaltaş → Natural Stone · Kozmik Ajanda → Cosmic Calendar
(Kozmik fazında uygulanacak). Türkçe modül adları DEĞİŞMEZ. Human Design teknik terimleri (Center, Gate, Channel, Authority, Profile)
alanın resmî İngilizce kullanımıyla kalır.
