# 07 — FAZ 5: Danışan Geçmişi / PII / Gizlilik (KVKK/GDPR)

## İçindekiler

- [Amaç](#amaç)
- [Çekirdek Karar: Tek Motor, İki İndeks](#çekirdek-karar-tek-motor-i̇ki-i̇ndeks)
- [Dört Garanti](#dört-garanti)
- [PII Veri Sınıflandırması](#pii-veri-sınıflandırması)
- [is_client_pii Mimarisi](#is_client_pii-mimarisi)
- [Kaynak Tabloların Tasarımı](#kaynak-tabloların-tasarımı)
- [Client Scope ve Tenant Scope](#client-scope-ve-tenant-scope)
- [Erişim Modeli ve Yetki Seviyeleri](#erişim-modeli-ve-yetki-seviyeleri)
- [Arama Akışları](#arama-akışları)
- [PII ve Embedding / AI](#pii-ve-embedding--ai)
- [Cache, Log, Audit](#cache-log-audit)
- [Saklama, Silme, Right to be Forgotten](#saklama-silme-right-to-be-forgotten)
- [Backup / Restore](#backup--restore)
- [KVKK/GDPR Hizası](#kvkkgdpr-hizası)
- [Değişmezler](#değişmezler)
- [Açık Kararlar](#açık-kararlar)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 5, danışan geçmişini (PII) Yaşam Hafızası'na **en yüksek gizlilik seviyesinde** dahil eder. PII koruması mimari seviyededir: bir sızıntı için hiç referans verilmeyen bir tabloya erişmek gerekir.

---

## Çekirdek Karar: Tek Motor, İki İndeks

```
yasam_hafizasi_index            yasam_hafizasi_index_PII
(bilgi, is_client_pii=false)    (danışan, is_client_pii=true)
tenant_id (NULL=shared OK)      tenant_id + client_id ZORUNLU
embedding: dış model OK         embedding: yalnız yerel / YOK
Ana modül araması buraya        Yalnız danışan bağlamı + gated
```

Ana modül araması PII tablosunu **hiç referans etmez** → PII'yi kazara döndürmesi yapısal olarak imkânsız. Motor (normalize/kapı/derece/neden) paylaşılır; yalnız aday kaynağı ayrışır.

---

## Dört Garanti

| Garanti | Mekanizma |
|---|---|
| Bir danışanın bilgisi başka danışana asla karışamaz | PII satırları `client_id` taşır · varsayılan `client_id=:current` eşitliği · çapraz-danışan yalnız açık+etiketli+audit+otomatik-yazmaz |
| Başka uzmanın danışan verisi asla görülemez | Zorunlu `tenant_id=:session` · ayrı PII tablosu + kendi RLS · service-role only · PII asla NULL-tenant |
| PII hiçbir zaman yanlışlıkla AI'ya gönderilemez | pii_safe yol zorunlu · dış embedding PII'ye yasak · modül araması PII'ye dokunmaz |
| Silinen danışanın izi indekslerde kalmaz | cascade hard-delete · embedding+cache purge · reconcile doğrulama · restore tombstone |

---

## PII Veri Sınıflandırması

| Kat | İçerik | Kural |
|---|---|---|
| **T0 — Kimlik** | ad, telefon, adres, doğum tarihi | **Asla indekslenmez/gömülmez** |
| **T1 — Sağlık anlatısı** (özel nitelikli) | client_notes içerik, sessions, analyses, client_combinations | PII indeksi, client-scoped, sıkı kapı |
| **T2 — Bilgi kütüphanesi** | diğer tüm modüller | Ana indeks (F1–4) |

---

## is_client_pii Mimarisi

`is_client_pii` bir ayırt edici değil, **yönlendirici**dir: `true` satırlar fiziksel olarak PII indeksinde yaşar, ana indekse asla yazılmaz. PII satırları asla NULL tenant olamaz; client_id zorunludur.

---

## Kaynak Tabloların Tasarımı

| Tablo | Birim | search alanları | title (kimliksiz) | section_ref | Hariç (T0) |
|---|---|---|---|---|---|
| client_notes | notlar item | saglik_notu, oneriler, not içeriği | "Danışan notu · {tarih}" | note item id | **adres**, ad, telefon |
| client_sessions | seans | seans içerik alanları | "Seans · {tarih}" | — | kimlik |
| client_analyses | kayıt | analysis_type, note, analysis_data(metin) | analysis_type | — | image_url, kimlik |
| client_combinations | kayıt | name, description, note, stones_text | name | — | kimlik |

Hepsi `tenant_id + client_id + is_client_pii=true`. Başlıklar modül bağlamında bile kimlik sızdırmaz.

---

## Client Scope ve Tenant Scope

- **Client scope:** varsayılan sorgu `client_id = :current_client`. Danışan A, danışan B'yi asla görmez.
- **Çapraz-danışan "benzer vaka":** ayrı, **açık opt-in** mod. Diğer danışan kimliği minimize (de-identified), etiketli ("başka vaka"), audit'li, mevcut kayda **otomatik yazılmaz**. Varsayılan kapalı.
- **Tenant scope:** her sorgu `tenant_id = :session`. Başka uzmanın verisi asla görünmez.

---

## Erişim Modeli ve Yetki Seviyeleri

`erişim = (user ∈ tenant) AND (client-scope) AND (pii_flag) AND (user yetkili)`

| Rol | PII erişimi |
|---|---|
| **Demo** | Yok; yalnız fixture |
| **Uzman** | Kendi tenant'ının danışanları, atamayla scoped, tenant pii_flag'i |
| **Admin** | Yaşam Hafızası üzerinden varsayılan **ham PII içeriği YOK**; her erişim ayrı gated + audit'li (KVKK: gerekçe + log) |

---

## Arama Akışları

- **Danışan detayı:** iki paralel kaynak → "📚 Bilgi Kayıtlarınız" (ana indeks) + "👤 Bu Danışanın Geçmişi 🔒" (PII, bu client). PII flag kapalıysa grup hiç render edilmez.
- **Ana modül araması:** yalnız ana indeks. Serbest arama PII'yi sorgulamaz (ek-yetkili, danışan-seçimli, audit'li mod hariç).

---

## PII ve Embedding / AI

- **Varsayılan: PII indeksi yalnız lexical** (embedding yok) → PII hiçbir zaman dış embedding'e gitmez.
- Opsiyonel: **yalnız yerel model** ile embedding.
- **pii_safe C-builder** (danışan notu anlama): yerel model / deterministik redaksiyon / AI-yok. Ham PII notu asla dış AI'ya gitmez.

---

## Cache, Log, Audit

- **Cache:** PII global cache yok; gerekirse tenant+client scoped, kısa TTL, at-rest şifreli. Ham PII metni asla cache'lenmez.
- **Log:** ham PII log'da yok (hash/redakte).
- **Audit:** her PII erişimi append-only kayıt (user/tenant/client/aksiyon/zaman/referans — içerik değil).

---

## Saklama, Silme, Right to be Forgotten

- **Saklama:** PII indeksi türev veridir; kaynak danışan kaydından uzun yaşamaz (TTL; reconcile zorlar).
- **Silme:** kaynak/danışan silme → cascade **hard-delete** tüm ilgili PII satırları + yerel embedding + cache purge.
- **Right to be Forgotten:** (1) kaynak sil, (2) tüm client_id+tenant PII satırlarını hard-delete, (3) embedding purge, (4) cache purge, (5) audit içerik-ref temizliği, (6) reconcile ile residue=0 doğrulama. Süreli (KVKK/GDPR).

---

## Backup / Restore

- PII backup ayrı + şifreli + silme-farkında.
- **Restore unutulan danışanı diriltemez:** silme tombstone listesi restore'da denetlenir; tombstone'daki client_id restore edilmez.

---

## KVKK/GDPR Hizası

- Özel-nitelikli veri ayrı işlenir (Art.9 / KVKK özel nitelikli).
- Veri minimizasyonu (T0 hariç).
- Amaç sınırlaması (danışan bağlamı).
- Saklama sınırı (türev, TTL).
- Silme hakkı (hard-delete + doğrulama).
- Hesap verebilirlik (audit trail).
- Tasarımdan gizlilik (ayrı tablo + pii_safe).
- İşleyen sözleşmesi (sıfır-saklama / yerel).

---

## Değişmezler

- **INV-PII** — PII ayrı fiziksel indekste; client_id scoped; dış embedding/AI'ya gitmez.
- Kanıt Kapısı / derece / "Neden?" / tenant değişmezi değişmedi.
- PII asla NULL tenant olamaz.
- Silme = hard + doğrulanabilir.

---

## Açık Kararlar

- **A2:** sınırda-PII tabloların (reflexology_notes, bioenergy_sessions) nihai sınıfı — ihtiyatla PII önerilir (Sprint 0).
- **A4:** pii_safe yol seçimi (yerel model / redaksiyon / AI-yok) — PII Derin Analiz'den önce.

---

## Sonraki Faz

→ [`08-phase-6-ux.md`](./08-phase-6-ux.md) — UX entegrasyonu.
