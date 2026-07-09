# 02 — FAZ 0: Kaynak Envanteri ve Alan Whitelist Haritası

## İçindekiler

- [Amaç](#amaç)
- [Yöntem Notu](#yöntem-notu)
- [Kaynak Envanteri](#kaynak-envanteri)
- [Alan Rol Eşlemesi](#alan-rol-eşlemesi)
- [tenant_id Olmayan Tablolar — JOIN/Denormalizasyon](#tenant_id-olmayan-tablolar--joindenormalizasyon)
- [Shared (NULL tenant) Kayıtlar](#shared-null-tenant-kayıtlar)
- [PII Sınıflandırması](#pii-sınıflandırması)
- [Kritik Riskler](#kritik-riskler)
- [Kararlar](#kararlar)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 0, indekslenecek her kaynak tablonun **gerçek şemasını, tenant_id/client_id varlığını, RLS durumunu ve PII durumunu** doğrular; ardından her alanın indeks rolünü (title/snippet/search_text/topic_tags/expert_relations/section_ref) belirler. Bu, FAZ 1 indeks modelinin temelidir.

---

## Yöntem Notu

Bazı tablolar migration DDL'i olmadan (Supabase kurulumunda elle) oluşturulmuştur. Bu tabloların kolonları API route / config dosyalarından doğrulanmış ve **"DDL yok"** olarak işaretlenmiştir — şema gerçeği kodda yaşar.

---

## Kaynak Envanteri

| # | Tablo | Modül | DDL | tenant_id | client_id | RLS | PII | İndeks Fazı |
|---|---|---|---|---|---|---|---|---|
| 1 | `reflexology_protocols` | Refleksoloji | ❌ (route) | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 2 | `reflexology_notes` | Refleksoloji | ✅ | ✅ | — | 🔒 ENABLE+REVOKE | ⚠️ sınırda | F5* |
| 3 | `reflexology_atlas` | Refleksoloji | ✅ | ✅ (PK) | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 (düşük) |
| 4 | `healing_guides` | Şifa Rehberi | ❌ (route) | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 5 | `healing_guide_sections` | Şifa Rehberi | ✅ | ⚠️ YOK (JOIN) | — | JOIN, service-role | Hayır | F1–4 |
| 6 | `bioenergy_subconscious_causes` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | Hayır | F1–4 |
| 7 | `bioenergy_sessions` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | ⚠️ sınırda | F5* |
| 8 | `bioenergy_energy_bodies` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | Hayır | F1–4 |
| 9 | `bioenergy_imaginations` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | Hayır | F1–4 |
| 10 | `bioenergy_symbols` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | Hayır | F1–4 |
| 11 | `bioenergy_chakras` | Biyoenerji | ✅(RLS) | ✅ | — | 🔒 ENABLE+policy | Hayır | F1–4 |
| 12 | `stones` | Doğaltaş | ❌ (route) | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 13 | `minerals` | Doğaltaş | ❌ (route) | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 14 | `stone_knowledge_articles` | Doğaltaş | ✅ | ✅ (NULL=shared) | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 15 | `combinations` | Doğaltaş | ❌ (route) | ✅ | — | 🔒 ENABLE+deny | Hayır | F1–4 |
| 16 | `client_combinations` | Doğaltaş | ✅ | ✅ | ✅ | 🔒 ENABLE+deny | ✅ PII | **F5** |
| 17 | `stone_exclusions` | Doğaltaş | ✅ | ✅ | — | 🔒 ENABLE+REVOKE | Düşük | ❌ (yalnız filtre) |
| 18 | `aromatherapy_oils` | Aromaterapi | ✅ | ✅ (NULL) | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 19 | `aromatherapy_reference_sheets` | Aromaterapi | ✅ | ✅ (NULL) | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 20 | `aromatherapy_reference_rows` | Aromaterapi | ✅ | ⚠️ YOK (JOIN) | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 21 | `aromatherapy_blends` | Aromaterapi | ✅ | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 22 | `aromatherapy_knowledge_articles` | Aromaterapi | ✅ | ✅ (NULL) | — | ⚠️ **AÇIK (DISABLE)** | Hayır | F1–4 ⚠️ |
| 23 | `personal_archives` | Kişisel Arşiv | ❌ (route) | ✅ | — | 🔒 ENABLE+REVOKE | Hayır | F1–4 |
| 24 | `personal_archive_files` | Kişisel Arşiv | ❌ (route) | ✅ | — | ⚠️ SELECT açık / yazma kilitli | Hayır | F1–4 (yalnız ad) |
| 25 | `client_notes` | Danışan geçmişi | ❌ | ✅ | ✅ | 🔒 ENABLE+REVOKE | ✅ PII | **F5** |
| 26 | `client_sessions` | Danışan geçmişi | ❌ | ✅ | ✅ | 🔒 ENABLE+REVOKE | ✅ PII | **F5** |
| 27 | `client_analyses` | Danışan geçmişi | ⚠️ kısmi | ✅ | ✅ | 🔒 ENABLE+REVOKE | ✅ PII | **F5** |

`*` = uzman kütüphanesi ama içerik danışana atıf içerebilir → ihtiyatla F5.

---

## Alan Rol Eşlemesi

Roller: **title** (kart başlığı) · **search_text** (kanıt korpusu) · **snippet** (gösterilecek paragraf) · **topic_tags** (etiket kanıtı) · **expert_relations** (uzman-ilişki kanıtı) · **section_ref** (paragraf granülerliği).

| Tablo | title | snippet | tag | relation | section_ref | tenant |
|---|---|---|---|---|---|---|
| reflexology_protocols | title | application_notes | organs, target_problem | organs | raw_json adım | column |
| healing_guides | name | general_summary | category | related_stones, related_reflexology | alan adı | column |
| healing_guide_sections | title (+parent) | **note** | section_type, mode | — | section id | **JOIN** |
| bioenergy_subconscious_causes | title | content | category | — | — | column |
| bioenergy_energy_bodies | ⚠️ firstSentence/label | genel_tanim | — | onerilen_taslar | — | column |
| bioenergy_chakras | name | causes/physical/mental | color, organs | stones, organs, glands | fizik/mental | column |
| stones | stone_name | short_description | chakras, warning_tags | chakras, assignments, warning_tags | etki alanı | column |
| minerals | name | aciklama | kategori, cakralar | iceren_taslar, cakralar | — | column |
| stone_knowledge_articles | title | content | tags, category, keyword | related_stones, related_minerals | — | column (NULL) |
| combinations | issue | description | — | stones_text | variant_index | column |
| aromatherapy_oils | name (+latin) | benefits | oil_type, category, therapeutic_properties | blends_well_with, chakra_connection | güvenlik | column (NULL) |
| aromatherapy_reference_rows | sheet display_title | satır hücreleri | headers | — | sheet_id+row_index | **JOIN** |
| aromatherapy_blends | name | notes | — | items[], carrier_oil_name | — | column |
| personal_archives | title | note | category, tags | — | — | column |

> Kalan biyoenerji/aroma/refleksoloji tabloları benzer desenle eşlenmiştir; tam liste FAZ 1 config'inde.

---

## tenant_id Olmayan Tablolar — JOIN/Denormalizasyon

İki tablonun `tenant_id`'si yoktur; tenant, parent'tan çözülür:

- `healing_guide_sections` → `guide_id` → `healing_guides.tenant_id`
- `aromatherapy_reference_rows` → `sheet_id` → `aromatherapy_reference_sheets.tenant_id`

**Kural:** İndeksleme anında tenant çözülüp indeks satırına **denormalize** edilir; parent değişir/silinirse çocuk yeniden-indekslenir/tombstone'lanır (reconcile denetler).

---

## Shared (NULL tenant) Kayıtlar

`stone_knowledge_articles`, `aromatherapy_oils/sheets/knowledge` `tenant_id = NULL` olabilir = paylaşımlı referans. Sorgu `tenant = session OR NULL` ile bunları herkese açar. **PII asla NULL tenant olamaz.**

---

## PII Sınıflandırması

- **Kesin PII (F5):** `client_notes`, `client_sessions`, `client_analyses`, `client_combinations` (client_id taşır).
- **Sınırda / ihtiyatla F5:** `reflexology_notes`, `bioenergy_sessions` (içerik danışana atıf içerebilir).
- **PII değil (F1–4):** diğer tüm tablolar.

---

## Kritik Riskler

1. ⚠️ **`aromatherapy_knowledge_articles` RLS AÇIK (DISABLE)** — kilit listesinde yok. İndekslerken app-katmanı tenant filtresi zorunlu + kilitleme borcu.
2. ⚠️ **tenant_id'siz 2 tablo** → denormalizasyon zorunlu (yukarıda).
3. ⚠️ **`bioenergy_energy_bodies` başlık kolonu yok** → title stratejisi (source_uid/genel_tanim ilk cümle).
4. ⚠️ **`personal_archive_files` SELECT açık** + belge içeriği storage'da (DB'de değil) → yalnız `file_name`, içerik-çıkarımı ertelendi.
5. **Uzman ilişkileri hazır** (`related_stones`, `iceren_taslar`, `onerilen_taslar`, `blends_well_with`, `chakras`, `stones_text`…) → Kanıt Kuralı `evidence_type=relation` için altyapı.
6. **DDL'siz tablolar** → şema gerçeği kodda.
7. **Demo tenant** (`40f842a0-…`) indekslemede atlanır.
8. **`client_notes.adres`** saf kimlik PII → search_text'e girmez.

---

## Kararlar

- 20 tablo F1–4 (uzman kütüphanesi), 6 tablo F5 (4 kesin + 2 sınırda PII), 1 tablo yalnız-filtre (`stone_exclusions`).
- `healing_guide_sections.note` = en iyi "ilgili paragraf" kaynağı.
- Sınırda-PII tabloların nihai sınıfı FAZ 7'de **açık karar** olarak işaretlendi (ihtiyatla PII).

---

## Sonraki Faz

→ [`03-phase-1-index-model.md`](./03-phase-1-index-model.md) — indeks modeli ve config sistemi.
