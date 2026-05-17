# Ürün & Stok Merkezi — Mimari Plan (v0)

> **Durum:** Planlama aşaması — kod, route ve Supabase migration yok.  
> **Kural:** Mevcut `/dogaltas/*` ve çalışan modüller bozulmayacak. Terapi / çakra / bilgi bankası bu merkeze dahil edilmeyecek.

---

## 1. Vizyon

Doğaltaş modülündeki **stok + satış** fikri, tüm fiziksel ürün kategorilerini kapsayan **genel bir Ürün & Stok** katmanına taşınacak.

| Prensip | Açıklama |
|--------|----------|
| **Merkez + modüller** | Üstte tek hub; her kategori kendi sayfasında |
| **Tek stok motoru** | Giriş/çıkış, maliyet, satış fiyatı, hareket logu ortak |
| **Sadece ticari veri** | Ürün adı, tip, adet, maliyet, fiyat, foto, not |
| **Referans** | Masaüstü `pricing_sales` akışı (sepet, kur, kâr %, stok düşümü) |

---

## 2. Mevcut durum (referans)

| Alan | Konum | Not |
|------|--------|-----|
| Doğaltaş hub | `app/dogaltas/page.tsx` | Terapi, mineral, kütüphane ayrı kalır |
| Stok placeholder | `app/dogaltas/stok-yonetimi/page.tsx` | Geçici UI; **taşınacak hedef modül:** `dogaltas-urun-stok` |
| Taş kataloğu | `stones` tablosu + `dogaltas-listesi` | Terapi içerikli kayıt; **ürün stoku ile karıştırılmamalı** |
| Masaüstü satış | `pricing_sales` (repo dışı) | Sepet, USD kuru, maliyet, kâr, otomatik fiyat, kayıt |

**Ayrım (kritik):**

- `stones` → eğitim / terapi / çakra / atama (mevcut Doğaltaş modülü)
- `products` (planlanan) → satılabilir SKU, stok adedi, alış/satış fiyatı

---

## 3. Klasör yapısı (planlanan)

```
app/urun-stok/                          # 📦 Ürün & Stok Merkezi (hub — ileride page.tsx)
├── README.md                           # Bu plana kısa özet + link
├── tum-urunler/                        # 📋 Tüm Ürünler
├── dogaltas-urun-stok/                 # 💎 Doğaltaş Ürün/Stok
├── yag-urun-stok/                      # 🌿 Yağ Ürün/Stok
├── sabun-krem/                         # 🧼 Sabun / Krem
├── tespih-taki/                        # 📿 Tespih / Takı / Aksesuar
├── satis-fiyatlandirma/                # 💰 Satış & Fiyatlandırma
├── satis-gecmisi/                      # 🧾 Satış Geçmişi
└── stok-hareketleri/                   # 📊 Stok Hareketleri

lib/urun-stok/                          # (ileride) ortak helper — şimdilik yok
├── types/
├── stock-engine/                       # giriş/çıkış, düşüm, log
├── pricing/                            # pricing_sales port mantığı
└── constants/                          # kategori enum, filtreler

docs/architecture/urun-stok-merkezi/
└── MIMARI.md                           # Bu dosya (detaylı plan)
```

**Route planı (henüz aktif değil):**

| Modül | Planlanan route |
|-------|-----------------|
| Hub | `/urun-stok` |
| Tüm Ürünler | `/urun-stok/tum-urunler` |
| Doğaltaş | `/urun-stok/dogaltas-urun-stok` |
| Yağ | `/urun-stok/yag-urun-stok` |
| Sabun/Krem | `/urun-stok/sabun-krem` |
| Tespih/Takı | `/urun-stok/tespih-taki` |
| Satış | `/urun-stok/satis-fiyatlandirma` |
| Geçmiş | `/urun-stok/satis-gecmisi` |
| Hareketler | `/urun-stok/stok-hareketleri` |

Ana panelden tek kart: **Ürün & Stok Merkezi** → `/urun-stok`.

---

## 4. Alt modüller

### 4.1 📋 Tüm Ürünler

