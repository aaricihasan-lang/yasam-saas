"""F3 migration üretici (geliştirici aracı). F2'nin yayın üretimi + uzman araması ve F1'in facet ekleme gövdelerini alır,
F3 kurallarıyla genişletir ve supabase/migrations/20271201000200_stone_library_f3.sql dosyasını yazar.
Çalıştır: python scripts/stone-library/build-f3-migration.py  (çıktı deterministik; elle düzenlenmez).
Her yama TAM BİR KEZ eşleşmek zorundadır (aksi hâlde üretim durur)."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
F1 = (ROOT / "supabase/migrations/20271201000000_stone_library_core.sql").read_text(encoding="utf-8")
F2 = (ROOT / "supabase/migrations/20271201000100_stone_library_f2.sql").read_text(encoding="utf-8")
HEAD = (ROOT / "scripts/stone-library/sql/f3_head.sql").read_text(encoding="utf-8")
TAIL = (ROOT / "scripts/stone-library/sql/f3_tail.sql").read_text(encoding="utf-8")
RB_HEAD = (ROOT / "scripts/stone-library/sql/f3_rollback_head.sql").read_text(encoding="utf-8")
RB_TAIL = (ROOT / "scripts/stone-library/sql/f3_rollback_tail.sql").read_text(encoding="utf-8")


def extract(src: str, name: str) -> str:
    mm = re.search(r"CREATE OR REPLACE FUNCTION public\." + name + r"\(.*?\nEND \$\$;\n", src, re.S)
    assert mm, name
    return mm.group(0)


def patch(src: str, pairs: list[tuple[str, str]]) -> str:
    for a, b in pairs:
        assert src.count(a) == 1, (src[:60], a[:100])
        src = src.replace(a, b)
    return src


# ── 1) Yayın belgesi (F2 gövdesi) ────────────────────────────────────────────────────────────────
refresh = extract(F2, "stone_library_refresh_stone")
# Geçici tablolar F3 kolonlarıyla yeniden adlandırılır (aynı oturumda eski tanımla çakışmaz).
assert refresh.count("_sl_vis") > 0 and refresh.count("_sl_fac") > 0
refresh = refresh.replace("_sl_vis", "_sl_vis3").replace("_sl_fac", "_sl_fac3")
refresh = patch(refresh, [
    # Kayıt: sağlık işareti taşınır (uzman tarafında AYRI tıbbi bilgilendirme bileşeni için); metin değişmez.
    ("CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_vis3 (source_id uuid, field_key text, lang text, content text, src_rank bigint, label text, attribution text) ON COMMIT DROP;",
     "CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_vis3 (source_id uuid, field_key text, lang text, content text, src_rank bigint, label text, attribution text, health boolean) ON COMMIT DROP;"),
    ("""  SELECT r.source_id, r.field_key, r.lang, r.content,
         dense_rank() OVER (ORDER BY s.created_at, s.id),
         public.stone_library_source_label(s),
         CASE WHEN s.attribution_required THEN s.attribution_text END""",
     """  SELECT r.source_id, r.field_key, r.lang, r.content,
         dense_rank() OVER (ORDER BY s.created_at, s.id),
         public.stone_library_source_label(s),
         CASE WHEN s.attribution_required THEN s.attribution_text END,
         r.health_sensitive"""),
    # Sağlık görünürlüğü: tek kural (legal_review / owner_decision modları; genel kilit).
    ("     AND (NOT r.health_sensitive OR (r.legal_cleared_at IS NOT NULL AND cfg.health_content_publication_enabled))",
     "     AND public.stone_library_health_ok(r.health_sensitive, r.legal_cleared_at, st.health_publish_decided_at)"),
    ("     AND (NOT f.health_sensitive OR (f.legal_cleared_at IS NOT NULL AND cfg.health_content_publication_enabled))",
     "     AND public.stone_library_health_ok(f.health_sensitive, f.legal_cleared_at, st.health_publish_decided_at)"),
    ("'fields', jsonb_agg(jsonb_build_object('field', field_key, 'lang', lang, 'content', content)",
     "'fields', jsonb_agg(jsonb_build_object('field', field_key, 'lang', lang, 'content', content, 'health_related', health)"),
    # Facet: anahtar kelimeler KAYNAK SIRASIYLA (eklenme sırası) ve sağlık işaretiyle.
    ("CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_fac3 (source_id uuid, facet text, value_key text, value_text text, value_num numeric, lang text, pair_slug text, pair_tr text, pair_en text) ON COMMIT DROP;",
     "CREATE TEMP TABLE IF NOT EXISTS pg_temp._sl_fac3 (source_id uuid, facet text, value_key text, value_text text, value_num numeric, lang text, pair_slug text, pair_tr text, pair_en text, created_at timestamptz, health boolean) ON COMMIT DROP;"),
    ("  SELECT f.source_id, f.facet, f.value_key, f.value_text, f.value_num, f.lang, ps.slug, ps.name_tr, ps.name_en\n",
     "  SELECT f.source_id, f.facet, f.value_key, f.value_text, f.value_num, f.lang, ps.slug, ps.name_tr, ps.name_en, f.created_at, f.health_sensitive\n"),
    ("    SELECT 'keyword', jsonb_agg(DISTINCT jsonb_build_object('lang', lang, 'text', value_text)) FROM pg_temp._sl_fac3 WHERE facet = 'keyword' HAVING count(*) > 0",
     "    SELECT 'keyword', jsonb_agg(jsonb_build_object('lang', k.lang, 'text', k.value_text) ORDER BY k.first_at, k.lang, k.value_text)\n"
     "      FROM (SELECT lang, value_text, min(created_at) AS first_at FROM pg_temp._sl_fac3 WHERE facet = 'keyword' GROUP BY lang, value_text) k HAVING count(*) > 0"),
    # Ayrı tıbbi bilgilendirme bileşeni (özgün metinlerin içine EKLENMEZ) + sağlık içeriği gösterimde mi.
    ("""   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'""",
     """   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND (i.external_id IS NULL OR EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = i.stone_id
            AND e.source_id = i.source_id AND e.external_id = i.external_id AND e.deleted_at IS NULL))
     AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'"""),
    ("      'health_notice', jsonb_build_object('tr', cfg.health_notice_tr, 'en', cfg.health_notice_en),",
     "      'health_notice', jsonb_build_object('tr', cfg.health_notice_tr, 'en', cfg.health_notice_en),\n"
     "      'medical_notice', jsonb_build_object('tr', cfg.medical_notice_tr, 'en', cfg.medical_notice_en),\n"
     "      'has_health_content', (EXISTS (SELECT 1 FROM pg_temp._sl_vis3 WHERE health) OR EXISTS (SELECT 1 FROM pg_temp._sl_fac3 WHERE health)),"),
])

