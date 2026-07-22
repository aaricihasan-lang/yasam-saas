-- ============================================================
-- 20260731000000_yebs_concept_relations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ D / D8
-- Tablo: public.yebs_concept_relations
--   (iki YEBS concept kaydı arasındaki açık, tipli, yönlü ve editoryal
--    olarak kaydedilmiş kavramsal ilişki gövdesi)
--
-- Tek sorumluluk: yalnız yebs_concept_relations tablosu.
-- Merkezî referans: tenant_id YOK. İzolasyon doğuştan-kilitle sağlanır.
-- Doğuştan-kilitli: RLS ENABLE (policy YOK) + anon/authenticated/PUBLIC REVOKE
--   + service_role GRANT. Tüm erişim sunucu admin API (service_role) üzerinden.
-- Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--   DO bloğu yok, ENUM tipi yok (text + CHECK), nesne düşürme yok, seed yok.
-- Ortak public.set_updated_at() yalnız yeniden kullanılır (yeniden tanımlanmaz;
--   tanımı 20260702000000_user_location_prefs.sql migration'ında).
--
-- Bir satırın anlamı: D8 satırı bir ilişkinin bilimsel, evrensel veya mutlak
--   doğru olduğunu İLAN ETMEZ. İlişki relation_type + status + (gelecekteki D9)
--   kaynak/provenans bağlarıyla birlikte değerlendirilerek anlamlandırılır.
--
-- D8/D9 sorumluluk ayrımı: kaynak, locator, pasaj, özgün metin, transliterasyon,
--   sadık çeviri, rationale, source_role, verification_status ve evidence_layer
--   BURADA YER ALMAZ — tamamı D9 yebs_concept_relation_sources sorumluluğudur.
--   D9 İLKESİ (rezervasyon): her relation-source bağı KENDİ evidence_layer
--   değerini taşıyacaktır; böylece aynı ilişkinin bilimsel/düzenleyici/klinik/
--   deneysel/geleneksel/tarihsel/deneyimsel/enerjetik-metafizik destekleri
--   birbirine karıştırılmadan ayrı ayrı gösterilir. Katmanlar ortalanmaz.
--
-- FK kararı (bilinçli güncel karar): her iki concept FK'sı ON DELETE RESTRICT.
--   D3 başlık yorumundaki eski "D8 relations CASCADE" öngörüsü bağlayıcı şema
--   değildir; D8 ileride D9 üzerinden kaynak/pasaj/doğrulama geçmişi taşıyacağı
--   için concept silmeyle relation+provenans zincirinin sessizce yok olması
--   kabul edilmez (tarihsel bütünlük/provenans anayasası).
--
-- relation_type v1 semantik sözleşmesi (kanonik-yalın küme; ters tipler CHECK'te
--   YOK, ters okuma yalnız sunumda; otomatik ters D8 satırı OLUŞTURULMAZ):
--   broader_than    yönlü; source, target'tan daha genel/geniş kavram;
--                   yalnız aynı tradition (server-side); sunum tersi narrower_than.
--   part_of         yönlü; source, target'ın yapısal parçası;
--                   yalnız aynı tradition (server-side); sunum tersi has_part.
--   related_to      kayıt yönlü, anlam simetrik; nötr bağ; yalnız aynı tradition;
--                   ayna kayıt (B,A) yazılmaz — server insert öncesi kesin reddeder.
--   contrasted_with kayıt yönlü, anlam simetrik; benzer görünen fakat
--                   ayrıştırılması gereken kavramlar; aynı/farklı tradition;
--                   ayna kayıt (B,A) yazılmaz — server insert öncesi kesin reddeder.
--   corresponds_to  yönlü; EŞDEĞERLİK DEĞİLDİR — bir kaynağın source ile target
--                   arasında açıkça kurduğu karşılık İDDİASI; aynı/farklı
--                   tradition veya school; ters yönde otomatik ilişki/iddia
--                   gösterilmez (yalnız ters yönlü navigasyon); B→A ancak ayrıca
--                   kaynaklandırılmış + editoryal onaylıysa ayrı satır olabilir,
--                   bu nedenle ayna-mükerrer kuralına DAHİL DEĞİLDİR.
--   equivalent_to / approximate_equivalent_to v1'de KESİNLİKLE YOKTUR.
--
-- Doğal kimlik: UNIQUE(source_concept_id, target_concept_id, relation_type) —
--   aynı yön + aynı tip için tek gövde; farklı kaynaklar aynı satıra D9'da ayrı
--   satırlarla bağlanır. status/provenans kimliğe dahil değildir. Expression
--   UNIQUE / LEAST-GREATEST YOK; simetrik ayna-mükerrer engeli server-side'dır.
--
-- Server-side/editoryal kurallar (DB trigger'ı DEĞİL; cross-table publish
--   trigger YAZILMAZ):
--   A) Publish kapısı: relation 'published' olmadan önce en az bir D9 satırı
--      BİRLİKTE source_role IN ('primary_support','supporting') AND
--      verification_status='verified' AND source.status IN ('approved','published')
--      sağlamalıdır. contradiction/context ve draft/archived source destek sayılmaz.
--   B) corresponds_to sıkı kapısı: (A)'ya ek olarak en az bir nitelikli D9
--      bağında locator_text VEYA source_original_excerpt dolu olmalıdır; belge
--      düzeyi locatorsız/pasajsız bağ tek başına yeterli değildir. İki-kaynak
--      zorunluluğu YOKTUR (kaynak sayısı tek başına doğruluk ölçütü değildir).
--   C) Cross-tradition matrisi (tradition_id D8'e KOPYALANMAZ; concepts JOIN
--      ile denetlenir): broader_than/part_of/related_to yalnız aynı tradition;
--      contrasted_with/corresponds_to aynı veya farklı tradition.
--   D) Ayna-mükerrer: related_to/contrasted_with için (A,B,type) varken
--      (B,A,type) insert'i kesin reddedilir; corresponds_to dahil değildir.
--   E) Döngü: broader_than/part_of zincirlerinde dolaylı döngüler engellenir.
--   F) AI sınırı: AI/embedding/similarity yalnız aday önerir; doğrudan D8
--      yazamaz — yazım açık editoryal onaylı server akışındandır.
--   G) Silme: normal emeklilik status='archived'; fiziksel DELETE istisnai
--      admin işlemidir. Geçişler server-side; generic CRUD 'published' yazamaz.
--   'rejected' D8 status kümesinde YOKTUR: kabul edilmemiş öneri canonical D8'e
--   published/approved olarak girmez; ret denetim izi gelecekte D9
--   verification_status='rejected' ile tutulabilir.
-- ============================================================