**Amaç:** Tüm kategorilerdeki ürünleri tek grid/tablo.

**Kaynaklar:** `products` (tüm `category` değerleri).

**Filtreler:**

- kategori (`dogaltas` | `yag` | `sabun` | `krem` | `tespih` | `taki` | `set` | `diger`)
- stok durumu (yeterli / kritik / tükendi)
- azalan stok (eşik altı)
- satışta (`is_active` + `sale_price > 0`)

**UI:** Salt okunur özet + modül sayfasına derin link. Düzenleme ilgili alt modülde.

---

### 4.2 💎 Doğaltaş Ürün/Stok

**Örnek SKU:** Ametist Bileklik, Sitrin Dizi, Labradorit Kolye.

**Alanlar:**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| ürün adı | text | evet |
| ürün tipi | enum (bileklik, dizi, kolye, ham taş, …) | evet |
| stok adedi | int | evet |
| alış maliyeti | decimal (TRY veya USD giriş) | hayır |
| satış fiyatı | decimal | hayır |
| fotoğraf | storage url | hayır |
| not | text | hayır |

**İlişki:** `stones` kaydı ile **opsiyonel** `stone_catalog_id` (terapi kartına link; stok bağımsız).

---

### 4.3 🌿 Yağ Ürün/Stok

**Alt tipler:** `ucucu` | `sabit` | `karisim`

Aynı `products` şeması + `sub_category`.

---

### 4.4 🧼 Sabun / Krem

**Alt tipler:** `dogal_sabun` | `krem` | `bakim`

Aynı stok motoru.

---

### 4.5 📿 Tespih / Takı / Aksesuar

**Alt tipler:** `tespih` | `bileklik` | `kolye` | `aksesuar`

Doğaltaş ile tip çakışması UI’da `category` ile ayrılır.

---

### 4.6 💰 Satış & Fiyatlandırma

Masaüstü **`pricing_sales`** akışının web portu:

```
Ürün seç → Adet → USD kuru → Birim maliyet → Kâr % → Otomatik satış fiyatı
→ Sepete ekle → Sepeti onayla → Satış kaydı + stok düşümü + hareket logu
```

**Bileşenler (ileride, tek sayfa — mantık ayrı helper):**

- `PricingCart` — sepet state (local, sonra persist)
- `PricingCalculator` — kur, maliyet, kâr, önerilen fiyat
- `SaleCheckout` — transaction: `sales` + `stock_movements` + `products.stock_qty`

**Kurallar:**

- Stok yetersizse satış bloklanır
- Satış iptalinde ters hareket (faz 2)

---

### 4.7 🧾 Satış Geçmişi

**Liste kolonları:** tarih, ürün, maliyet, satış, kâr, foto (thumbnail), detay, sil.

**Detay:** satır kalemleri, kur anı, kullanıcı, not.

**Sil:** soft-delete + stok iadesi (faz 2) veya sadece kayıt silme (faz 1 kararı).

---

### 4.8 📊 Stok Hareketleri

Kronolojik audit:

```
17 Mayıs  +20  Ametist Bileklik   (giriş / tedarik)
18 Mayıs   -3   Ametist Bileklik   (satış #123)
19 Mayıs  +10   Lavanta yağı       (giriş)
```

**Hareket tipleri:** `in` | `out` | `sale` | `adjustment` | `return`

---

## 5. Veri modeli (plan — migration yok)

### 5.1 `products`

```sql
-- Kavramsal şema (henüz uygulanmadı)
id, tenant_id,
category,           -- dogaltas | yag | sabun | krem | tespih | taki | set | diger
sub_category,       -- modüle özel alt tip
name,
product_type,       -- serbest / enum
stock_qty,
cost_price,
sale_price,
currency,           -- TRY | USD
photo_url,
note,
low_stock_threshold,
is_active,
stone_catalog_id,  -- nullable → stones.id
created_at, updated_at
```

### 5.2 `sales` + `sale_items`

```sql
sales: id, tenant_id, sold_at, usd_rate, total_cost, total_sale, total_profit, note
sale_items: sale_id, product_id, qty, unit_cost, unit_sale, line_profit, photo_snapshot_url?
```

