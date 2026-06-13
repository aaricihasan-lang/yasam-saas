# Word Raporlama Sistemi

> **Durum:** Tamamlandı — Faz 1–7 (Haziran 2026)
> **Kural:** Bu doküman sistemin bakım ve genişletme rehberidir. Rapor içeriklerine dokunulmadan önce bu doküman okunmalıdır.

---

## 1. Sistemin Amacı

Yaşam SaaS'ta tüm modüllerin verilerini profesyonel `.docx` formatında dışa aktarmak. Kullanıcı seçtiği kayıtları veya tüm veriyi tek tıkla Word belgesi olarak indirebilir.

---

## 2. Ortak Altyapı

### 2.1 `lib/docx/reportHelpers.ts`

Tüm Word raporları bu merkezi helper'dan beslenir. **Yeni stil sistemi buraya eklenmez, mevcut fonksiyonlar kullanılır.**

| Fonksiyon | Görevi |
|---|---|
| `buildPremiumCover(...)` | Premium kapak sayfası (gradient, başlık, istatistikler) |
| `buildStatsPage(rows)` | Sistem özeti tablosu |
| `buildTOCPage()` | İçindekiler sayfası |
| `buildFooter(text)` | Her sayfada alt bilgi |
| `h1Colored(text, color, pageBreak?)` | Birinci düzey başlık |
| `h2(text)` | İkinci düzey başlık |
| `h3(text)` | Üçüncü düzey başlık |
| `bodyText(text)` | Paragraf metni |
| `twoColTable(rows)` | İki sütunlu bilgi tablosu |
| `profileLabel(text, color)` | Kayıt numarası etiketi |
| `divider()` | Kayıtlar arası ayırıcı |
| `spacer()` | Boş satır |
| `muted(text)` | Gri yardımcı metin |
| `fieldInline(label, value)` | Satır içi etiket-değer |
| `arraySection(title, items)` | Liste bölümü |
| `embedImageParagraph(...)` | Gömülü görsel |

### 2.2 `components/common/BulkExportBar`

Liste sayfalarında standart çoklu seçim + export çubuğu.

```tsx
<BulkExportBar
  selectedCount={selectedIds.size}
  totalCount={rows.length}
  filteredCount={filteredRows.length}     // isteğe bağlı
  hasActiveFilter={Boolean(searchTerm)}  // isteğe bağlı
  onSelectAll={() => setSelectedIds(new Set(rows.map(r => r.id)))}
  onClearSelection={() => setSelectedIds(new Set())}
  onExportSelected={() => void exportWord("selected")}
  onExportAll={() => void exportWord("all")}
  onExportFiltered={() => void exportWord("filtered")}  // isteğe bağlı
  isExporting={wordBusy}
/>
```

---

## 3. Word Rapor Standartları

Her Word raporu aşağıdaki sırayı izler:

1. **Premium Kapak** — Yaşam Sistemi logosu, modül adı, tarih, istatistik kutucukları
2. **Sistem Özeti** — Anahtar metriklerin tablo görünümü
3. **İçindekiler** — Bölüm listesi
4. **İçerik Bölümleri** — `h1Colored` → `h2` → `h3` → `bodyText` hiyerarşisi
5. **Footer** — "Modül Adı Raporu · Yaşam Sistemi" formatında her sayfada

### Renk Kodlaması (hex, `#` olmadan)

| Modül | Renk | Hex |
|---|---|---|
| Danışan | Lacivert | `1e3a5f` |
| Doğaltaş | Koyu yeşil | `14532d` |
| Mineral | Yeşil | *(SECTION_COLORS.minerals)* |
| Kombinasyon | Derin mor | `3b0764` |
| Numeroloji | Derin mor | `4c1d95` |
| Ajanda | Lacivert | `1e3a5f` |
| Refleksoloji | Pembe-mor | `be185d` |
| Biyoenerji Seanslar | Turuncu | `ea580c` |
| Biyoenerji Çakralar | Çakra mor | `9333ea` |
| Biyoenerji Enerji Bedenleri | Cyan | `0891b2` |
| Biyoenerji Bilinçaltı | Violet | `7c3aed` |
| Biyoenerji İmajinasyon | Amber | `d97706` |
| Biyoenerji Sembol | Zümrüt | `059669` |