# ── 2) Uzman araması (F2 gövdesi): önizleme ilk 240 karakter + kesildi işareti (DTO "…" ekler) ──────
search = extract(F2, "stone_library_expert_search")
search = patch(search, [
    ("    SELECT h.*, ex.content AS ex_content, ex.attribution AS ex_attribution",
     "    SELECT h.*, ex.content AS ex_content, ex.attribution AS ex_attribution, ex.truncated AS ex_truncated"),
    ("        SELECT left(fl ->> 'content', 240) AS content, sec ->> 'attribution' AS attribution",
     "        SELECT left(fl ->> 'content', 240) AS content, sec ->> 'attribution' AS attribution, char_length(fl ->> 'content') > 240 AS truncated"),
    ("           'excerpt', page.ex_content, 'excerpt_attribution', page.ex_attribution",
     "           'excerpt', page.ex_content, 'excerpt_truncated', coalesce(page.ex_truncated, false), 'excerpt_attribution', page.ex_attribution"),
])

# ── 3) Facet ekleme (F1 gövdesi): değer metni KIRPILMADAN saklanır (boşluk yalnız boşluk tespiti için) ──
facet_add = extract(F1, "stone_library_facet_add")
facet_add = patch(facet_add, [
    ("v_text text := nullif(btrim(coalesce(p_data ->> 'value_text','')), '');",
     "v_text text := CASE WHEN btrim(coalesce(p_data ->> 'value_text', '')) = '' THEN NULL ELSE p_data ->> 'value_text' END;"),
    ("  v_key text; v_id uuid; k text;", "  v_key text; v_id uuid; k text; v_kind text;"),
    ("""  IF NOT EXISTS (SELECT 1 FROM public.stone_library_sources WHERE id = v_source AND deleted_at IS NULL) THEN""",
     """  SELECT kind INTO v_kind FROM public.stone_library_sources WHERE id = v_source AND deleted_at IS NULL;
  IF v_kind IS NULL THEN"""),
])
assert facet_add.count("CASE WHEN v_batch IS NULL THEN") == 3
facet_add = facet_add.replace("CASE WHEN v_batch IS NULL THEN", "CASE WHEN v_batch IS NULL AND v_kind <> 'api' THEN")

