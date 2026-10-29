"""F2 migration üretici (geliştirici aracı). F1'deki stone_library_refresh_stone gövdesini alır, F2 kurallarıyla
genişletir ve supabase/migrations/20271201000100_stone_library_f2.sql dosyasını yazar.
Çalıştır: python scripts/stone-library/build-f2-migration.py  (çıktı deterministik; elle düzenlenmez)."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
F1 = (ROOT / "supabase/migrations/20271201000000_stone_library_core.sql").read_text(encoding="utf-8")
HEAD = (ROOT / "scripts/stone-library/sql/f2_head.sql").read_text(encoding="utf-8")
TAIL = (ROOT / "scripts/stone-library/sql/f2_tail.sql").read_text(encoding="utf-8")

m = re.search(r"CREATE OR REPLACE FUNCTION public\.stone_library_refresh_stone\(p_stone uuid\).*?\nEND \$\$;\n", F1, re.S)
assert m, "refresh_stone bulunamadı"
body = m.group(0)


def rep(a: str, b: str) -> None:
    global body
    assert body.count(a) == 1, a[:80]
    body = body.replace(a, b)


# 1) Dil şüphesi işaretli kayıt / facet yayına çıkmaz (owner dili doğrulayana kadar).
rep("""     AND r.review_state = 'approved' AND r.visibility = 'visible'""",
    """     AND r.review_state = 'approved' AND r.visibility = 'visible'
     AND NOT ('lang_suspect' = ANY (r.quality_flags))""")
rep("""   WHERE f.stone_id = p_stone AND f.deleted_at IS NULL AND f.review_state = 'approved' AND f.visibility = 'visible'""",
    """   WHERE f.stone_id = p_stone AND f.deleted_at IS NULL AND f.review_state = 'approved' AND f.visibility = 'visible'
     AND NOT ('lang_suspect' = ANY (f.quality_flags))""")
# 2) Görsel: yalnız onaylı + görünür + kaynağın görsel hakkı 'rehost_ok' + owner'ın DOĞRULADIĞI geçerli lisans izni.
rep("""  v_hmin numeric; v_hmax numeric; v_exp timestamptz;""",
    """  v_hmin numeric; v_hmax numeric; v_exp timestamptz; v_img record; v_img_meta jsonb;""")
rep("""  v_text_a := concat_ws(' ', st.name_tr, st.name_en, array_to_string(v_names, ' '));""",
    """  SELECT i.variant, i.width, i.height INTO v_img
    FROM public.stone_library_images i
    JOIN public.stone_library_sources s ON s.id = i.source_id
   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved' AND i.visibility = 'visible'
     AND s.deleted_at IS NULL AND s.status = 'active' AND s.image_rights = 'rehost_ok'
     AND (s.license_valid_until IS NULL OR s.license_valid_until > now())
     AND EXISTS (SELECT 1 FROM public.stone_library_license_grants g
                  WHERE g.id = i.license_grant_id AND g.source_id = i.source_id AND g.scope = 'crystal_images'
                    AND g.evidence_status = 'verified' AND g.storage_allowed AND g.commercial_display
                    AND (g.valid_until IS NULL OR g.valid_until >= current_date)
                    AND (g.modification_allowed OR i.variant = 'original'))
   ORDER BY (i.variant = 'optimized') DESC, i.created_at DESC LIMIT 1;
  -- Görselin kaynağı / izni de yayın satırının bitiş zamanına girer.
  SELECT least(v_exp, min(s.license_valid_until), min((g.valid_until + 1)::timestamptz)) INTO v_exp
    FROM public.stone_library_images i
    JOIN public.stone_library_sources s ON s.id = i.source_id
    LEFT JOIN public.stone_library_license_grants g ON g.id = i.license_grant_id
   WHERE i.stone_id = p_stone AND i.deleted_at IS NULL AND i.review_state = 'approved';
  SELECT jsonb_build_object('attribution', CASE WHEN g.attribution_required THEN g.attribution_text END) INTO v_img_meta
    FROM public.stone_library_images i JOIN public.stone_library_license_grants g ON g.id = i.license_grant_id
   WHERE i.stone_id = p_stone AND i.variant = v_img.variant AND i.deleted_at IS NULL AND i.review_state = 'approved' LIMIT 1;

  v_text_a := concat_ws(' ', st.name_tr, st.name_en, array_to_string(v_names, ' '));""")
rep("""      'pairings', v_pairings, 'sections', v_sections,""",
    """      'pairings', v_pairings, 'sections', v_sections,
      'image', CASE WHEN v_img.variant IS NULL THEN NULL
                    ELSE jsonb_build_object('available', true, 'width', v_img.width, 'height', v_img.height,
                                            'attribution', v_img_meta ->> 'attribution') END,""")
rep("""chakra, zodiac, element, color, planet, keyword, pairing, birth_month, hardness_min, hardness_max, expires_at, refreshed_at)""",
    """chakra, zodiac, element, color, planet, keyword, pairing, birth_month, hardness_min, hardness_max, expires_at, has_image, refreshed_at)""")
rep("""    v_hmin, v_hmax, v_exp, now());""", """    v_hmin, v_hmax, v_exp, (v_img.variant IS NOT NULL), now());""")

refresh = body


def extract(name: str) -> str:
    mm = re.search(r"CREATE OR REPLACE FUNCTION public\." + name + r"\(.*?\nEND \$\$;\n", F1, re.S)
    assert mm, name
    return mm.group(0)


def patch(src: str, pairs: list[tuple[str, str]]) -> str:
    for a, b in pairs:
        assert src.count(a) == 1, (a[:80])
        src = src.replace(a, b)
    return src


# Silme: taş / kaynak cascade görselleri de kapsar; tekil 'image' varlığı.
delete_fn = patch(extract("stone_library_delete"), [
    ("""    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_stones', ARRAY[p_id]);""",
     """    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE stone_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_stones', ARRAY[p_id]);"""),
    ("""    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_sources', ARRAY[p_id]);""",
     """    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE source_id = p_id AND deleted_at IS NULL));
    v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_sources', ARRAY[p_id]);"""),
    ("""  ELSIF p_entity IN ('record','facet','name','external_id','document') THEN""",
     """  ELSIF p_entity IN ('record','facet','name','external_id','document','image') THEN"""),
    ("""                             WHEN 'name' THEN 'stone_library_names' WHEN 'external_id' THEN 'stone_library_external_ids'""",
     """                             WHEN 'name' THEN 'stone_library_names' WHEN 'external_id' THEN 'stone_library_external_ids'
                             WHEN 'image' THEN 'stone_library_images'"""),
])
restore_fn = patch(extract("stone_library_restore"), [
    ("""                    'stone_library_names','stone_library_facets','stone_library_records'];""",
     """                    'stone_library_names','stone_library_facets','stone_library_records','stone_library_images'];"""),
])
# Uzman araması: liste öğesi "görsel var" bilgisini taşır (yol / URL yok).
search_fn = patch(extract("stone_library_expert_search"), [
    ("""           WHEN p.names_fold = v_q OR p.sort_key = v_q THEN 4""",
     """           WHEN p.names_fold = v_q OR p.sort_key = v_q OR public.stone_library_fold(p.name_en) = v_q THEN 4"""),
    ("""           'slug', page.slug, 'name_tr', page.name_tr, 'name_en', page.name_en,""",
     """           'slug', page.slug, 'name_tr', page.name_tr, 'name_en', page.name_en, 'has_image', page.has_image,"""),
])

