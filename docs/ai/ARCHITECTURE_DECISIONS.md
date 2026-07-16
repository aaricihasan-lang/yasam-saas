# MİMARİ KARARLAR (ARCHITECTURE DECISIONS)

> Bu dosya, projenin **mimari kararlarını ve gerekçelerini** tutar. Amaç,
> gelecekteki oturumların bir tasarımın **neden** o şekilde yapıldığını anlaması
> ve aynı gerekçeyi bilmeden bozmamasıdır.
>
> **`CHANGELOG_AI.md`'den farkı:** Changelog, *kronolojik karar akışını* (ne, ne
> zaman, hangi commit) tutar. Bu dosya ise *kalıcı mimari gerekçeyi* (neden bu
> tasarım, hangi alternatifler elendi, hangi değişmezler korunmalı) tutar.
>
> **Ne kaydedilir?** Bir bileşenin varlık nedenini açıklayan tasarım kararları;
> "bunu neden böyle yaptık?" sorusuna kalıcı yanıt olan her şey.
>
> **Format:** Aşağıdaki şablonla, en yeni karar **en üstte** eklenir. Bir karar
> değiştiğinde eski kayıt silinmez; **üzeri çizilerek** veya "Güncelleme" notuyla
> yeni kayıt eklenir (kurumsal hafıza korunur).

---

## Karar Şablonu

<!--
## AD-<numara> — <Karar Başlığı>

### Bağlam
<Hangi problem/ihtiyaç bu kararı gerektirdi?>

### Karar
<Ne yapıldığının net ifadesi>

### Gerekçe (Neden)
<Bu tasarımın neden seçildiği; çözdüğü problem>

### Değerlendirilen Alternatifler
- <Alternatif 1> — neden elendi
- <Alternatif 2> — neden elendi

### Sonuçlar / Değişmezler (Invariants)
<Bu karardan doğan kısıtlar; bozulmaması gereken değişmezler>

### İlgili
<İlgili dosyalar, commit'ler, CHANGELOG_AI kayıtları>
-->

---

## Kayıtlı Kararlar

> Aşağıdaki kayıtlar yalnızca **doğrulanmış** kaynaklardan yazılmıştır:
> `docs/yasam-hafizasi/` tasarım dokümanları ve `lib/yasam-hafizasi/` kaynak dosya
> başlıkları. Gerekçesi doğrulanamayan hiçbir şey eklenmemiştir.

### AD-004 — JSONB Ayrıştırma Neden Builder Katmanına Bırakıldı

**Kaynak (doğrulanmış):** `lib/yasam-hafizasi/indexer/sources.ts` başlık yorumu.

#### Bağlam
İndeks kaynak config'i (S2.03), tabloları ve kolon rollerini (title, search text,
snippet, tag, relation) bildirimsel olarak tanımlar. Bazı kaynak kolonları JSONB'dir.

#### Karar
Kaynak config **yalnız deklaratiftir; mantık içermez.** JSONB kolonları yalnız
gerçek kolon adıyla listelenir; JSONB içinden metin/tag/relation **ayrıştırma
yapılmaz**. Bu iş, sonraki **builder** aşamalarına (S2.05 alan çıkarımı / S2.07
evidence builder) bırakılmıştır. `jsonPath` bu katmanda tanımlanmaz.

#### Gerekçe (Neden)
Sorumlulukların ayrılması: config saf ve test edilebilir kalır (DB/IO/parse yok),
sürprizli JSONB şema mantığı tek bir builder katmanında toplanır. Erken ayrıştırma,
deklaratif config'i mantığa ve yan etkiye bulaştırırdı.

#### Sonuçlar / Değişmezler
- Config dosyasında DB sorgusu, normalize, evidence, scoring **bulunmaz**.
- title fallback (ör. "content ilk cümlesi") yoktur; yalnız gerçek kolon adları.

---

### AD-003 — Kanıt Kapısı (Evidence Gate) Neden Bu Şekilde Çalışıyor

**Kaynak (doğrulanmış):** `docs/yasam-hafizasi/00-overview.md` (Kanıt Kuralı,
Kanıt Kapısı, Değişmezler); `lib/yasam-hafizasi/search/types.ts`.

#### Bağlam
AI destekli bir "Uzman Hafızası" arama sistemi; kapalı korpus (yalnız uzmanın
kaydı). Ürün Anayasası (v1.0, 10 madde) tüm teknik kararların üstündedir.

#### Karar
Aday üretiminden (lexical/semantic) **sonra** çalışan deterministik bir kapı, her
aday için Kavram Kümesi'nden somut kanıt (başlık/etiket/paragraf/ilişki) arar;
bulamazsa adayı düşürür. Görünür sonuca **yalnız bu kapı** karar verir. AI yalnız
Kavram Kümesi (C) üretir; korpusu görmez, kayıt seçmez, metin yazmaz.