# ── 4) Uzman görsel RPC'si (F2 gövdesi): görsel yalnız taşın ETKİN harici kimliğine bağlıysa servis edilir ──
expert_image = extract(F2, "stone_library_expert_image")
expert_image = patch(expert_image, [
    ("""   WHERE p.slug = p_slug AND p.has_image AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'""",
     """   WHERE p.slug = p_slug AND p.has_image AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND (i.external_id IS NULL OR EXISTS (SELECT 1 FROM public.stone_library_external_ids e WHERE e.stone_id = i.stone_id
            AND e.source_id = i.source_id AND e.external_id = i.external_id AND e.deleted_at IS NULL))"""),
])

out = ("BEGIN;\n" + HEAD
       + "-- ─── Yayın belgesi (F2 gövdesi + sağlık C modeli + kaynak sıralı anahtar kelime + ayrı tıbbi bilgilendirme) ─────\n"
       + refresh
       + "\n-- ─── Uzman araması (F2 gövdesi + önizleme kesildi işareti) ──────────────────────────────────────\n"
       + search
       + "\n-- ─── Facet ekleme (F1 gövdesi + değer metni kırpılmaz) ─────────────────────────────────────────\n"
       + facet_add
       + "\n-- ─── Uzman görsel RPC'si (F2 gövdesi + etkin harici kimlik koşulu) ─────────────────────────────────\n"
       + expert_image
       + "\n" + TAIL + "COMMIT;\n")
dst = ROOT / "supabase/migrations/20271201000200_stone_library_f3.sql"
dst.write_text(out, encoding="utf-8", newline="\n")
print("yazıldı:", out.count("\n"), "satır")

# ── Geri dönüş betiği: TEK ADIM. F3'ün değiştirdiği fonksiyonların ÖZGÜN F1 / F2 gövdeleri aynı işlemde geri kurulur. ──
originals = [extract(F1, "stone_library_stone_set_status"), extract(F1, "stone_library_settings_save"), extract(F1, "stone_library_facet_add"),
             extract(F2, "stone_library_refresh_stone"), extract(F2, "stone_library_expert_search"), extract(F2, "stone_library_expert_image")]
rb = RB_HEAD + "\n-- ─── F3'ün değiştirdiği fonksiyonların özgün gövdeleri (F1: durum / ayarlar / facet; F2: yayın / arama / görsel) ───\n" \
     + "\n".join(originals) + "\n" + RB_TAIL
(ROOT / "scripts/stone-library/sql/ROLLBACK_20271201000200.sql").write_text(rb, encoding="utf-8", newline="\n")
print("geri dönüş yazıldı:", rb.count("\n"), "satır")
