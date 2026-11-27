<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migration numarası (DB-03) — tüm oturumlar için

- Yeni migration numarası **elle seçilmez**: `npm run migration:numara -- yeni --modul <modül> --ad <ad>` (iş dalında).
- SQL commit edilip PR açılınca: `npm run migration:numara -- bagla --surum <S> --pr <N>`; SQL her değiştiğinde commit + `bagla` tekrar.
- `supabase/migrations/` altında base'de olan dosyayı değiştirme, silme, yeniden adlandırma; yeni migration ekle.
- Production'a uygulama yalnız Owner onayıyla `scripts/migrations/numara/uygula-prod.mjs` üzerinden (toplu `db push` yok).
- Ayrıntı ve sık sorular: `docs/migrations/merkezi-numara.md`.
