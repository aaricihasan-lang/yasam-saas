# 03 — FAZ 1: İndeks Modeli

## İçindekiler

- [Amaç](#amaç)
- [Tasarım İlkesi: İndekslenebilir Birim](#tasarım-i̇lkesi-i̇ndekslenebilir-birim)
- [`yasam_hafizasi_index` Şeması](#yasam_hafizasi_index-şeması)
- [Kritik İkili: search_tsv vs evidence_fields](#kritik-i̇kili-search_tsv-vs-evidence_fields)
- [Yardımcı Tablolar](#yardımcı-tablolar)
- [İndeksleyici Config Sistemi](#i̇ndeksleyici-config-sistemi)
- [group_key ve section_ref](#group_key-ve-section_ref)
- [topic_tags ve expert_relations](#topic_tags-ve-expert_relations)
- [content_hash ve Embedding Yaklaşımı](#content_hash-ve-embedding-yaklaşımı)
- [Değişmezler](#değişmezler)
- [Açık Kararlar](#açık-kararlar)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 1, tüm kaynakları besleyecek **merkezi indeks modelini** ve onu dolduran **bildirimsel config sistemini** tanımlar. Şema, lexical (F2), semantic (F3), AI (F4) ve PII (F5) katmanlarını **gün-1'den** taşıyacak biçimde tasarlanır — sonradan migration ağrısı olmaması için.

> Bu doküman kavramsal alan tanımlarıdır; DDL/SQL içermez.

---

## Tasarım İlkesi: İndekslenebilir Birim

Bir indeks satırı = bir **indekslenebilir birim** (`unit_type`):
- `record` — tüm kayıt (çoğu tablo).
- `section` — bölüm (healing_guide_sections, raw_json adımları).
- `row` — satır (aromatherapy_reference_rows).

Bölüm-yapılı kaynaklar doğal **paragraf granülerliği** verir ("ilgili paragraf" özelliği buradan gelir).

---

## `yasam_hafizasi_index` Şeması

| Alan | Tip | Amaç / Kural bağı |
|---|---|---|
| `id` | uuid PK | — |
| `tenant_id` | uuid **null** | Tenant izolasyonu; NULL=shared; JOIN'de denormalize |
| `is_shared` | bool (türev) | tenant_id IS NULL kısayolu |
| `source_module` | text | Provenance (refleksoloji, sifa_rehberi, …) |
| `source_table` | text | Provenance |
| `source_id` | uuid | Orijinal kayıt → "Kaydı Aç" |
| `unit_type` | text | record / section / row |
| `section_ref` | text null | Alt-konum (section id / alan adı / row_index / json adım / not item id) |
| `group_key` | text | Kart gruplama anahtarı |
| `title` | text | Kart başlığı |
| `title_source` | text | Başlığın kaynağı (provenance) |
| `snippet` | text | Gösterilecek **birebir** paragraf |
| `snippet_origin` | text | Snippet'in alan kaynağı |
| `search_text` | text | Birleşik lexical korpus (yedek/okunur) |
| `search_tsv` | tsvector (türev) | **Lexical retrieval motoru** (ağırlıklı) |
| `evidence_fields` | jsonb | **Kanıt Kapısı'nın taradığı yapı** `[{origin, kind, text, section_ref}]` |
| `topic_tags` | text[] | Etiket kanıtı (GIN index) |
| `expert_relations` | jsonb | Uzman-ilişki kanıtı `[{kind, target_label}]` |
| `lang` | text | Kayıt dili (çok dilli gelecek) |
| `is_client_pii` | bool | PII kapısı (varsayılan false) |
| `source_updated_at` | timestamptz | Kaynak tazeliği |
| `reviewed_at` / `version` | null | Yaşam döngüsü etiketi (M5) |
| `content_hash` | text | Incremental re-index tetiği |
| `embed_model` | text null | Model versiyonlama |
| `indexed_at` | timestamptz | — |

> **Not (F3 rafinesi):** embedding değeri inline kolon yerine yan tablo `yh_embeddings(index_id, embed_model, dim, vector)` içinde tutulur — model değişiminde migration'sız geçiş için. Bkz [`05-phase-3-semantic-search.md`](./05-phase-3-semantic-search.md).

**Benzersizlik:** `(source_table, source_id, section_ref)`.

---

## Kritik İkili: search_tsv vs evidence_fields

- **`search_tsv`** → hızlı aday bulma (ağırlıklı A=title / B=tag+ilişki / C=paragraf / D=diğer). tsvector "nerede eşleşti"yi insan-okunur veremez.
- **`evidence_fields`** → hangi alanda hangi terimin geçtiğini **birebir** tutar. Kanıt Kapısı, derece ve "Neden?" bundan üretilir.

İkisi ayrı tutulur; bu ayrım Kanıt Kuralı'nın deterministik uygulanmasını sağlar.

---

## Yardımcı Tablolar

| Tablo | Rol |
|---|---|
| `yh_topic_dictionary` | Küratörlü eş-anlam/kavram sözlüğü (L2, deterministik) |
| `yh_query_cache` | Tekrar sorgu azaltma |
| `yh_query_log` | Gözlemlenebilirlik + maliyet |
| `yh_usage_signals` | Favori/açılma/sıklık (M7, yalnız uzmanın kendi kullanımı) |
| `yh_index_state` | Tazelik/reconcile/tombstone takibi |
| `yh_embeddings` | (F3) Model-agnostik embedding yan tablosu |

---

## İndeksleyici Config Sistemi

Her kaynak tablo **tek bildirimsel config girdisi** ile tanımlanır → yeni modül = yeni girdi, şema değişmez (Anayasa Madde 10 hedefi).

```
IndexSource {
  module, table, unit: 'record'|'section'|'row',
  tenant:  { mode: 'column', column: 'tenant_id' }
         | { mode: 'join', via, joinTable, joinColumn },
  title:   { strategy: 'column'|'firstSentence'|'label', column },
  snippet: { column, fallback: [...] },
  evidenceFields: [ { origin, column|path, kind: 'title'|'paragraph'|'tag'|'relation'|'note', split?, sectionRef? } ],
  topicTags: [columns],
  expertRelations: [ { origin, kind: 'relation', split? } ],
  groupKey: 'module:type:{id}',
  pii: false,
  filters: [ excludeDemoTenant, isActive?, excludeStoneExclusions? ],
  lifecycle: { updatedAt, reviewedAt?, version? }
}
```

> Bu, tasarım gösterimidir (pseudo-notasyon), işlevsel kod değildir. Tam alan eşlemesi FAZ 0'dan gelir.

---

## group_key ve section_ref

- **`section_ref`** — bir kaydın alt-konumu; "ilgili paragraf" ve "İlgili Bölüme Git" bunu kullanır.
- **`group_key`** — aynı kaydın çok bölüm eşleşmesini **tek kartta** gruplar (module:parent). UI, 5 section eşleşmesini 1 kart olarak gösterir.

---

## topic_tags ve expert_relations

- **`topic_tags`** — kategori/etiket alanları → `evidence_type=tag`.
- **`expert_relations`** — uzmanın tanımladığı çapraz-referanslar (related_stones, iceren_taslar, onerilen_taslar, blends_well_with, chakras, stones_text…) → `evidence_type=relation`. Kanıt Kuralı'nın "uzman-tanımlı ilişki" ayağı bu alanla beslenir; yeni yapı gerekmez.

---

## content_hash ve Embedding Yaklaşımı

- **`content_hash`** — indekslenen içeriğin hash'i; değişmedikçe yeniden gömme/indeksleme yok (maliyet kontrolü + tazelik).
- **Embedding** — FAZ 1'de değer üretilmez; yalnız yapı rezerve edilir. FAZ 3'te yan tablo `yh_embeddings` ile doldurulur. Böylece Hızlı Tarama (F2) embedding olmadan tam çalışır.

---

## Değişmezler

- Her indeks satırı Kanıt Kapısı için yeterli `evidence_fields` taşır.
- `is_client_pii=true` satırlar ayrı PII indeksinde yaşar (F5); ana indekste asla değil.
- JOIN tablolarında tenant_id daima parent'ın güncel tenant'ına eşittir.

---

## Açık Kararlar

- Sınırda-PII tabloların (reflexology_notes, bioenergy_sessions) hangi indekse gireceği FAZ 7'de MUST karar olarak işaretli.

---

## Sonraki Faz

→ [`04-phase-2-fast-search.md`](./04-phase-2-fast-search.md) — Hızlı Tarama (lexical, deterministik).
