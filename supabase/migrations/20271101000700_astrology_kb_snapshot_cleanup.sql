-- Astroloji Aşama 9B-P2-01 — eski kayıtlı analizlerdeki GENEL Bilgi Bankası KOPYALARININ güvenli temizliği.
--
-- Owner kararı: genel Bilgi Bankası metinleri analize kopyalanmaz; analiz açılırken / rapor üretilirken uzmanın GÜNCEL
-- Bilgi Bankası'ndan eşleştirilir (uygulama 9B ile kb_snapshot'ı artık OKUMAZ ve YAZMAZ). Eski kayıtlarda kalan kopyalar
-- ölü veridir ve yer kaplar.
--
-- Ne değişir: YALNIZ public.astro_analyses.kb_snapshot → '[]'.
-- Ne DEĞİŞMEZ: technical_snapshot, profile_snapshot (sinastri/kompozit karşı tarafı dahil), method_snapshot,
--   provider_interp_snapshot (Roxy yorumu), versions_snapshot, başlık / tarih / bağlar ve danışana özel notlar
--   (ayrı tablo astro_analysis_notes — bu dosya o tabloya HİÇ dokunmaz).
-- Güvenlik (fail-safe): bir satır YALNIZ dizideki HER öğe Bilgi Bankası biçimindeyse (nesne; entryId + topicKey + title
--   + body anahtarları var; not alanı section_key / sectionKey YOK) boşaltılır. Tanınmayan biçim içeren satıra
--   DOKUNULMAZ ve sayısı bildirilir. İdempotent: boş diziler zaten seçilmez.
-- Yer kazanımı: boşaltılan TOAST alanı autovacuum ile yeniden kullanılır; diske iade için ayrıca VACUUM (FULL) gerekir.
--
-- Yalnız YEREL hazırlandı; production'a owner onayı + yedek sonrası uygulanır.

DO $$
DECLARE
  n_with_kb bigint;
  n_cleared bigint;
  n_skipped bigint;
BEGIN
  SELECT count(*) INTO n_with_kb FROM public.astro_analyses WHERE jsonb_array_length(kb_snapshot) > 0;

  WITH upd AS (
    UPDATE public.astro_analyses a
       SET kb_snapshot = '[]'::jsonb
     WHERE jsonb_array_length(a.kb_snapshot) > 0
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(a.kb_snapshot) e
          WHERE jsonb_typeof(e) <> 'object'
             OR NOT (e ? 'entryId' AND e ? 'topicKey' AND e ? 'title' AND e ? 'body')
             OR e ? 'section_key'
             OR e ? 'sectionKey'
       )
    RETURNING 1
  )
  SELECT count(*) INTO n_cleared FROM upd;

  n_skipped := n_with_kb - n_cleared;
  RAISE NOTICE 'ASTRO 9B KB temizliği: KB kopyalı analiz %, boşaltılan %, tanınmayan biçim nedeniyle dokunulmayan %', n_with_kb, n_cleared, n_skipped;
END
$$;