# Paket geri alma: paketin kaydettiği görseller de geri alınır (lisans / kaynak sorununda yayından düşer).
rollback_fn = patch(extract("stone_library_batch_rollback"), [
    ("""  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_external_ids', ARRAY(SELECT id FROM public.stone_library_external_ids WHERE batch_id = p_batch_id AND deleted_at IS NULL));""",
     """  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_external_ids', ARRAY(SELECT id FROM public.stone_library_external_ids WHERE batch_id = p_batch_id AND deleted_at IS NULL));
  v_aff := v_aff || public.stone_library_soft_delete_rows(v_op, p_actor, 'stone_library_images', ARRAY(SELECT id FROM public.stone_library_images WHERE batch_id = p_batch_id AND deleted_at IS NULL));"""),
])

out = (HEAD
       + "\n-- ─── Yayın belgesi (F1 gövdesi + dil şüphesi kilidi + doğrulanmış lisanslı görsel) ───────────────\n" + refresh
       + "\n-- ─── Silme / geri alma (F1 gövdesi + görseller) ─────────────────────────────────────────────────\n" + delete_fn + "\n" + restore_fn
       + "\n-- ─── Uzman araması (F1 gövdesi + has_image) ─────────────────────────────────────────────────────\n" + search_fn
       + "\n-- ─── Paket geri alma (F1 gövdesi + görseller) ───────────────────────────────────────────────────\n" + rollback_fn
       + "\n" + TAIL)
(ROOT / "supabase/migrations/20271201000100_stone_library_f2.sql").write_text(out, encoding="utf-8", newline="\n")
print("yazıldı:", len(out.splitlines()), "satır")
