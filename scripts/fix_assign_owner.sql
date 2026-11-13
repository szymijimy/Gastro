-- ==============================================================================
-- NAPRAWA PRZYPISANIA WŁAŚCICIELA, KONT KSeF ORAZ BEZPIECZEŃSTWA RLS
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

-- 3. USUNIĘCIE STARYCH ZDUPLIKOWANYCH UŻYTKOWNIKÓW DEMO 'owner@gastro.pl'
DELETE FROM public.restaurant_users 
WHERE user_id IN (
  SELECT id FROM public.users WHERE lower(email) = 'owner@gastro.pl'
  UNION
  SELECT id FROM auth.users WHERE lower(email) = 'owner@gastro.pl'
);

DELETE FROM public.users 
WHERE lower(email) = 'owner@gastro.pl';

-- 4. PROFIL W PUBLIC.USERS DLA JEDYNEGO KONTA WŁAŚCICIELA kd@t.pl (Krzysztof D.)
INSERT INTO public.users (id, email, full_name, default_hourly_rate, is_active)
SELECT 
  id, 
  email, 
  coalesce(raw_user_meta_data->>'full_name', 'Krzysztof D.'), 
  0, 
  true
FROM auth.users
WHERE lower(email) = 'kd@t.pl'
ON CONFLICT (id) DO UPDATE SET 
  is_active = true,
  full_name = EXCLUDED.full_name;

-- 5. PRZYPISANIE KONTA kd@t.pl JAKO 'owner' DO WSZYSTKICH LOKALI
INSERT INTO public.restaurant_users (restaurant_id, user_id, role, hourly_rate)
SELECT 
  r.id, 
  u.id, 
  'owner', 
  0
FROM public.restaurants r
CROSS JOIN auth.users u
WHERE lower(u.email) = 'kd@t.pl'
ON CONFLICT (restaurant_id, user_id) DO UPDATE SET 
  role = 'owner';

-- 6. UPEWNIENIE SIĘ, ŻE KONFIGURACJA KSeF ISTNIEJE DLA KAŻDEGO LOKALU
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

-- 7. FUNKCJE RPC (SECURITY DEFINER)
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

CREATE OR REPLACE FUNCTION public.update_staff_member_name(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_full_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.users
  SET full_name = trim(p_full_name)
  WHERE id = p_user_id;

  RETURN 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_teammates(p_restaurant_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text,
  hourly_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ru.user_id,
    coalesce(u.email, 'pracownik@gastro.pl') as email,
    coalesce(u.full_name, 'Pracownik') as full_name,
    ru.role,
    coalesce(ru.hourly_rate, 0) as hourly_rate
  FROM public.restaurant_users ru
  LEFT JOIN public.users u ON u.id = ru.user_id
  WHERE ru.restaurant_id = p_restaurant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_staff_member(uuid, text, text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_staff_member_name(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_teammates(uuid) TO authenticated, service_role, anon;

-- 8. BEZPIECZNE FUNKCJE SPRAWDZAJĄCE UPRAWNIENIA WŁAŚCICIELA (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_restaurant_owner(target_restaurant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.restaurant_users
    WHERE user_id = auth.uid()
      AND LOWER(role) = 'owner'
      AND (restaurant_id = target_restaurant_id OR target_restaurant_id IS NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_any_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.restaurant_users
    WHERE user_id = auth.uid()
      AND LOWER(role) = 'owner'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_restaurant_owner(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_any_owner() TO authenticated, service_role, anon;

-- 9. CZYSZCZENIE I REKONFIGURACJA POLITYK RLS (ELIMINACJA BŁĘDU 54001 / INFINITE RECURSION)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('restaurant_users', 'users', 'restaurant_roles', 'restaurant_todos')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END;
$$;

-- Jawne usunięcie znanych polityk w razie braku uprawnień do pg_policies
DROP POLICY IF EXISTS "allow_owners_select_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_owners_all_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_users" ON public.restaurant_users;

DROP POLICY IF EXISTS "allow_owners_select_users" ON public.users;
DROP POLICY IF EXISTS "allow_owners_update_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_authenticated_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_service_role_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_anon_users" ON public.users;

DROP POLICY IF EXISTS "allow_all_select_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_owners_manage_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_roles" ON public.restaurant_roles;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_todos" ON public.restaurant_todos;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_todos" ON public.restaurant_todos;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_todos" ON public.restaurant_todos;

-- Uprawnienia i czyste polityki RLS (USING (true) WITH CHECK (true))
ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_users TO authenticated, service_role, anon;

CREATE POLICY "allow_all_authenticated_restaurant_users" ON public.restaurant_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_users" ON public.restaurant_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_users" ON public.restaurant_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.users TO authenticated, service_role, anon;

CREATE POLICY "allow_all_authenticated_users" ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_users" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_users" ON public.users
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_roles TO authenticated, service_role, anon;

CREATE POLICY "allow_all_authenticated_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.restaurant_todos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_todos TO authenticated, service_role, anon;

CREATE POLICY "allow_all_authenticated_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 10. ODŚWIEŻENIE PAMIĘCI PODRĘCZNEJ POSTGREST W SUPABASE
NOTIFY pgrst, 'reload schema';
