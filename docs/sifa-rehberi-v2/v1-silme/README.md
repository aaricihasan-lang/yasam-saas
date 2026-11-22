# Şifa Rehberi V1 kayıtlarının silinmesi — güvenli uygulama planı (12. aşama)

**Owner kararı (22.11.2026):** V1 kayıtları V2'ye aktarılmaz; admin ve bütün uzman hesaplarındaki V1 Şifa
Rehberi kayıtları test verisidir ve silinecektir. **Hesaplar, kimlikler, roller, oturumlar, danışanlar, diğer
modüller ve bağımsız YH kayıtları silinmez.** Production'da bu aşamada HİÇBİR şey silinmedi.

## Kapsam (repo'dan kanıtlı)

| Nesne | Durum |
|---|---|
| `healing_guides` | silinir (tenant listesiyle sınırlı) |
| `healing_guide_sections` | `guide_id → healing_guides ON DELETE CASCADE` ile silinir |
| `healing_guide_create_idempotency` | `guide_id → healing_guides ON DELETE CASCADE` ile silinir |
| Başka FK | YOK (01 sorgusu 5. adım doğrular) |
| `stone-photos/healing-guides/<tenant>/…` | Storage API ile silinir (yedeklendikten sonra) |
| `stone-photos` diğer önekleri | **DOKUNULMAZ** (Danışan Taşları `client_stone_photos` aynı kovayı kullanır) |
| YH indeks (`source_table` healing_*) | DELETE tetikleyicileri → `delete` olayı → worker deindex; kalıntı hedefli temizlenir |
| `yasam_hafizasi_report_snapshots` (source_module sifa_rehberi) | **SİLİNMEZ** (bağımsız YH kaydı) — sayısı Owner'a raporlanır |
| `admin_library_transfer_batches` | **SİLİNMEZ** (denetim kaydı) |
| V1 kodu / tabloları / RPC'leri | DURUR (boş tablolar). Kaldırma ayrı bir aşamadır (aşağıda) |

V1 tablolarını okuyan diğer modül kodları (yalnız okur; boş tabloda doğru çalışır): `app/api/dashboard/summary`,
`app/page.tsx`, `lib/admin/stats/moduleUsageRegistry.ts`, `lib/admin/transferRegistry.ts`,
`lib/admin/veriPaylasimiTransfer.ts` + `app/api/admin/veri-paylasimi/transfer`, `lib/admin/healingGuideJsonImport.ts`,
`lib/archive/server/media.ts`, `lib/backup/registry.ts`, `lib/demo/demoYasamHafizasi.ts`, YH kaynak/aktivasyon kayıtları.

## Uygulama sırası (ayrı onaydan SONRA)

1. **Envanter:** `01_envanter_salt_okunur.sql` (SQL Editor, `BEGIN READ ONLY`). Çıktı Owner'a sunulur.
2. **Onay:** Owner, tenant listesi + sayılar üzerinden silme onayı verir.
3. **Yedek:** V1 3 tablonun data-only dökümü + `healing-guides/` nesnelerinin indirilmesi (SHA-256 listesi).
4. **DB silme:** `02_silme_plani_CALISTIRMA.sql` — beklenen sayılar doldurulur; uyuşmazlıkta kendiliğinden durur; COMMIT elle.
5. **YH:** worker olayları işler; 03 kontrolüyle indeks kalıntısı 0 doğrulanır.
6. **Storage:** yalnız `healing-guides/` önekli nesneler Storage API ile silinir; nesne sayısı yedek listesiyle karşılaştırılır.
7. **Doğrulama:** diğer modül sayıları (ör. danışan, taş, HD) silme öncesi/sonrası aynı.

## V1 kodunun kaldırılması (ayrı aşama; öneri)

V2 yayında ve bayrak açıkken V1 ekranları zaten görünmez (`app/sifa-rehberi/layout.tsx`). V1 kodu/tabloları
kaldırılmadan önce: yukarıdaki okuyucuların V2'ye ya da kaldırmaya taşınması, YH V1 kaynaklarının
devreden çıkarılması (`yh_source_deactivate`) ve harness sayaçlarının bilinçli güncellenmesi gerekir.