---

## 4. Endpoint Listesi

Tüm endpoint'ler `POST` metodunu kullanır. `tenantId` her endpoint'te zorunludur.

| Endpoint | Tablo(lar) | Export Modları |
|---|---|---|
| `/api/clients/[id]/word-report` | clients, sessions, stones, appointments, homeworks, analyses | full, tab, date-range |
| `/api/clients/word-report-bulk` | clients, client_notes | all, selected, filtered |
| `/api/dogaltas/word-report` | stones, minerals, combinations, stone_knowledge_articles | sections (boolean flags) |
| `/api/dogaltas/stones/[id]/word-report` | stones | single |
| `/api/dogaltas/minerals/[id]/word-report` | minerals | single |
| `/api/dogaltas/mineral-report` | minerals | all, filtered, viewed, selected |
| `/api/dogaltas/combinations/word-report` | combinations | all, selected, filtered, single |
| `/api/dogaltas/knowledge-report` | stone_knowledge_articles | all, filtered (knowledgeIds+stoneIds) |
| `/api/numeroloji/word-report` | numerology_records | all, selected, single |
| `/api/numeroloji/knowledge-report` | numerology_knowledge, stone_assignments | all, filtered |
| `/api/ajanda/word-report` | appointments, clients | all, selected, filtered, weekly, monthly, single |
| `/api/refleksoloji/protocol-report` | reflexology_protocols | all, selected, single |
| `/api/biyoenerji/session-report` | bioenergy_sessions | all, selected, single |
| `/api/biyoenerji/chakra-report` | bioenergy_chakras | all, selected, single |
| `/api/biyoenerji/energy-body-report` | bioenergy_energy_bodies | all, selected, single |
| `/api/biyoenerji/subconscious-report` | bioenergy_subconscious_causes | all, selected, single |
| `/api/biyoenerji/imagination-report` | bioenergy_imaginations | all, selected, single |
| `/api/biyoenerji/symbol-report` | bioenergy_symbols | all, selected, single |
| `/api/urun-stok/stock-report` | live_stock | all, critical |

---

## 5. Modül Bazlı Rapor Envanteri

### Danışan

| Export | Konum | Payload |
|---|---|---|
| Tam Danışan Dosyası | Danışan detay tab bar | `{ tenantId, exportMode: "full" }` |
| Sekme Word | Her sekmede küçük buton | `{ tenantId, exportMode: "tab", tabName }` |
| Tarih Aralığı | Collapsible panel | `{ tenantId, exportMode: "date-range", dateRange: { start, end } }` |
| Tümünü/Seçili/Filtreli | Danışan listesi BulkExportBar | `{ tenantId, exportMode, clientIds? }` |

### Doğaltaş

