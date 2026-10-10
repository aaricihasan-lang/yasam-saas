-- ASTROLOJİ 9C — KARMA (eski + yeni) veritabanı parmak izi. Tüm eski tohumlardan SONRA, 000000–000700 yeniden
-- uygulanmadan ÖNCE çalışır. kb_snapshot bilerek parmak izine girmez (000700 eski KB kopyalarını boşaltır; 9B kararı).
-- Yalnız yerel embedded-postgres.
CREATE TABLE IF NOT EXISTS public._astro9c_baseline (k text PRIMARY KEY, v text NOT NULL);
INSERT INTO public._astro9c_baseline (k, v)
SELECT 'counts', concat_ws('|',
  (SELECT count(*) FROM public.astro_birth_profiles), (SELECT count(*) FROM public.astro_birth_profile_revisions),
  (SELECT count(*) FROM public.astro_provider_results), (SELECT count(*) FROM public.astro_provider_interpretations),
  (SELECT count(*) FROM public.astro_kb_entries), (SELECT count(*) FROM public.astro_expert_notes),
  (SELECT count(*) FROM public.astro_analyses), (SELECT count(*) FROM public.astro_analysis_notes))
ON CONFLICT (k) DO NOTHING;
INSERT INTO public._astro9c_baseline (k, v)
SELECT 'analyses', coalesce(string_agg(md5(id::text || owner_user_id::text || profile_id::text || profile_revision::text
  || coalesce(partner_profile_id::text, '-') || coalesce(client_id::text, '-') || profile_snapshot::text || method_snapshot::text
  || technical_snapshot::text || coalesce(provider_interp_snapshot::text, '-') || versions_snapshot::text || title), ',' ORDER BY id), '')
FROM public.astro_analyses
ON CONFLICT (k) DO NOTHING;
INSERT INTO public._astro9c_baseline (k, v)
SELECT 'notes', coalesce(string_agg(md5(id::text || analysis_id::text || section_key || body), ',' ORDER BY id), '') FROM public.astro_analysis_notes
ON CONFLICT (k) DO NOTHING;
INSERT INTO public._astro9c_baseline (k, v)
SELECT 'profiles', coalesce(string_agg(md5(p.id::text || p.owner_user_id::text || coalesce(p.client_id::text, '-') || p.label || p.current_revision::text), ',' ORDER BY p.id), '')
FROM public.astro_birth_profiles p
ON CONFLICT (k) DO NOTHING;
INSERT INTO public._astro9c_baseline (k, v)
SELECT 'kb', coalesce(string_agg(md5(id::text || owner_user_id::text || title || body), ',' ORDER BY id), '') FROM public.astro_kb_entries
ON CONFLICT (k) DO NOTHING;
