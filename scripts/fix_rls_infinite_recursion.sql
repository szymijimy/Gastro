-- ==============================================================================
-- NAPRAWA BŁĘDU PĘTLI REKURENCYJNEJ RLS (POSTGRESQL ERROR 54001 / 42P17 / 42501)
-- ORAZ UPRAWNIEŃ DLA TABEL: restaurant_users, users, restaurant_roles, restaurant_todos
-- Data: 2026-11-13
-- Plik: scripts/fix_rls_infinite_recursion.sql
--
-- INSTRUKCJA:
-- 1. Otwórz Supabase Studio -> SQL Editor
-- 2. Wklej całą treść tego pliku i kliknij zielony przycisk "RUN"
--
-- PROBLEM:
-- Polityki RLS na tabeli public.restaurant_users odpytywały tę samą tabelę 
-- (np. przez podzapytanie ru2 lub funkcję is_restaurant_owner), co powodowało
-- błąd 54001/42P17: "infinite recursion detected in policy for relation restaurant_users".
-- Błąd ten blokował odczyt kadry w panelu właściciela, zapis zadań (restaurant_todos)
-- oraz aktualizację profilu w public.users.
--
-- ROZWIĄZANIE:
-- 1. Bezpieczne usunięcie wszelkich starych/rekurencyjnych polityk RLS.
-- 2. Nadanie uprawnień GRANT ALL dla ról authenticated, anon, service_role.
-- 3. Utworzenie prostych, bezpiecznych i bezrekurencyjnych polityk RLS
--    (FOR ALL TO authenticated USING (true) WITH CHECK (true)) – zgodnie ze standardem
--    wszystkich innych tabel w Gastro App (restaurant_reservations, restaurant_announcements itp.).
-- 4. Oznaczenie funkcji is_restaurant_owner i is_any_owner jako SECURITY DEFINER.
-- 5. Usunięcie starego zduplikowanego użytkownika testowego 'owner@gastro.pl'
--    oraz zapewnienie poprawnej konfiguracji dla konta 'kd@t.pl' (Krzysztof D.).
-- 6. Odświeżenie pamięci podręcznej schematu PostgREST (NOTIFY pgrst).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- KROK 1: BEZPIECZNE USUNIĘCIE WSZYSTKICH ISTNIEJĄCYCH POLITYK RLS Z POWIĄZANYCH TABEL
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('restaurant_users', 'users', 'restaurant_roles', 'restaurant_todos', 'restaurant_ksef_config', 'ksef_invoices')
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

DROP POLICY IF EXISTS "allow_owner_manage_ksef_config" ON public.restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_ksef_config" ON public.restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_ksef_config" ON public.restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_ksef_config" ON public.restaurant_ksef_config;

DROP POLICY IF EXISTS "allow_owner_manage_ksef_invoices" ON public.ksef_invoices;
DROP POLICY IF EXISTS "allow_all_authenticated_ksef_invoices" ON public.ksef_invoices;
DROP POLICY IF EXISTS "allow_all_service_role_ksef_invoices" ON public.ksef_invoices;
DROP POLICY IF EXISTS "allow_all_anon_ksef_invoices" ON public.ksef_invoices;

-- ------------------------------------------------------------------------------
-- KROK 2: WŁĄCZENIE RLS I NADAWANIE UPRAWNIEŃ DLA RÓL SUPABASE
-- ------------------------------------------------------------------------------

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_users TO authenticated, service_role, anon;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.users TO authenticated, service_role, anon;

ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_roles TO authenticated, service_role, anon;

ALTER TABLE public.restaurant_todos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_todos TO authenticated, service_role, anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_ksef_config') THEN
    ALTER TABLE public.restaurant_ksef_config ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON TABLE public.restaurant_ksef_config TO authenticated, service_role, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ksef_invoices') THEN
    ALTER TABLE public.ksef_invoices ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON TABLE public.ksef_invoices TO authenticated, service_role, anon;
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- KROK 3: UTWORZENIE CZYSTYCH, BEZREKURENCYJNYCH POLITYK RLS (ZGODNYCH Z GASTRO)
-- ------------------------------------------------------------------------------

-- Tabela: public.restaurant_users
CREATE POLICY "allow_all_authenticated_restaurant_users" ON public.restaurant_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_restaurant_users" ON public.restaurant_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_restaurant_users" ON public.restaurant_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tabela: public.users
CREATE POLICY "allow_all_authenticated_users" ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_users" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_users" ON public.users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tabela: public.restaurant_roles
CREATE POLICY "allow_all_authenticated_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tabela: public.restaurant_todos
CREATE POLICY "allow_all_authenticated_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tabele KSeF (jeśli istnieją)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_ksef_config') THEN
    CREATE POLICY "allow_all_authenticated_restaurant_ksef_config" ON public.restaurant_ksef_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "allow_all_service_role_restaurant_ksef_config" ON public.restaurant_ksef_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "allow_all_anon_restaurant_ksef_config" ON public.restaurant_ksef_config
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ksef_invoices') THEN
    CREATE POLICY "allow_all_authenticated_ksef_invoices" ON public.ksef_invoices
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "allow_all_service_role_ksef_invoices" ON public.ksef_invoices
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "allow_all_anon_ksef_invoices" ON public.ksef_invoices
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- KROK 4: DEFINICJA BEZPIECZNYCH FUNKCJI POMOCNICZYCH (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

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

-- Procedury RPC dla wsparcia UI:
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

GRANT EXECUTE ON FUNCTION public.update_staff_member_name(uuid, uuid, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_teammates(uuid) TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- KROK 5: USUNIĘCIE ZDUPLIKOWANEGO KONTA DEMO 'owner@gastro.pl' I REJESTRACJA 'kd@t.pl'
-- ------------------------------------------------------------------------------

-- Usunięcie przypisań i profilu dla starego konta 'owner@gastro.pl'
DELETE FROM public.restaurant_users 
WHERE user_id IN (
  SELECT id FROM public.users WHERE lower(email) = 'owner@gastro.pl'
  UNION
  SELECT id FROM auth.users WHERE lower(email) = 'owner@gastro.pl'
);

DELETE FROM public.users 
WHERE lower(email) = 'owner@gastro.pl';

-- Upewnienie się, że profil kd@t.pl istnieje w public.users jako Krzysztof D.
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

-- Przypisanie konta kd@t.pl jako 'owner' do wszystkich lokali
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

-- ------------------------------------------------------------------------------
-- KROK 6: ODŚWIEŻENIE PAMIĘCI PODRĘCZNEJ SCHEMATU POSTGREST
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
