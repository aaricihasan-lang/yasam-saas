# Numeroloji Merkezi — Klasik Numeroloji (B) Mimari Sözleşmesi

Durum: geliştirme (branch `work/numeroloji-merkezi-roxy`, taban main `8a58ac1a`). Production'da KAPALI.

## 0. Dokunulmazlık

Aşağıdaki yollara yazma YASAK; `scripts/numeroloji-klasik/guard/boundary.harness.ts` taban commit'e göre fark çıkarsa FAIL verir:

- `lib/numeroloji/**`, `app/numeroloji/**`, `app/api/numeroloji/**`
- `app/api/clients/[id]/numerology-*`, `app/api/clients/[id]/word-report/numerologySavedSection.ts`
- `lib/danisan/numerology*.ts`, `app/dashboard/clients/[id]/components/Numeroloji*.tsx`, `useNumerologySummary.ts`
- `app/_premium/numeroloji/**`, mevcut `numerology_*` tablolarını değiştiren her migration
- `scripts/numeroloji-*` (mevcut testler) — yalnız ÇALIŞTIRILIR

Yeni kod mevcut `numerology_records` tablosunu YALNIZ `select` ile okur (karşılaştırma). Bunu
`boundary.harness.ts` statik olarak da tarar (`from("numerology_records")` sonrası insert/update/upsert/delete yasak).

## 1. Yol / klasör haritası (yalnız yeni dosyalar)

| Katman | Yol |
|---|---|
| Ekol kapısı | `app/numeroloji-merkezi/` |
| Klasik Numeroloji ekranları | `app/numeroloji-klasik/` |
| Karşılaştırma ekranı | `app/numeroloji-karsilastirma/` |
| API (tek önek) | `app/api/numeroloji-klasik/**` (karşılaştırma: `app/api/numeroloji-klasik/karsilastirma/**`) |
| Sunucu/saf kütüphane | `lib/numeroloji-klasik/**` |
| Migration | `supabase/migrations/20271205000000_numerology_classic_core.sql` (+ gerekirse `...0100`) |
| Testler | `scripts/numeroloji-klasik/**` |
| Belgeler | `docs/numeroloji-klasik/**` |
| Canlı ham yanıt + defter | repo DIŞI: `C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/` |

`lib/numeroloji-klasik/` alt yapısı:

- `endpoints.ts` — uç kaydı (tek kaynak)
- `oracle/` — bağımsız Pisagor (Decoz) ve Kalde (Cheiro) hesaplayıcıları (saf, istemci-güvenli)
- `normalize/` — ham yanıt → `model.ts` tipleri (saf); ham yanıt UI'ya gitmez
- `model.ts` — normalize sonuç tipleri + Türkçe etiketler
- `server/` — `import "server-only"`: sağlayıcı istemcisi, önbellek, kota koruması, depo (repository), servis
- `stones/` — Numeroloji–Doğaltaş eşleştirme (saf eşleştirici + sunucu adaptörü)
- `report/` — Word üretimi (sunucu)
- `compare/` — karşılaştırma kavram sözlüğü + hizalama (saf)

## 2. Ortak dosyalara temas (additive, regresyon testli)

1. `lib/auth/moduleRouteRegistry.ts` — `{ prefix: "app/api/numeroloji-klasik", key: "numerology" }`
2. `lib/auth/routeModuleAccess.ts` — `/numeroloji-merkezi`, `/numeroloji-klasik`, `/numeroloji-karsilastirma` → `["numerology","numeroloji"]`

Menü (`app/_premium/home/homeModuleNav.ts`), Analiz Merkezi ve danışan dosyası bu aşamada DEĞİŞMEZ
(owner görsel PASS + açılış kararı bekler).

## 3. Yetki / bayrak

- Sunucu bayrağı `NUMEROLOGY_CLASSIC_ENABLED` tam olarak `"true"` değilse: tüm `app/api/numeroloji-klasik/**` → 404, sayfalar → `notFound()`.
- Sağlayıcı çağrı bayrağı `NUMEROLOGY_CLASSIC_PROVIDER_CALLS` tam olarak `"true"` değilse yeni hesap yapılmaz (kayıtlı analizler okunur).
- Her route: `requireModuleAccess(req, "numerology")` → tenant yalnız oturumdan. Demo hesap: yeni sağlayıcı çağrısı ve yazma YOK.
- Karşılaştırma notu yazma: ek olarak danışan bağlanacaksa `clients` izni.

## 4. Sağlayıcı çağrı planı (uzmana görünmez maliyet)

Kişi analizi teknik seçimi → en az çağrı:

| Seçilen grup | Çağrı |
|---|---|
| Pisagor çekirdek, karmik, döngüler (yıl/ay), zirve/mücadele, isim harfleri, gizli tutku, bilinçaltı, doğum günü profili, olgunluk, uğurlu ilişkiler | `/chart` (1) |
| Köprü sayıları | `/bridge` (1) |
| Kişisel gün | `/personal-day` (1, tarih anahtarlı) |
| Kalde | `/chaldean` (1) |
| İki sistem karşılaştırması | `/dual` (1) |
| İlişki | `/compatibility` (1) |
| İşletme | `/business-name` (1) |
| Sayı kütüphanesi | katalog (0) |

Önbellek anahtarı: `sha256(tenant | endpoint | kanonik girdi JSON | lang | spec sürümü | adapter sürümü)`; tarih bağımlı
uçlarda hedef tarih girdinin parçasıdır. Önbellek tenant'a bağlıdır (kişisel veri). Kayıtlı analiz açma, sekme
geçişi, Word üretimi: 0 çağrı.

Kota koruması: kullanıcı/saat, tenant/gün, eşzamanlı tek çağrı (aynı anahtar), sağlayıcı aylık kalan kota tabanı
(HD + Atlas ortak anahtarı korur).

## 5. Marka

Uzmana görünen hiçbir metinde sağlayıcı adı yok. Teknik kayıt (`provider_meta`) ve owner/admin denetiminde serbest.
Yöntem adları: "Pisagor (Batı)", "Kalde (Cheiro)". Sağlayıcı yorum metinleri "Klasik ekol yorumu" başlığıyla gösterilir.
