# ASTROLOJİ AŞAMA 7C — İLERLEME KAYDI (Uzman Yetkileri · Roxy Otomatik Yorum Alt-Yetkisi)

- Başlangıç HEAD: `ff9944af` (Aşama 7B) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Taban güncellemesi: `c0b988b8` — `origin/main` (`b4fe983b`) branch'e merge edildi (owner kararı; 65 commit geride olan
  HttpOnly + alt-yetki deseni gerekliydi). Tek çakışma DY sayfası: main'in ödenmemiş ücret uyarısı korundu, Astroloji rozeti ardına.
- Commit'ler: `56623ac6` yetki + yüzey · `1006cfc0` testler · (son) yerel sahte arka uç + bu rapor
- Gerçek Roxy çağrısı: **0** (toplam 47 aynı; her test/sunucu `env -u ROXY_API_KEY`). Production / Frankfurt / Tokyo: **dokunulmadı**.
  Push / merge / deploy / prod migration: **yok**. Gerçek danışan verisi: **yok**. Migration: **gerekmiyor**.

## 1. Yetki mimarisi — yeni sistem kurulmadı
- Mevcut `users.module_permissions` + Üye Yönetimi (`admin_set_module_permissions` RPC) kullanıldı. İki anahtar:
  - `astrology` (tür: module) — "Uzmanın Astroloji modülüne erişmesini sağlar."
  - `astrology_provider_interp` (tür: capability) — "Uzmanın Astroloji hesaplamalarına ait sistem yorumlarını kullanmasına izin
    verir. Astroloji modülü de açık olmalıdır." (main'deki `hd_system_reading` / `numerology_future_years` deseni)
- Varsayılan ikisi de **kapalı**. Kapatmak kayıt silmez; yeniden açınca her şey yerinde.
- Kayıtlar: `modulePermissions`, `moduleAccessCore` (`DEMO_DENIED_MODULE_KEYS` dahil), `moduleRouteRegistry`
  (`app/api/astroloji`), `routeModuleAccess` (`/astroloji`), `userManagement` (UI anahtarları/etiket/açıklama/tür).
- Usage360 dışı: `UsageTrackedModuleKey = Exclude<ModuleGateKey,"astrology">` — DB `usage360_module_keys` sözleşmesi değişmedi.

## 2. Erişim kapısı (tek merkez: `lib/astrology/access/ownerGate.ts` → `requireAstrologyAccess`)
- `/api/admin/astroloji/**` → **yalnız owner** (değişmedi).
- `/api/astroloji/**` (uzman yüzeyi, 22 route; admin route'larının birebir re-export aynası):
  kill switch → `requireModuleAccess(req,"astrology")` (oturum + aktif/onaylı/premium + demo engeli + DB'den taze izin)
  → admin ise yalnız owner, aksi rol yalnız expert → tenant UUID → `resolveAstrologyEntitlements(module_permissions)`.
  Her red tek tip **404** `{ok:false,error:"Bulunamadı."}`.
- Owner her zaman tam erişim. **Owner olmayan admin bayraktan bağımsız erişemez** (2026-10-07 owner kuralı korunur;
  genel admin bypass'ından bilinçli sapma).
- `unmapped` (alan denetimi) `ownerOnly`.

## 3. Roxy yorum davranışı
- Yorum yetkisi kapalı: teknik sonuçlar (hesap, tablo, grafik) tam; `provider_interp_snapshot` **select edilmez**;
  interpretation `{visible:false, reason:"not_entitled"}`; `interpretationSchema` null; listede "Roxy yorumu dahil" bayrağı false.
- Sinastri/composite snapshot ve önbellek yolu da aynı servis katmanından geçer → sızıntı yok (testli).
- Yetki açık sekmede kaldırılırsa bir sonraki istek yorumsuz döner (izin her istekte DB'den okunur).
- Arayüz: owner olmayan + yorum kapalı → "Roxy otomatik yorumları bu hesap için kapalı" rozeti; owner öğeleri (pilot rozeti,
  önizleme anahtarı, Alan denetimi) gizli.

## 4. Hub / sayfa / DY rozeti
- Hub kartı `/astroloji` (`permissionKey: "astrology"`), `messages/tr|en/home.json` tek satır ekleme.
- `app/astroloji` (layout: kill switch → `notFound()`; sayfa admin sayfasını yeniden kullanır, API yolu `astroPath()` ile seçilir).
- DY rozeti (`AstrologyClientStatus`): admin → owner ucu; uzman → yalnız `astrology === true` ve demo değilse `/api/astroloji/client-status`.

## 5. Testler
- `static.harness` 14 · `perm7c.harness` 16 (10 kullanıcı; 22 route yetkisiz matrisi; yorum kapalı/açık; açık sekmede kaldırma;
  kapat/aç; tenant izolasyonu; sinastri sızıntısı; DY ucu; unmapped; silme/eşleştirme). Mutasyon 7/7 yakalandı.
- Tam Astroloji paketi **367 PASS / 0 FAIL**; PG senaryoları PASS; `next build` OK.
- Üye Yönetimi faz1 149/0, faz2 106/0, hub-visibility 46/0; expert-usage-stats 53/0; usage360 logic 114/0; module-logic 97/0;
  cupping 1061/0; httponly-h1h4 29/0; auth 85/0; yh-expert-rollout PASS.
- Önceden var olan (7C öncesi tabanda da aynı) başka modül hataları: faz1-p3 3, usage360 coverage 15, demo-vitrin 2, beslenme-parity 1.

## 6. Yerel tarayıcı doğrulaması (127.0.0.1, sahte arka uç; masaüstü + 390 px)
- Kapalı: Hub'da kart yok, API 404, `/astroloji` "Yetkiniz Bulunmuyor".
- Admin Erişim sekmesi: iki anahtar açıklamalarıyla; açınca uzman 200 / `providerInterpretations:false`, yorumsuz görünüm + rozet.
- Yorum açılınca anlatı + "Roxy yorumu dahil"; rozet kalkar.
- DY: "Astroloji analizi mevcut (1)"; modül kapatılınca uç 404, yeniden yüklemede rozet yok; yeniden açınca geri gelir (yorum bayrağı korunur).
- 390 px: Hub kartı 343 px, `/astroloji` ve DY yatay kaydırma 0.
