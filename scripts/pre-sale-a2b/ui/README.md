# AŞAMA 2B — UI davranış testleri (Playwright, yerel build, ağ-mock)

Prod'a / dış ağa temas YOK: tüm `/api/*` istekleri test içinde mock'lanır; 127.0.0.1 dışı her istek abort edilir.

## Çalıştırma

```bash
# 1) Sahte Supabase origin'i (tarayıcı anon okumalarını kaydeder; admin kabuğu için sunucu oturum kontrolünü yanıtlar)
node scripts/pre-sale-a2b/ui/fake-supabase-sink.mjs &

# 2) Sahte env ile build + start
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fake_local SUPABASE_SERVICE_ROLE_KEY=fake-local-service-key
npx next build && npx next start -p 3911 -H 127.0.0.1 &

# 3) Testler (UI_BASE ile farklı port verilebilir)
for t in t-home-tk t-saveflows t-ajanda t-hacamat t-sifa; do node scripts/pre-sale-a2b/ui/run-one.mjs $t.mjs; done
```

| Dosya | Kapsam |
|---|---|
| t-home-tk | P2-1 ana sayfa `/api/dashboard/summary` (200/401/403/500/ağ) + admin tenant-kontrol; tarayıcıdan anon tablo okuması 0 |
| t-saveflows | P2-2 Seans / Ücret / Ödev / Not: başarı (çift tık → tek yazma), 400, 500, ağ hatası |
| t-ajanda | P2-2 Ajanda randevu create/edit: başarı, 400/409/500, ağ hatası |
| t-hacamat | P2-3 Hacamat kural create/update/delete: hata görünürlüğü + optimistic rollback + UI = sunucu |
| t-sifa | P2-4 Şifa foto yükleme: prepare 4xx/5xx/ağ, demo, storage, finalize hataları |
