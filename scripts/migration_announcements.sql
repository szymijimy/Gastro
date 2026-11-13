-- ============================================================================
-- MIGRACJA: restaurant_announcements (Zdjęcia, retencja 30 dni i konfiguracja Storage)
-- Data: 2026-11-12
-- Opis:
--   1. Dodaje kolumny image_url oraz keep_in_history do tabeli restaurant_announcements.
--   2. Tworzy publiczny bucket Supabase Storage 'announcement-images' i polityki RLS.
--   3. Konfiguruje uprawnienia tabeli i polityki RLS.
--   4. Udostępnia zapytanie SQL i funkcję do automatycznego czyszczenia wygasłych ogłoszeń.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MODYFIKACJA TABELI restaurant_announcements
-- ----------------------------------------------------------------------------

-- Dodanie kolumny na URL zdjęcia (może być linkiem ze storage lub base64 data url)
ALTER TABLE restaurant_announcements 
  ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Dodanie kolumny decydującej o retencji w historii po wygaśnięciu (domyślnie false = auto-delete po 30 dniach)
ALTER TABLE restaurant_announcements 
  ADD COLUMN IF NOT EXISTS keep_in_history boolean NOT NULL DEFAULT false;

-- Indeks przyspieszający filtrowanie wygasłych ogłoszeń do automatycznego czyszczenia
CREATE INDEX IF NOT EXISTS idx_restaurant_announcements_retention 
  ON restaurant_announcements (keep_in_history, visible_until);

-- ----------------------------------------------------------------------------
-- 2. UPRAWNIENIA I POLITYKI RLS DLA TABELI restaurant_announcements
-- ----------------------------------------------------------------------------

GRANT ALL ON TABLE restaurant_announcements TO authenticated;
GRANT ALL ON TABLE restaurant_announcements TO anon;
GRANT ALL ON TABLE restaurant_announcements TO service_role;

ALTER TABLE restaurant_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_announcements" ON restaurant_announcements;
CREATE POLICY "allow_all_authenticated_restaurant_announcements" ON restaurant_announcements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_anon_restaurant_announcements" ON restaurant_announcements;
CREATE POLICY "allow_all_anon_restaurant_announcements" ON restaurant_announcements
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. KONFIGURACJA SUPABASE STORAGE: BUCKET 'announcement-images'
-- ----------------------------------------------------------------------------

-- Rejestracja publicznego bucketu na zdjęcia ogłoszeń
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Polityki dostępu do obiektów w buckecie 'announcement-images'
DROP POLICY IF EXISTS "Public access for announcement images" ON storage.objects;
CREATE POLICY "Public access for announcement images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "Allow uploads to announcement images" ON storage.objects;
CREATE POLICY "Allow uploads to announcement images"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "Allow updates to announcement images" ON storage.objects;
CREATE POLICY "Allow updates to announcement images"
  ON storage.objects FOR UPDATE
  TO authenticated, anon
  USING (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "Allow deletes from announcement images" ON storage.objects;
CREATE POLICY "Allow deletes from announcement images"
  ON storage.objects FOR DELETE
  TO authenticated, anon
  USING (bucket_id = 'announcement-images');

-- ----------------------------------------------------------------------------
-- 4. PROCEDURA I ZAPYTANIA CZYSZCZENIA RETENCYJNEGO (30 DNI OD WYGAŚNIĘCIA)
-- ----------------------------------------------------------------------------

-- Funkcja PostgreSQL do okresowego czyszczenia wygasłych ogłoszeń:
-- Usuwa ogłoszenia z visible_until starszym niż 30 dni, które nie mają flagi keep_in_history
CREATE OR REPLACE FUNCTION cleanup_expired_announcements()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM restaurant_announcements
  WHERE keep_in_history = false
    AND visible_until IS NOT NULL
    AND visible_until::date < (CURRENT_DATE - INTERVAL '30 days');
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Przykładowe jednorazowe zapytanie czyszczące:
-- DELETE FROM restaurant_announcements
-- WHERE keep_in_history = false
--   AND visible_until IS NOT NULL
--   AND visible_until::date < (CURRENT_DATE - INTERVAL '30 days');

-- Opcjonalnie: harmonogramowanie cron w pg_cron (jeśli rozszerzenie jest aktywne):
-- SELECT cron.schedule(
--   'cleanup-expired-announcements-nightly',
--   '0 3 * * *', -- codziennie o 3:00 rano
--   $$SELECT cleanup_expired_announcements();$$
-- );

-- ----------------------------------------------------------------------------
-- 5. ODŚWIEŻENIE SCHEMATU W API SUPABASE (PostgREST)
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
