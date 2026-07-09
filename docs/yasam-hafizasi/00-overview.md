# 00 — Genel Bakış, Vizyon ve Ürün Anayasası

## İçindekiler

- [Amaç](#amaç)
- [Vizyon](#vizyon)
- [Ürün Anayasası (v1.0 — 10 Madde)](#ürün-anayasası-v10--10-madde)
- [Kanıt Kuralı](#kanıt-kuralı)
- [Temel Prensipler](#temel-prensipler)
- [AI'nın Rolü](#ainin-rolü)
- [Kanıt Kapısı](#kanıt-kapısı)
- ["Neden Gösterildi?"](#neden-gösterildi)
- [Derece Sistemi](#derece-sistemi)
- [Deterministik Yaklaşım](#deterministik-yaklaşım)
- [Neden AI Cevap Üretmiyor?](#neden-ai-cevap-üretmiyor)
- [Uzun Vadeli Hedef](#uzun-vadeli-hedef)
- [Değişmezler](#değişmezler)
- [Sonraki Doküman](#sonraki-doküman)

---

## Amaç

Bu doküman Yaşam Hafızası'nın **değişmeyecek felsefesini** tanımlar. Sonraki tüm teknik/ürün/tasarım kararları bu anayasaya tabidir; bir öneri bir maddeyle çelişirse **madde kazanır**.

---

## Vizyon

Yaşam Hafızası, uzmanın yıllar boyunca oluşturduğu **kendi bilgi hazinesini unutulmaz** kılan, AI destekli bir **iç hafıza**dır. Amaç AI yapmak değil; uzmanın kendi bilgisini doğru anda, doğru şekilde önüne getirmektir.

> Biz bir AI sohbet sistemi yapmıyoruz. Biz bir **Uzman Hafızası** oluşturuyoruz.

---

## Ürün Anayasası (v1.0 — 10 Madde)

**Madde 1 — AI'nın Görevi.** AI yalnızca soruyu biçimlendirir ve anlamlandırır. Cevabı asla üretmez. Tek görevi, danışan notunu veya arama cümlesini anlamaktır (örn. "Bebek emiyor ama doymuyor" → *emzirme / anne sütü / laktasyon*).

**Madde 2 — Bilginin Kaynağı.** Tek bilgi kaynağı, uzmanın bilinçli olarak eklediği içeriktir. Dışarıdan bilgi çekilmez, genel sağlık önerisi verilmez, tıbbi çıkarım yapılmaz, olmayan uydurulmaz.

**Madde 3 — Dereceli Eşleşme.** Sonuçlar derecelidir: Çok güçlü / Güçlü / Zayıf / Kayıt bulunamadı. Tamamı yalnız sistem içi kayıtlardan hesaplanır.

**Madde 4 — Sunum Katmanı.** AI yorum yazmaz. Yalnız eşleşme nedeni + eşleşen ifadeler + ilgili paragraf gösterilir; "neden" gerektiğinde tamamen deterministik şablonlarla üretilir. Yorumsal/abstractive üretim yasaktır.

**Madde 5 — Bilgi Yaşam Döngüsü.** Kayıtlarda son gözden geçirilme tarihi, versiyon ve güncellik durumu bulunabilir; yalnız uzmanın hazine yönetimi içindir.

**Madde 6 — Dürüst Boşluk.** Bilgi yoksa "Kayıt bulunamadı" denir. Yeni uzmanın hazinesi boş olsa bile boşluk dış bilgiyle doldurulmaz. Bu bilinçli bir ürün kararıdır.

**Madde 7 — Öğrenme.** Sistem dış bilgi öğrenmez; yalnız uzmanın kendi kullanım alışkanlıklarından (sık kullandığı/açtığı/favorilediği kayıtlar).

**Madde 8 — Model Bağımsızlığı (Taç İlke).** Değer AI modelinden değil, uzmanın hazinesinden gelir. AI değişebilir (OpenAI/Gemini/Claude/yerel). Temel değer her zaman kullanıcının kendi hazinesidir. Bu ilke değişmez.

**Madde 9 — Kanıtlanabilirlik.** Sistem her sonucun neden gösterildiğini ispatlayabilmelidir. Kaynaksız çıktı olamaz.

**Madde 10 — Nötr Dil.** Dil her zaman nötrdür: *"benzerlik gösteriyor / inceleyebilirsiniz."* Asla *"var / uygulayın / tedavi eder"* denmez. Nihai değerlendirme uzmana aittir.

---

## Kanıt Kuralı

> Bir kaydın sonuç olarak gelmesi için eşleşmenin **kanıtı** sistemin kendi içinde bulunmalıdır — metin, başlık, paragraf, etiket, uzman notu veya uzmanın tanımladığı ilişki. AI dış genel bilgiyle **yeni bağlantı kurmaz** (örn. "lenf sistemi süt üretimiyle ilişkilidir" diyemez). **Kanıt yoksa kayıt hiç gösterilmez.**

Bu, Madde 2 ve Madde 4'ün güçlendirmesidir ve tüm teknik mimarinin çekirdeğidir.

---

## Temel Prensipler

- Kapalı korpus (yalnız uzmanın kaydı) → sınırlı halüsinasyon yüzeyi, tam test edilebilirlik.
- Provenance yerleşiktir: kaynaksız çıktı yapısal olarak imkânsız.
- Dürüst boşluk > uydurma doluluk.
- Overlay-first: merkezi zeka *hissi*, decoupled *mimari*.

---

## AI'nın Rolü

AI **izole bir saf fonksiyondur**: `anla(metin) → kavramlar[]`. Korpusu görmez, kayıt seçmez, metin yazmaz. Çıktısı yalnız bir Kavram Kümesi'dir; bu küme, *ne arayacağımızı* genişletir ama *neyin görüneceğine* karar vermez. Ayrıntı: [`06-phase-4-deep-analysis.md`](./06-phase-4-deep-analysis.md).

---

## Kanıt Kapısı

Aday üretiminden (lexical/semantic) sonra çalışan **deterministik** kapı. Her aday için Kavram Kümesi'nden somut kanıt arar; bulamazsa adayı düşürür (INV-1). Görünür sonuca yalnız bu kapı karar verir.

---

## "Neden Gösterildi?"

Her kartın altında, kaydın neden geldiğini gösteren **deterministik** metin. Yalnız Evidence kaydından şablonla üretilir (INV-2); AI kullanılmaz. Örn: *"'anne sütü' bu kaydın başlığında geçiyor."*

---

## Derece Sistemi

| Görsel | Etiket | Anlam |
|---|---|---|
| ● ● ● | Çok güçlü | Başlık/etiket/ilişkide birebir |
| ● ● ○ | Güçlü | Paragrafta net |
| ● ○ ○ | Zayıf | Dolaylı; kanıtı sistemde var |

Derece kanıt türünden deterministik hesaplanır; AI/vektör skoru dereceyi belirlemez.

---

## Deterministik Yaklaşım

Görünürlük (Kanıt Kapısı), derece ve "Neden?" tamamen kural tabanlıdır. AI ve semantik yalnız aday üretimi ve sıralamayı etkiler. Aynı girdi → aynı çıktı.

---

## Neden AI Cevap Üretmiyor?

Çünkü amaç uzmanın yerine düşünmek değil, onun hazinesini önüne getirmektir. AI cevap üretirse: (a) halüsinasyon riski, (b) kaynaksız/kanıtlanamaz çıktı, (c) teşhis/tedavi sorumluluğu, (d) modele bağımlılık doğar. AI'yı "anlama"yla sınırlamak; ürünü yasal, etik ve model-bağımsız kılar.

---

## Uzun Vadeli Hedef

- Tüm modüllerin taranması (bilgi kütüphaneleri + danışan geçmişi).
- Çok dilli kullanım (uzman hangi dilde yazarsa yazsın aynı hazineye ulaşır).
- Küresel ölçek — kültürel içerik lokalizasyonu ve gizlilik uyumu (KVKK/GDPR) ile.

---

## Değişmezler

- Kanıt yoksa sonuç yok (Kanıt Kuralı, INV-1).
- AI yalnız Kavram Kümesi üretir; cevap üretmez; kayıt seçmez.
- Sonuçlara yalnız Kanıt Kapısı karar verir.
- Bilginin tek kaynağı sistem içi kayıtlardır.

---

## Sonraki Doküman

→ [`01-architecture.md`](./01-architecture.md) — sistemin uçtan uca mimarisi.
