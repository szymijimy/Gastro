-- ==============================================================================
-- NAPRAWA KONT PRACOWNIKÓW TESTOWYCH (GOTRUE NULL SCAN FIX + IDENTITIES)
-- ==============================================================================

-- 1. Zastąpienie wartości NULL pustymi stringami '' w auth.users
-- Silnik GoTrue (Supabase Auth) w języku Go rzuca błąd 500 (Database error querying schema),
-- gdy pola tekstowe (tokeny, phone) mają wartość NULL zamiast pustego ciągu ''.
UPDATE auth.users
SET 
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  phone = coalesce(phone, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  is_sso_user = coalesce(is_sso_user, false),
  is_anonymous = coalesce(is_anonymous, false),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
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


-- 2. Wstawienie brakujących tożsamości do auth.identities
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
  id,
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
