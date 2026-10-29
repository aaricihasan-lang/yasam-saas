# William Lilly Horary — kayıt, arşiv ve danışan bağlantısı: veri modeli önerisi (OWNER ONAYI BEKLİYOR)

> **Durum:** Öneri. Migration **yazılmadı / çalıştırılmadı**. `supabase/migrations` altında dosya YOK. Bu belge yalnız Owner kararı içindir.

## 1. Neden mevcut şema yetmiyor (kanıt)

| Mevcut yapı | Engel |
|---|---|
| `astro_analyses` (`20271101000100`, `…0200`, `…0300`) | `profile_id` ve `profile_revision` **NOT NULL**; `astro_an_revision_fk` ve `astro_an_owner_fk` bileşik FK'leri doğum profiline bağlı. Profilsiz kayıt **mümkün değil**. |
| Soru alanları | Soru metni, soru yerel tarihi/saati, konum, saat dilimi, sorulan ev için kolon **yok** (`title` ≤ 200 dışında serbest metin yok). |
| `astro_analysis_save_v2` RPC | `client_id`'yi profilden alır; profil yoksa `ASTRO_PROFILE_NOT_FOUND`. |
| Analiz Arşivi (`astro_profile_page`, `ArchiveList.tsx`) | Satırlar **doğum profili**; profilsiz kayıt listede hiç görünmez. Tarih/danışan filtresi yok. |
| Genel "soru / prashna / horary" tablosu | **Yok.** KP Horary de bir doğum profili altında çalışıyor. |

Geçici çözüm olarak sahte bir "soru profili" açmak doğum verisinin anlamını, kayıt tavanlarını, profil silme akışını ve arşivi bozar → **önerilmez** (talimat: ilgisiz tabloya yazma yok).

## 2. Önerilen en küçük veri modeli: `public.astro_horary_questions`

| Kolon | Tür / kısıt | Gerekçe |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | Tahmin edilemez kimlik |
| `tenant_id` | uuid NN | Tenant izolasyonu |
| `owner_user_id` | uuid NN | Uzman sahipliği (diğer `astro_*` ile aynı desen) |
| `client_id` | uuid NULL; FK `(tenant_id, client_id)` → `clients(tenant_id, id)` **ON DELETE SET NULL** | İsteğe bağlı danışan; başka tenant'ın danışanı FK ile imkânsız; danışan silinirse kayıt korunur, bağlantı düşer |
| `title` | text NN, 1–200 | Arşiv araması |
| `question_text` | text NULL, ≤ 500 | **Owner kararı (§6):** saklansın mı? |
| `question_local_date` / `question_local_time` | date / time NN | Uzmanın girdiği yerel an |
| `timezone` / `utc_offset_seconds` / `dst_choice` | text NN (IANA) / int NN / text CHECK `auto|earlier|later` | Yerel → UTC'nin yeniden üretilmesi |
| `question_utc` | timestamptz NN | Hesaplama anı; sıralama/filtre |
| `location_id` / `location_label` / `latitude` / `longitude` | text NN / text NN ≤ 200 / numeric NN aralık CHECK | Konum |
| `quesited_house` | smallint NN CHECK 2–12 | Sorulan ev |
| `school` | text NN CHECK `IN ('lilly_1647')` | Ekol (yeni ekol eklemek bilinçli migration ister) |
| `methodology_version` / `orb_variant` | text NN / text NN | Hangi motor sürümü + orb sütunu |
| `snapshot_schema` | smallint NN | Anlık görüntü biçim sürümü |
| `result_snapshot` | jsonb NN, nesne, `pg_column_size ≤ 512 KB` (ölçülen ≈ 26 KB) | **Tarihî kayıt sessizce değişmesin** (§3) |
| `is_demo` | boolean NN default false | DEMO girdisi ayrımı |
| `save_request_id` | uuid NN, **UNIQUE (tenant_id, save_request_id)** | Çift gönderim → tek kayıt (idempotent) |
| `created_at` / `updated_at` | timestamptz NN default now() | |

İndeksler: `(tenant_id, owner_user_id, question_utc DESC)`, `(tenant_id, client_id, question_utc DESC)`; `UNIQUE (tenant_id, id)`. Yeni eklenti (pg_trgm) **gerekmez**; arama `title`/`question_text` üzerinde sınırlı `ILIKE` + sayfalama.

## 3. Yeniden üretilebilirlik

