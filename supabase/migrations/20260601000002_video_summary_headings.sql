-- video_transcription_jobs tablosuna özet ve başlık alanları eklenir
-- IF NOT EXISTS — idempotent, tekrar çalıştırılabilir

alter table public.video_transcription_jobs
  add column if not exists summary_text  text,
  add column if not exists headings_text text;
