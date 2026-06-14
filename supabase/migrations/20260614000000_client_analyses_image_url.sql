-- Add image_url column to client_analyses for analysis snapshot storage
ALTER TABLE client_analyses ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Public bucket for analysis PNG snapshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-analysis-images',
  'client-analysis-images',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;