- Kaydedilen kayıt **anlık görüntüden** açılır (her açılışta yeniden hesaplanmaz). Ekranda ve raporda `methodology_version` + `school` + `orb_variant` gösterilir.
- Motor güncellenirse eski kayıt **değişmez**; isteğe bağlı "güncel motorla yeniden hesapla ve karşılaştır" ayrı, açık bir eylem olur (kayda yazmaz).
- Anlık görüntü kolonları **güncellenemez** (yalnız `title`, `client_id`, `updated_at` güncellenebilir — kolon düzeyi GRANT + koruma tetikleyicisi).

## 4. Yetki ve güvenlik (mevcut `astro_*` deseniyle aynı)

- **RLS açık, politika YOK**; `PUBLIC/anon/authenticated` için REVOKE ALL; yalnız `service_role`'a `SELECT, INSERT` + `UPDATE (title, client_id, updated_at)`. **DELETE yetkisi YOK** (silme bu aşamada eklenmez).
- Her istek `requireAstrologyAccess` (owner / uzman + tenant + module_permissions) → servis katmanında `.eq("tenant_id").eq("owner_user_id")`; bulunamayan ya da başkasına ait kimlik için tek tip 404.
- Danışan bağlama / değiştirme: `findTenantClient` (aynı tenant) doğrulaması + FK; başka tenant'ın danışanı reddedilir.
- Kayıt tavanı: mevcut `astro_enforce_record_cap` deseniyle (öneri: uzman başına 3.000) + `enforceAstroWrite` hız sınırları.
- Rapor: `GET …/records/:id/report?format=docx|pdf` — yalnız sahibine; içerik anlık görüntüden.

## 5. Uç noktalar ve arayüz (onaydan sonra)

- `POST /api/(admin/)astroloji/horary/western/records` (sunucuda yeniden hesap → anlık görüntü; istemci sonucu kabul edilmez), `GET …/records?q=&from=&to=&clientId=&limit=&offset=`, `GET …/records/:id`, `PATCH …/records/:id` (yalnız başlık / danışan).
- Arayüz: Horary sonuç kartındaki rapor çubuğuna **"Kaydet"** + isteğe bağlı danışan seçimi (mevcut `astro_client_candidates`); Analiz Arşivi'nde mevcut başlığın içinde **"Doğum profilleri | Horary soruları"** seçici (yeni ana menü yok).

## 6. Owner kararı gereken noktalar

1. **Tablonun oluşturulması** (yukarıdaki model).
2. **Soru metni saklansın mı?** Kişisel veri (KVKK). Seçenekler: (a) sakla (≤ 500), (b) yalnız başlık sakla, soru metni hiç saklanmasın.
3. **Danışan görünürlüğü:** mevcut astroloji kuralı tenant içindeki bütün danışanları aday gösterir (`astro_client_candidates`). Uzman bazında daraltma istenirse ayrı karar.
4. **Kayıt tavanı** (öneri 3.000 / uzman).
5. **Veri silme / dışa aktarma süreçleri:** hesap/tenant temizleme ve veri aktarım işlevlerine bu tablo eklenmeli (aksi hâlde silinen hesabın Horary kayıtları kalır).

## 7. Riskler, yerel doğrulama ve geri dönüş

- **Risk:** yalnız yeni tablo; mevcut tablolara / politikalara dokunulmaz. Üretimde PG17 ↔ prova PG18 farkı için `pg-migration-check.mjs` normalleştirmesi kullanılır.
- **Yerel doğrulama:** `scripts/final-hardening/pg-migration-check.mjs --twice` (geçici embedded-postgres) + assert SQL: başka tenant danışanı FK reddi, DELETE yetkisi yok, anlık görüntü güncellenemez, save_request_id tekilliği, boyut CHECK'leri; sahte PostgREST'te yeni RPC/tablo davranışı; RKS-3 eşlemesi.
- **Geri dönüş:** tablo başka hiçbir tabloca referans edilmez → `DROP TABLE public.astro_horary_questions;` (yalnız Horary kayıtları kaybolur; önce yedek).

## 8. Bu sürümde (migration olmadan) tamamlananlar

- Gerçek **Word ve PDF** raporu: sunucuda yeniden hesap, mevcut rapor altyapısı (`AstroReport` blokları, `wheelSvg`→`resvg` çark, `docx`, `jsPDF` + Geist/sembol yazı tipleri). Kayıt YOK; soru metni yalnız işaretliyse o rapor için gönderilir, saklanmaz, günlüğe yazılmaz.
- Kayıt / arşiv / danışan bağlantısı **uygulanmadı** ve ekranda varmış gibi gösterilmez.
