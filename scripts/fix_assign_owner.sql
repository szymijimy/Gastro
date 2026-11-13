-- ==============================================================================
-- NAPRAWA PRZYPISANIA WŁAŚCICIELA I KONT KSeF DLA GASTRO APP
-- Uruchom ten skrypt w Supabase SQL Editor (zielony przycisk RUN).
-- ==============================================================================

-- 1. USUNIĘCIE STARYCH OGRANICZEŃ CHECK, KTÓRE BLOKOWAŁY DODAWANIE RÓL
ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS check_restaurant_users_role;
ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;

-- 2. UPEWNIENIE SIĘ, ŻE ISTNIEJĄ LOKALE W BAZIE (JEŚLI BAZA BYŁA PUSTA)
INSERT INTO public.restaurants (id, name, color)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Wielokran', '#8b5cf6'),
  ('22222222-2222-2222-2222-222222222222', 'Tankownia', '#f97316')
ON CONFLICT (id) DO NOTHING;

-- 3. PROFIL W PUBLIC.USERS DLA KONTA kd@t.pl (I INNYCH WŁAŚCICIELI)
INSERT INTO public.users (id, email, full_name, default_hourly_rate, is_active)
SELECT 
  id, 
  email, 
  coalesce(raw_user_meta_data->>'full_name', 'Właściciel Sieci'), 
  0, 
  true
FROM auth.users
WHERE lower(email) IN ('kd@t.pl', 'owner@gastro.pl')
ON CONFLICT (id) DO UPDATE SET 
  is_active = true,
  full_name = EXCLUDED.full_name;

-- 4. PRZYPISANIE KONTA kd@t.pl (I owner@gastro.pl) JAKO 'owner' DO WSZYSTKICH LOKALI
INSERT INTO public.restaurant_users (restaurant_id, user_id, role, hourly_rate)
SELECT 
  r.id, 
  u.id, 
  'owner', 
  0
FROM public.restaurants r
CROSS JOIN auth.users u
WHERE lower(u.email) IN ('kd@t.pl', 'owner@gastro.pl')
ON CONFLICT (restaurant_id, user_id) DO UPDATE SET 
  role = 'owner';

-- 5. UPEWNIENIE SIĘ, ŻE KONFIGURACJA KSeF ISTNIEJE DLA KAŻDEGO LOKALU
INSERT INTO public.restaurant_ksef_config (restaurant_id, nip, ksef_token, environment, is_active, last_sync_at)
SELECT 
  r.id,
  CASE 
    WHEN r.name ILIKE '%tankownia%' THEN '5252898765' 
    ELSE '5252812345' 
  END,
  'ksef-demo-token-sandbox-2026',
  'test',
  true,
  now()
FROM public.restaurants r
ON CONFLICT (restaurant_id) DO UPDATE SET
  is_active = true,
  environment = 'test';

-- 6. AKTUALIZACJA FUNKCJI RPC add_staff_member (ABY MANAGER MÓGŁ DODAWAĆ KAŻDĄ ROLĘ)
CREATE OR REPLACE FUNCTION public.add_staff_member(
  p_restaurant_id uuid,
  p_email text,
  p_role text,
  p_hourly_rate numeric DEFAULT 0,
  p_full_name text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RETURN 'Użytkownik o podanym adresie e-mail (' || p_email || ') nie został jeszcze zarejestrowany w aplikacji. Poproś go o założenie konta.';
  END IF;

  INSERT INTO public.users (id, email, full_name, default_hourly_rate, is_active)
  VALUES (
    v_user_id,
    lower(trim(p_email)),
    coalesce(nullif(trim(p_full_name), ''), 'Pracownik'),
    coalesce(p_hourly_rate, 0),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE WHEN trim(p_full_name) <> '' THEN trim(p_full_name) ELSE public.users.full_name END,
    is_active = true;

  INSERT INTO public.restaurant_users (restaurant_id, user_id, role, hourly_rate)
  VALUES (p_restaurant_id, v_user_id, trim(p_role), coalesce(p_hourly_rate, 0))
  ON CONFLICT (restaurant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    hourly_rate = EXCLUDED.hourly_rate;

  RETURN 'OK';
END;
$$;

-- 7. ODŚWIEŻENIE PAMIĘCI PODRĘCZNEJ POSTGREST W SUPABASE
NOTIFY pgrst, 'reload schema';