| Export | Konum | Payload |
|---|---|---|
| Tek Taş Word | Taş detay sayfası | `{ tenantId }` *(id URL'den gelir)* |
| Yönetim Raporu | Taş listesi Word modal | `{ tenantId, sections, selectedStoneIds?, includeImages }` |
| Tümünü/Seçili/Filtreli | Taş listesi BulkExportBar | `{ tenantId, sections, selectedStoneIds }` |
| Tek Mineral Word | Mineral detay sayfası | `{ tenantId }` *(id URL'den gelir)* |
| Mineral Tümü/Seçili/Filtreli | Mineral listesi BulkExportBar + modal | `{ tenantId, exportMode, mineralIds? }` |
| Tek Kombinasyon Word | Kombinasyon detay | `{ tenantId, exportMode: "single", combinationTitle }` |
| Kombinasyon Tümü/Seçili | Kombinasyon listesi | `{ tenantId, exportMode, issues? }` |

### Numeroloji

| Export | Konum | Payload |
|---|---|---|
| Tek Analiz Word | Analiz detay sayfası | `{ tenantId, exportMode: "single", recordId }` |
| Tümünü/Seçili/Filtreli | Liste BulkExportBar | `{ tenantId, exportMode, ids? }` |
| Bilgi Bankası Tümü/Filtreli | Bilgi bankası | `{ tenantId, exportMode, knowledgeIds?, stoneIds? }` |

### Ajanda

| Export | Konum | Payload |
|---|---|---|
| Tek Randevu Word | Randevu detail panel | `{ tenantId, exportMode: "single", appointmentId }` |
| Seçili/Filtreli | Inline export çubuğu | `{ tenantId, exportMode, appointmentIds }` |
| Haftalık | Inline export çubuğu | `{ tenantId, exportMode: "weekly", dateRange: { start, end } }` |
| Aylık | Inline export çubuğu | `{ tenantId, exportMode: "monthly", dateRange: { start, end } }` |
| Tümünü | Inline export çubuğu | `{ tenantId, exportMode: "all" }` |

### Refleksoloji

| Export | Konum | Payload |
|---|---|---|
| Tek Protokol Word | Protokol detay sayfası | `{ tenantId, exportMode: "single", protocolId }` |
| Tümünü/Seçili | Protokol listesi BulkExportBar | `{ tenantId, exportMode, protocolIds? }` |

### Biyoenerji (6 Modül)

Her modül için aynı üçlü desen:

| Export | Konum | Payload |
|---|---|---|
| Tek Kayıt Word | Detail panel / detail sayfası | `{ tenantId, exportMode: "single", id }` |
| Seçilenleri Word | BulkExportBar | `{ tenantId, exportMode: "selected", ids }` |
| Tümünü Word | BulkExportBar | `{ tenantId, exportMode: "all" }` |

Biyoenerji Seanslar aynı zamanda liste panelinde `BulkExportBar` kullanır.

### Canlı Stok

| Export | Konum | Payload |
|---|---|---|
| Tüm Stok Word | Stok istatistik paneli | `{ tenantId, exportMode: "all" }` |
| Kritik Stok Word | Stok istatistik paneli | `{ tenantId, exportMode: "critical" }` |

---

## 6. Güvenlik Kuralları

Tüm endpoint'lerde zorunlu olan kontroller:

```typescript
// 1. tenantId guard
if (!tenantId || typeof tenantId !== "string")
  return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

// 2. single mode guard
if (exportMode === "single" && !recordId)
  return Response.json({ ok: false, error: "Tek kayıt için id zorunludur." }, { status: 400 });

// 3. selected mode guard (gerektiğinde)
if (exportMode === "selected" && (!Array.isArray(ids) || ids.length === 0))
  return Response.json({ ok: false, error: "Seçili kayıtlar için ids zorunludur." }, { status: 400 });

// 4. tenant_id filtresi — HER sorguya
let query = db.from("table").select("*").eq("tenant_id", tenantId);
```

---

## 7. UI Standartları

### Zorunlu

- `wordBusy` / `isExporting` state: tüm export butonlarına `disabled={wordBusy}` eklenmeli
- Hata durumunda `useToast` ile kullanıcı bilgilendirilmeli
- Başarı durumunda `showToast({ type: "success" })` eklenmeli
- Boş seçimde "Seçilenleri Word" butonu `disabled={selectedIds.size === 0}` olmalı

### Liste sayfaları için

```typescript
async function exportWord(mode: "all" | "selected") {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return;
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, exportMode: mode };
    if (mode === "selected") {
      const ids = [...selectedIds];
      if (!ids.length) return;
      body.ids = ids;
    }
    const res = await fetch("/api/module/word-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `module-${mode}-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: "Başarılı", message: "Rapor indirildi.", type: "success" });
  } catch (err) {
    showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
  } finally {
    setWordBusy(false);
  }
}
```

---

## 8. Yeni Word Raporu Ekleme Rehberi

### Adım 1 — Tablo yapısını doğrula

Supabase'de tabloyu oku, alan adlarını not et. **Tahminle alan adı kullanma.**

### Adım 2 — Endpoint oluştur

```
app/api/{modul}/{slug}-report/route.ts
```

Şablon:

```typescript
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  bodyText, buildFooter, buildPremiumCover, buildStatsPage,
  buildTOCPage, divider, h1Colored, h2, h3, muted,
  profileLabel, ReportChild, spacer, twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", ids, id } = body as {
    tenantId?: string; exportMode?: "all" | "selected" | "single";
    ids?: string[]; id?: string;
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  if (exportMode === "single" && !id)
    return Response.json({ ok: false, error: "Tek kayıt için id zorunludur." }, { status: 400 });

  // ... DB sorgusu, her zaman .eq("tenant_id", tenantId)
  // ... Document oluşturma
  // ... Packer.toBuffer(doc) → Response
}
```

### Adım 3 — UI bağla

- Liste sayfasına `selectedForExport` state ekle
- `BulkExportBar` bileşenini entegre et
- `exportWord(mode)` fonksiyonunu ekle
- Detail sayfasına tek kayıt Word butonu ekle

### Adım 4 — Test

- Tümünü Word
- Seçilenleri Word (boş seçimde disabled)
- Tek kayıt Word
- Yanlış tenantId ile 401 aldığını doğrula
- Build + TypeScript temiz olmalı

---

## 9. Bilinçli Bırakılan Eksikler

### Şimdilik Yapılmayacaklar

| Alan | Neden |
|---|---|
| Human Design Word raporu | Büyük ayrı faz gerektirir; server-side hesaplama karmaşık |
| Refleksoloji Notlar Word | Mevcut danışan raporu zaten notları kapsıyor |
| Stok Hareketleri Word | LocalStorage tabanlı; server-side aktarım ayrı faz gerektirir |
| Satış Geçmişi Word | LocalStorage tabanlı; server-side aktarım ayrı faz gerektirir |
| Yağ/Sabun/Aksesuar/Diğer stok Word | LocalStorage tabanlı; mevcut canlı stok raporu ile kapsanıyor |
| YolculukTab özel Word | Tabs arası kompozit veri; danışan tam raporu zaten kapsıyor |
| Yaşam Analiz Merkezi ayrı endpoint | Danışan modülü zaten analiz sekmesini kapsıyor |

---

## 10. Performans Notları

- `runtime = "nodejs"` tüm endpoint'lerde zorunludur (docx Node.js Buffer kullanır)
- Büyük raporlar (1000+ kayıt) zaman alabilir; UI'da "Hazırlanıyor..." state göster
- Resimli taş raporlarında (`dogaltas/word-report`) `includeImages: false` varsayılanı kullanılabilir
- `Packer.toBuffer()` async'tir; `await` ile kullanılmalı
- Supabase sorguları paralel çekilebilir (`Promise.all`) — büyük raporlarda performansı artırır

---

## 11. Bilinen Kısıtlamalar

- Biyoenerji detail sayfaları (tek kayıt export'ları) hata durumunda sessiz fail eder — ileride toast eklenebilir
- `dogaltas/word-report` taş bölümü görsel indirme zaman alabilir; büyük kütüphaneler için timeout riski vardır
- Word formatı `.docx` (OOXML); PDF dışa aktarım şu an desteklenmiyor
- Ajanda haftalık/aylık aralıklar UTC'de hesaplanıyor; saat dilimi farkı kenar durumlarda etkileyebilir

---

## 12. Kapanış Durumu

| Metrik | Değer |
|---|---|
| Toplam Word endpoint | 19 |
| Kapsanan modül | 10 (Danışan, Doğaltaş, Mineral, Kombinasyon, Numeroloji, Bilgi Bankası, Ajanda, Refleksoloji, Biyoenerji x6, Stok) |
| Desteklenen export modları | all, selected, filtered, single, date-range, weekly, monthly, tab |
| Tenant güvenliği | 19/19 endpoint — tam |
| BulkExportBar kullanımı | Tüm liste sayfaları |
| Build durumu | Temiz |
| Son faz | Faz 7 (commit: `3f256ff`) |

**Word raporlama sistemi Haziran 2026 itibarıyla kapatılmış ve bakıma alınmıştır.**
