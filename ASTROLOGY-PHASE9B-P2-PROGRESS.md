# ASTROLOJİ 9B P2 KAPATMA — Basit, Güvenli ve Az Yer Kaplayan Kayıt Sistemi

- Başlangıç HEAD: `614b3196` (9B denetim raporu) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`.
- Production / Frankfurt / Tokyo: **dokunulmadı**. Push / merge / deploy: **yok**.
- Migration'lar **yalnız yerel** hazırlandı ve yerel embedded PostgreSQL'de sınandı; production'a uygulanmadı.
- Gerçek Roxy çağrısı: **0** (toplam **50**). Gerçek danışan verisi: **yok**. Human Design ve diğer mühürlü modüller: **değişmedi**.

## 1. Ön doğrulama (kod değişmeden önce)

| Soru | Bulgu |
|---|---|
| Analize Bilgi Bankası'nın hangi alanları kopyalanıyordu? | Yalnız `astro_analyses.kb_snapshot`: entryId, tradition, topicKey, topicLabel, title, body, sourceNote, tags, revision, updatedAt. Hepsi uzmanın **genel** Bilgi Bankası kaydı |
| Danışana özel notlar nasıl ayrılıyor? | **Ayrı tablo** `astro_analysis_notes` (section_key + body; `astro_expert_notes` kopyası). `kb_snapshot` içinde not yok. Ayrım kesin |
| Roxy yorumları | Ayrı kolon `provider_interp_snapshot` (KB'den bağımsız) |
| Word/PDF hangi alanları kullanıyor? | Yalnız `getAnalysis` yanıtı (teknik, profil, yöntem, notlar, `knowledgeBank`, yorum). İstek üzerine üretilir, **hiçbir yere kaydedilmez** (depolama yazımı yok) |
| Kayıtlı analiz ekranı | Aynı yanıt; Bilgi Bankası bölümü + teknik panellerdeki KB eşleşmesi |
| Eski sinastri/kompozit `kb_snapshot`'a bağımlı mı? | Hayır. Karşı taraf `profile_snapshot`'ta, teknik `technical_snapshot`'ta. Silme RPC'si (000500) bütünlük parmak izinde `kb_snapshot`'ı okur ama değiştirmez |
| Değişmezlik | Uygulama rolü `astro_analyses` üzerinde yalnız SELECT/INSERT yapabilir → eski kopyalar uygulamadan değil, yalnız migration ile temizlenebilir |

## 2. 9B-P2-01 — Bilgi Bankası kopyaları kaldırıldı → **PASS**
- **Yeni kayıt:** `kb_snapshot = []`. Sürüm bilgisine `kbStorage: "live-v1"` eklendi; kaydetme özeti eşleşme sayısını yine gösterir.
- **Açılış ve rapor:** Bilgi Bankası, uzmanın **güncel** kayıtlarından eşleşir (`matchKbEntries`: tenant + uzman + gelenek + konu).
  - Silinen açıklama gelmez; güncellenen açıklama güncel hâliyle gelir.
  - Eşleşen kayıt yoksa analiz ve rapor yine çalışır.
  - Eski analizdeki kopya **okunmaz** (kolon artık seçilmiyor).
  - Roxy çağrısı yok.
- **Korunanlar:** teknik sonuç, doğum ve profil snapshot'ı, sinastri karşı tarafı, Roxy yorumları ve yorum yetkisi kapısı, **danışana özel notlar** (kayıt anındaki hâli).
- **Metinler:** UI "Bilgi Bankam (güncel)"; rapor "güncel kayıtlardan alınmıştır".
- **Eski kayıt temizliği:** migration `20271101000700_astrology_kb_snapshot_cleanup.sql` (yalnız yerel).
  - Yalnız `kb_snapshot`'ı boşaltır, yalnız **her öğesi KB biçimindeyse** (entryId + topicKey + title + body; `section_key`/`sectionKey` yok). Tanınmayan biçime dokunulmaz.
  - Notlar tablosuna hiç dokunmaz. İdempotent; sonucu NOTICE ile bildirir.
- **Production'da önerilen sıra:** yedek → 000600 → 000700 → (isteğe bağlı) `VACUUM (FULL)` → yetki kontrolü.

### Depolama — GERÇEK PostgreSQL ölçümü (tablo + TOAST + indeks; sıkıştırma dahil)
Gerçek natal teknik + Roxy yorumu + sürüm verisi; KB metni çeşitli kelime dizileri (gerçekçi sıkıştırma).

| Yapı | Satır başı | 100 analiz | 1000 analiz | 3000 analiz |
|---|---|---|---|---|
| **Yeni** (KB kopyası yok) | **14 KB** | 1,47 MB | **13,9 MB** | **41,6 MB** |
| Eski, tipik KB (8 × 1 200 karakter) | 17 KB | 1,73 MB | 16,6 MB | 49,5 MB |
| Eski, yoğun KB (30 × 4 000) | 60 KB | 5,95 MB | 58,7 MB | ≈ 176 MB |
| Eski, en fazla KB (70 × 20 000; ham JSON 1,58 MB) | 465 KB | ≈ 45 MB | ≈ 454 MB | ≈ 1,36 GB |

- **Tasarruf:** tipik **%16**, yoğun **%77**, en fazla **%97**.
- **En kötü günlük büyüme** (200 analiz / gün): eski 93 MB → yeni ≈ 2,8 MB.
- **Ham JSON ile fiziksel boyut farkı:** en büyük KB kopyası 1,58 MB JSON → 439 KB fiziksel. 9B raporundaki 1,43 MB / 286 MB değerleri ham JSON'du.

## 3. 9B-P2-02 — Word/PDF tarihi → **PASS**
- Kapak "Analiz tarihi", "Kayıt tarihi" (saat dahil, "TSİ"), "Hesap tarihi" ve dosya adı **Europe/Istanbul** ile yazılıyor (`instantDateTr`, `instantDayKeyTr`). DB'deki UTC değerleri değişmedi.
- Başlık zaten Türkiye günüydü; artık belge içi tutarlı.
- **Doğrulama:** `2026-10-09T21:03:55Z` → kapak "10.10.2026", kayıt "10.10.2026 00:03 (TSİ)", dosya `…-2026-10-10.docx/.pdf`; "09.10.2026" yok (Word + PDF metni).
- **Sınır testleri:** 20:59Z aynı gün / 21:00Z ertesi gün, ay sonu (31.10 → 01.11), yıl sonu (31.12 → 01.01.2027), artık yıl (29.02.2028), geçersiz değer "—".

## 4. 9B-P3-01 — Atomik kayıt tavanı → **PASS**
- **Migration `20271101000600_astrology_record_caps.sql`** (yalnız yerel): BEFORE INSERT trigger.
  - (tablo, tenant, uzman) başına `pg_advisory_xact_lock` + aynı işlemde sayım.
  - Tavanlar: profil 2000, analiz 3000, KB 1000, not 10000. `limits.ts` ile aynı (statik test denetler).
- Yalnız ekleme sınırlanır: okuma, güncelleme ve silme serbest; başka uzman veya tenant etkilenmez.
- Uygulamadaki hızlı ön kontrol ve hız sınırları aynen kaldı.
- Servisler DB hatasını **409 RECORD_CAP_REACHED**'e çeviriyor (eskiden 500 olurdu): profil, KB, not, analiz.
- **Eşzamanlılık (gerçek PostgreSQL, 40 ayrı bağlantı, tavan−1):** KB, profil ve analizde **tam 1 başarı + 39 tavan reddi, aşım 0** (önce ≤119).
- **Test altyapısı notu:** `cap-concurrency.mjs` ilk tam regresyonda düşük bellek anında askıda kaldı. Neden: initdb düşük `max_connections` seçti, "too many clients" hatasından sonra açık kalan bağlantılar `server.stop()`'u beklettİ. Düzeltme: açık `max_connections`, tüm bağlantıları kapatma ve 5 dk bekçi. Düşük limit simülasyonunda artık 10 sn'de FAIL ile çıkıyor.

## 5. P3 düzeltmeleri
- **Kaydetme özeti:** ham `whole_sign` / `placidus` / `true` / `roxy` yerine Türkçe etiketler ("Bütün-burç (rashi chakra)", "Placidus", "Gerçek düğüm (true)", "hesap motoru: RoxyAPI").
- **Statik test izin listesi:** 9B denetim raporu, bu kayıt ve iki yeni migration eklendi.

## 6. Testler
- **`npm run test:astrology`: 476 PASS / 0 FAIL** (önceki 461 + yeni `p2fix9b` 15).
  - phase2 harness'inin iki testi eski ürün kararını ("KB analizde donar") kodluyordu; owner kararına göre güncellendi. Teknik, not ve profil revizyonu değişmezliği aynen sınanıyor.
  - `p2fix9a`'daki 413 testi yeni anlama çevrildi: büyük KB kopyalanmaz, kayıt başarılı.
- **PostgreSQL senaryoları:** önceki 5 + yeni 9B senaryosu PASS.
  - 9B senaryosu: 000600 + 000700 iki kez; temizlik ve tavan doğrulamaları; negatif kontrol (000700 olmadan FAIL veriyor).
  - `cap-concurrency.mjs`: 4/0.
- **Mutasyonlar (yeni harness'e karşı) 5/5 yakalandı:** KB yeniden kopyalanırsa, eski kopya okunursa, KB izolasyonu kaldırılırsa, UTC tarihe dönülürse, tavan eşlemesi kaldırılırsa.
- **Zorunlu 12 senaryo:**

| # | Senaryo | Sonuç |
|---|---|---|
| 1 | Eski harita aynı teknik sonuçlarla açılıyor | PASS |
| 2 | KB güncellenince yeni Word/PDF güncel açıklamayı kullanıyor | PASS |
| 3 | Silinen KB açıklaması rapora gelmiyor | PASS |
| 4 | Danışana özel eski notlar kaybolmuyor (çalışma notu sonradan değişse bile kayıtlı not raporda) | PASS |
| 5 | Roxy yorumu korunuyor; yetki kapalıyken getAnalysis / Word / PDF / sinastri hiçbir yoldan sızmıyor | PASS |
| 6 | Başka uzman ve tenant'ın KB'si ve notu görünmüyor; başka uzman 404 | PASS |
| 7 | Sinastri snapshot bütünlüğü | PASS |
| 8 | Eski analiz yeniden Roxy çağrısı gerektirmiyor (sağlayıcı ve fetch sayaçları sabit) | PASS |
| 9 | Word/PDF Türkiye tarihi | PASS |
| 10 | Masaüstü 1280 / mobil 390 (kayıtlı analiz ve kaydetme özeti) | PASS (taşma 0; Word düğmesi masaüstünde görünür, mobilde gizli) |
| 11 | 461 + yeni testler | PASS (476/0) |
| 12 | PostgreSQL, yetki (perm7c 16/0, statik 15/0), typecheck, `next build` | PASS |

## 7. Açık maddeler
- **Merge sırasında yapılacak** (diğer oturumun HttpOnly H5 notu): yeni istemci kodunda token için `hasSessionCredential()` / `sessionTokenHeader()` kullanılmalı.
  - Astroloji istemcisi `app/admin/astroloji/_lib/api.ts` (7C) hâlâ `"x-session-token"` gönderiyor.
  - Auth/session alanı olduğu ve bu işin kapsamı dışında kaldığı için değiştirilmedi.
  - Branch main'in gerisinde; main ile birleştirirken uyarlanmalı ve owner onayı alınmalı.
- **Production:** 000600 ve 000700 production'a uygulanmadı; owner onayı ve yedekle uygulanacak.