### 5.3 `stock_movements`

```sql
id, tenant_id, product_id, movement_type, qty_delta, reference_type, reference_id, note, created_at
```

**Tek kaynak:** Stok miktarı ya `products.stock_qty` cache + hareketlerden türetilir, ya da sadece hareketlerden aggregate (performans kararı — faz 1: cache + trigger/RPC).

---

## 6. Ortak stok motoru (`lib/urun-stok/stock-engine`)

| Fonksiyon | Açıklama |
|-----------|----------|
| `recordStockIn` | Tedarik / sayım artışı |
| `recordStockOut` | Fire, örnek, manuel çıkış |
| `deductForSale` | Satış onayında `-qty` |
| `getMovementHistory` | Ürün veya global filtre |
| `checkAvailability` | Satış öncesi |

Tüm modüller bu API’yi çağırır; kategori bazlı UI sadece filtre uygular.

---

## 7. Hub sayfası (ileride)

```
┌─────────────────────────────────────────────┐
│  ← Ana Panel    Ürün & Stok Merkezi         │
├─────────────────────────────────────────────┤
│  [Tüm Ürünler]  [Doğaltaş]  [Yağ]  …        │  ← kart grid, numeroloji/dogaltas hub benzeri
│  [Satış]  [Geçmiş]  [Hareketler]            │
└─────────────────────────────────────────────┘
```

- Pastel premium SaaS (mevcut dogaltas hub diline yakın)
- Terapi / çakra / bilgi bankası linki **yok**

---

## 8. Migrasyon stratejisi (fazlar)

| Faz | İş | Risk |
|-----|-----|------|
| **0** | Klasör + bu plan | Yok |
| **1** | Supabase tablolar + RLS + hub route + Tüm Ürünler (read) | Düşük |
| **2** | Doğaltaş ürün/stok CRUD (yeni tablo) | Orta — `stones` karışmaz |
| **3** | Satış & Fiyatlandırma (`pricing_sales` port) | Orta |
| **4** | Satış geçmişi + stok hareketleri | Düşük |
| **5** | Yağ, sabun, tespih modül sayfaları | Düşük |
| **6** | `/dogaltas/stok-yonetimi` → yönlendirme veya deprecated banner | Düşük |

**Şimdilik yapılmayacaklar:**

- `stones` şemasını ürün stokuna dönüştürmek
- Numeroloji / aromaterapi terapi içeriklerini bu merkeze taşımak
- Tek sayfada tüm kategorileri birleştirmek

---

## 9. `pricing_sales` (masaüstü) eşlemesi

| Masaüstü kavram | Web hedefi |
|-----------------|------------|
| Ürün listesi | `products` + kategori filtresi |
| Sepet | `PricingCart` state → `sale_items` |
| Dolar kuru | `sales.usd_rate` |
| Maliyet hesapla | `unit_cost * qty` |
| Kâr % | `PricingCalculator.profitPercent` |
| Otomatik fiyat | `cost * (1 + profit/100)` veya manuel override |
| Satışı kaydet | `sales` insert + RPC `deductForSale` |
| Stok düş | `stock_movements` type `sale` |

---

## 10. Güvenlik ve tenant

- Mevcut `tenant_id` deseni korunur
- RLS: tenant izolasyonu (`products`, `sales`, `stock_movements`)
- Foto bucket: `product-photos` (yeni; `stone-photos` ayrı kalır)

---

## 11. Kontrol listesi (uygulama öncesi)

- [ ] `stones` ≠ `products` ayrımı ekip içi onaylandı
- [ ] Kategori enum listesi kesinleşti
- [ ] Düşük stok eşiği varsayılanı (örn. 5)
- [ ] Para birimi: maliyet USD, satış TRY mi? (masaüstü ile aynı)
- [ ] Satış silme = stok iadesi mi?
- [ ] Ana panele modül kartı eklenecek mi?

---

*Son güncelleme: planlama v0 — kod ve route eklenmedi.*