#### Gerekçe (Neden)
Halüsinasyonu, kaynaksız/kanıtlanamaz çıktıyı, teşhis/tedavi sorumluluğunu ve
model bağımlılığını **yapısal olarak** engellemek. Provenance yerleşiktir:
kaynaksız çıktı imkânsız. "Dürüst boşluk > uydurma doluluk."

#### Sonuçlar / Değişmezler
- **INV-1:** Kanıtsız aday görünmez.
- **INV-2:** "Neden gösterildi?" yalnız Evidence kaydından deterministik şablonla üretilir; AI kullanılmaz.
- Derece (Çok güçlü/Güçlü/Zayıf) kanıt türünden deterministik hesaplanır; AI/vektör skoru dereceyi belirlemez.

---

### AD-002 — PII Neden İki (Ayrı Fiziksel) İndeks Oldu

**Kaynak (doğrulanmış):** `lib/yasam-hafizasi/config.ts` (YH_TABLES, YH_SOURCE_MODULES,
PII notu); `docs/yasam-hafizasi/10-roadmap.md` (S1: `yasam_hafizasi_index` +
`yasam_hafizasi_index_PII`); `docs/yasam-hafizasi/07-phase-5-pii-security.md`.

#### Bağlam
Sistem hem uzmanın bilgi/kütüphane kayıtlarını hem de danışan geçmişini (PII)
taramayı hedefler. `reflexology_notes` ve `bioenergy_sessions` ihtiyatla PII kabul
edilir ve bilgi-modül kapsamının dışına alınmıştır (F5'e ertelendi).

#### Karar
İki **ayrı fiziksel indeks**: `yasam_hafizasi_index` (PII-dışı bilgi/kütüphane) ve
`yasam_hafizasi_index_PII` (danışan verisi). PII retrieval'i client_id'ye kapsanır;
PII harici embedding/AI'ya çıkmaz.

#### Gerekçe (Neden)
Gizlilik ve KVKK/GDPR uyumu için PII'yi fiziksel olarak izole etmek; cross-tenant /
cross-client sızıntı yüzeyini en aza indirmek ve RTBF (silinme hakkı) uygulanabilir
kılmak. "İhtiyatlı varsayılan": sınırda veri PII sayılır.

#### Sonuçlar / Değişmezler
- **INV-PII:** Danışan verisi ayrı fiziksel indekste; client_id kapsanır; PII harici embedding/AI'ya gitmez.
- **INV-TENANT:** Her sorgu `tenant_id = session` (veya açık izinle shared NULL) filtreler.
- PII indeksleme, ayrı analiz + mimari karar olmadan başlamaz.

---

### AD-001 — Tenant Resolver Neden Bu Şekilde (Saf Fonksiyon) Tasarlandı

**Kaynak (doğrulanmış):** `lib/yasam-hafizasi/indexer/tenantResolve.ts` başlık ve
implementasyon.

#### Bağlam
17 kaynak tablonun her satırı için indekse yazılacak tenant sahipliği (tenant_id
veya NULL=shared) belirlenmelidir. Bazı kaynaklarda tenant kolonda (column mode),
bazılarında parent tablodan FK ile (join mode) çözülür.

#### Karar
`resolveTenant(config, row, parentLookup?)` **saf (pure) fonksiyondur.** İçinde
Supabase / DB sorgusu / fetch / env / normalize / evidence / demo / PII kontrolü
**yoktur.** Join mode'da gereken parent tenant DB erişimi, çağıran (S2.08 runner)
tarafından `ParentTenantLookup` olarak **enjekte edilir.** Sonuç, exception yerine
discriminated union (`ok:true|false`) döner.

#### Gerekçe (Neden)
Determinizm ve tam test edilebilirlik: aynı girdi → aynı çıktı, IO olmadan.
**Fail-closed** güvenlik: eksik/geçersiz değerler (boş/whitespace/non-uuid) coercion
ile "geçerli hale getirilmez"; reddedilir. DB erişiminin enjekte edilmesi, saflık
sınırını korur ve tenant izolasyonunu tek, doğrulanabilir yerde toplar.

#### Sonuçlar / Değişmezler
- Başarılı her sonuçta: `isShared === (tenantId === null)`.
- Görünürlük kararı (session + shared birlikte) burada **değil**, retrieval'a (S2.13) aittir.
- Hiçbir runtime değeri `String()/number/trim` ile normalize edilmez.

<!-- Yeni mimari kararlar buraya, en yeni en üstte olacak şekilde eklenir. -->
