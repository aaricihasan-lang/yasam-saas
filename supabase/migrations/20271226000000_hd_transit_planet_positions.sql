-- HD TRANSİT — KALICI GEZEGEN KONUMU ÖNBELLEĞİ (L2). Yalnız KİŞİSEL OLMAYAN gök verisi: tek bir UTC anının
-- doğrulanmış geosentrik tropikal boylamları (Roxy POST /astrology/planets; doğum verisi YOK).
--
-- İÇERMEZ: danışan adı, doğum bilgisi, kullanıcı / tenant kimliği, kişisel transit sonucu. Satır tenant'tan bağımsızdır;
-- aynı UTC anı tüm tenant'larda aynı değeri verir (bu yüzden tenant_id YOKTUR — paylaşım kasıtlıdır ve kişisel değildir).
--
-- GÜVENLİK: RLS etkin, policy YOK (deny-by-default). anon / authenticated / PUBLIC için TÜM yetkiler kaldırılır.
-- Yalnız service_role SELECT + INSERT; UPDATE / DELETE verilmez (bozuk kayıt otomatik SİLİNMEZ; onarım farklı anahtarla
-- yazılır — lib/human-design/transit/transitPlanetStore.ts).
--
-- Kod bu tablodan ÖNCE yayınlanabilir: tablo yoksa okuma hatası (42P01 / PGRST205) eski Next Data Cache yoluna düşer.
-- IDEMPOTENT.

CREATE TABLE IF NOT EXISTS public.hd_transit_planet_positions (
  cache_key       text        NOT NULL,
  utc_at          timestamptz NOT NULL,
  provider        text        NOT NULL,
  adapter_version text        NOT NULL,
  node_type       text        NOT NULL,
  engine_version  text        NOT NULL,
  schema_version  smallint    NOT NULL DEFAULT 1,
  longitudes      jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_transit_planet_positions_pkey PRIMARY KEY (cache_key),
  CONSTRAINT hd_transit_planet_positions_key_len CHECK (char_length(cache_key) BETWEEN 20 AND 200),
  CONSTRAINT hd_transit_planet_positions_utc_second CHECK (utc_at = date_trunc('second', utc_at)),
  CONSTRAINT hd_transit_planet_positions_provider CHECK (provider = 'roxyapi'),
  CONSTRAINT hd_transit_planet_positions_node CHECK (node_type IN ('true', 'mean')),
  CONSTRAINT hd_transit_planet_positions_versions CHECK (char_length(adapter_version) BETWEEN 1 AND 40 AND char_length(engine_version) BETWEEN 1 AND 40 AND schema_version >= 1),
  CONSTRAINT hd_transit_planet_positions_lon_obj CHECK (jsonb_typeof(longitudes) = 'object'),
  CONSTRAINT hd_transit_planet_positions_lon_bodies CHECK (
    longitudes ?& ARRAY['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','NorthNode','SouthNode']
  )
);

COMMENT ON TABLE public.hd_transit_planet_positions IS
  'HD transit L2 önbelleği: tek UTC anının doğrulanmış gezegen boylamları (kişisel veri / tenant yok). Yalnız service_role.';

CREATE INDEX IF NOT EXISTS hd_transit_planet_positions_utc_idx ON public.hd_transit_planet_positions (utc_at);

REVOKE ALL PRIVILEGES ON public.hd_transit_planet_positions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.hd_transit_planet_positions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.hd_transit_planet_positions TO service_role;
