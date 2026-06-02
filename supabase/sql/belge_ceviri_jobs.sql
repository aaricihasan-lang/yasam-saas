-- ── belge_ceviri_jobs ─────────────────────────────────────────────────────────
-- Büyük Dosya Modu için async çeviri job tablosu.
-- Storage bucket: belge-ceviri
--   source_path → belge-ceviri/input/<id>.pdf
--   result_path → belge-ceviri/output/<id>.docx

CREATE TABLE IF NOT EXISTS public.belge_ceviri_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'completed' | 'failed'
  job_type      text NOT NULL,
  -- 'pdf-to-word' | 'pdf-to-turkce-word' | 'pdf-to-turkce-pdf'
  file_name     text NOT NULL,
  total_pages   int,
  total_chunks  int NOT NULL DEFAULT 0,
  done_chunks   int NOT NULL DEFAULT 0,
  source_path   text,
  result_path   text,
  error_message text
);

-- ── updated_at otomatik güncellemesi ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER belge_ceviri_jobs_updated_at
  BEFORE UPDATE ON public.belge_ceviri_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── İzinler ───────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.belge_ceviri_jobs TO anon, authenticated, service_role;
