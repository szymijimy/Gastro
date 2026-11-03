-- ==============================================================================
-- NAPRAWA TOŻSAMOŚCI W SUPABASE AUTH DLA PRACOWNIKÓW TESTOWYCH
-- ==============================================================================

-- 1. Uzupełnienie potwierdzenia emaila i metadanych w auth.users
-- (Uwaga: confirmed_at jest kolumną generowaną, więc aktualizujemy wyłącznie email_confirmed_at)
UPDATE auth.users
SET 
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  is_anonymous = false,
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data = jsonb_build_object(
    'full_name', 
    CASE email
      WHEN 'ps@t.pl' THEN 'Paulina S.'
      WHEN 'mp@t.pl' THEN 'Monika P.'
      WHEN 'pd@t.pl' THEN 'Paweł D.'
      WHEN 'sw@t.pl' THEN 'Szymon W.'
      WHEN 'pn@t.pl' THEN 'Patrycja N.'
      WHEN 'mo@t.pl' THEN 'Magda O.'
      ELSE coalesce(raw_user_meta_data->>'full_name', 'Pracownik')
    END
  )
WHERE email IN ('ps@t.pl', 'mp@t.pl', 'pd@t.pl', 'sw@t.pl', 'pn@t.pl', 'mo@t.pl');


-- 2. Wstawienie brakujących rekordów do auth.identities
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  id::text,
  id,
  jsonb_build_object(
    'sub', id::text, 
    'email', email, 
    'full_name', raw_user_meta_data->>'full_name'
  ),
  'email',
  now(),
  now(),
  now()
FROM auth.users
WHERE email IN ('pd@t.pl', 'sw@t.pl', 'pn@t.pl', 'mo@t.pl', 'ps@t.pl', 'mp@t.pl')
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = auth.users.id
  );
