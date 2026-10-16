# Doğaltaş bilgi kaydı bazlı kaynak modeli — owner runbook

**Production'a otomatik UYGULANMAZ.** Aşağıdaki adımlar owner onayıyla, sırayla yapılır.

## Sıra (ZORUNLU)
1. **Ön kontrol (salt-okuma):** `sql/preflight_readonly.sql` — tablo yok, `entries_text` yok, taş sayısı/hash kaydı.
2. **Migration:** `supabase/migrations/20271016000000_dogaltas_stone_entries.sql`
   (yalnız ekleme: tablo + kolon + fonksiyon + tetikleyici; mevcut veri DEĞİŞMEZ; tekrar çalıştırılabilir).
3. **Uygulama deploy** (PR merge). Yaşam Hafızası indexer'ı ve içerik araması `entries_text`'i okur →
   migration'dan ÖNCE deploy edilirse içerik araması kademeli geri uyumla çalışır, ancak YH indexer'ı
   kolonu bulamaz. Bu yüzden sıra: migration → deploy.
4. **Son kontrol (salt-okuma):** `sql/postflight_readonly.sql` — RLS açık, grant yok, taş içerik hash'i
   1. adımdakiyle birebir, `stone_entries` boş.

Backfill YOK: eski metinler yerinde kalır ve uygulamada "eski bilgi kaydı" olarak gösterilir; yalnız
kullanıcı bir eski kaydı düzenler/silerse o kayıt atomik olarak değişir.

## Geri dönüş
Tercih: uygulama rollback (migration yerinde kalır; eski uygulama yeni tabloyu yok sayar).
Şemayı kaldırmak gerekirse: `sql/ROLLBACK_20271016000000.sql` (önce kayıtları yedekler). Dönüştürülmüş
eski kayıtların metni artık `stone_entries`'tedir — yedekten geri yüklemeden şemayı kaldırmak veri kaybettirir.

## Testler (prod'a sıfır temas)
- `npx tsx scripts/stone-entries/routes.harness.ts` — gerçek Postgres + gerçek route (kabul 1–14, legacy, migration öncesi)
- `npx tsx scripts/stone-entries/unit.harness.ts` — saf model, Word, sekme etiketi
- `node scripts/wt9/ui-wt9.mjs` — UI (yerel build + ağ-mock)