CREATE TABLE public.yebs_concept_relations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_id  uuid        NOT NULL,
  target_concept_id  uuid        NOT NULL,
  relation_type      text        NOT NULL,
  status             text        NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Kaynak-uç kavram bağı. İlişki (ve ileride D9 provenansı) varken concept silinemez.
  CONSTRAINT yebs_concept_relations_source_concept_fk
    FOREIGN KEY (source_concept_id)
    REFERENCES public.yebs_concepts (id)
    ON DELETE RESTRICT,

  -- Hedef-uç kavram bağı. Aynı gerekçeyle RESTRICT.
  CONSTRAINT yebs_concept_relations_target_concept_fk
    FOREIGN KEY (target_concept_id)
    REFERENCES public.yebs_concepts (id)
    ON DELETE RESTRICT,

  -- Self-relation yasak: kavram kendisiyle ilişkilendirilemez.
  CONSTRAINT yebs_concept_relations_no_self_relation_chk CHECK (
    source_concept_id <> target_concept_id
  ),

  -- v1 kilitli tip kümesi (kanonik-yalın; semantik sözleşme başlık yorumunda).
  CONSTRAINT yebs_concept_relations_relation_type_chk CHECK (
    relation_type IN (
      'broader_than',
      'part_of',
      'related_to',
      'contrasted_with',
      'corresponds_to'
    )
  ),

  -- Yayın yaşam döngüsü (D6 claims ile aynı küme; geçişler server-side).
  -- archived = fiziksel silme değil; 'rejected' bilinçli olarak YOK.
  CONSTRAINT yebs_concept_relations_status_chk CHECK (
    status IN (
      'draft',
      'under_review',
      'needs_verification',
      'verified',
      'approved',
      'published',
      'archived'
    )
  ),

  -- Doğal kimlik: aynı yön + aynı tip için tek ilişki gövdesi.
  CONSTRAINT yebs_concept_relations_source_target_type_key
    UNIQUE (source_concept_id, target_concept_id, relation_type)
);

-- Ters yön sorgusu ("bu kavramı hedefleyen ilişkiler") + target FK RESTRICT
-- child taraması. (source için ayrı index YOK — UNIQUE'in öncü sütunu karşılar.)
CREATE INDEX yebs_concept_relations_target_idx
  ON public.yebs_concept_relations (target_concept_id);

-- Statüye göre yayın filtreleme (ör. yalnız published ilişkiler).
CREATE INDEX yebs_concept_relations_status_idx
  ON public.yebs_concept_relations (status);

-- updated_at trigger — ortak public.set_updated_at() yalnız reuse (tabloya özgü ad).
CREATE TRIGGER trg_yebs_concept_relations_updated_at
  BEFORE UPDATE ON public.yebs_concept_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Güvenlik: doğuştan-kilitli. Satır güvenliği açık; izin-veren kural (policy) yok.
-- anon/authenticated/PUBLIC tam REVOKE; yalnız service_role yetkili.
ALTER TABLE public.yebs_concept_relations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_concept_relations FROM anon;
REVOKE ALL ON TABLE public.yebs_concept_relations FROM authenticated;
REVOKE ALL ON TABLE public.yebs_concept_relations FROM PUBLIC;
GRANT  ALL ON TABLE public.yebs_concept_relations TO service_role;
