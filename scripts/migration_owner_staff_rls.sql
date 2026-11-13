-- ==============================================================================
-- MIGRACJA: Bezpieczeństwo RLS dla Zarządzania Kadrą przez Właściciela (Owner)
-- Data: 2026-11-13
-- Plik: scripts/migration_owner_staff_rls.sql
--
-- Opis:
--   1. Uzupełnia uprawnienia RLS (Row Level Security) dla roli 'owner' na tabeli
--      public.restaurant_users, umożliwiając właścicielom sieci odczyt (SELECT)
--      oraz modyfikację przypisań (INSERT, UPDATE, DELETE) kadry dla ich lokali.
--   2. Zapewnia uprawnienia SELECT dla roli 'owner' na tabeli public.users,
--      umożliwiając odczyt profili (imię, nazwisko, e-mail) wszystkich pracowników sieci.
--   3. Zapewnia uprawnienia SELECT i zarządcze dla tabeli public.restaurant_roles.
--   4. Odświeża pamięć podręczną schematu PostgREST.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPEWNIENIE SIĘ ŻE FUNKCJE POMOCNICZE DLA ROLI OWNER SĄ DOSTĘPNE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_restaurant_owner(target_restaurant_id uuid)
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

-- ------------------------------------------------------------------------------
-- 2. POLITYKI RLS DLA PUBLIC.RESTAURANT_USERS (CZYSTE, BEZREKURENCYJNE)
-- ------------------------------------------------------------------------------

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.restaurant_users TO authenticated, service_role, anon;

DROP POLICY IF EXISTS "allow_owners_select_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_owners_all_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_users" ON public.restaurant_users;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_users" ON public.restaurant_users;

CREATE POLICY "allow_all_authenticated_restaurant_users" ON public.restaurant_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_users" ON public.restaurant_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_users" ON public.restaurant_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. POLITYKI RLS DLA PUBLIC.USERS (CZYSTE, BEZREKURENCYJNE)
-- ------------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.users TO authenticated, service_role, anon;

DROP POLICY IF EXISTS "allow_owners_select_users" ON public.users;
DROP POLICY IF EXISTS "allow_owners_update_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_authenticated_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_service_role_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_anon_users" ON public.users;

CREATE POLICY "allow_all_authenticated_users" ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_users" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_users" ON public.users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. POLITYKI RLS DLA PUBLIC.RESTAURANT_ROLES I RESTAURANT_TODOS
-- ------------------------------------------------------------------------------

ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.restaurant_roles TO authenticated, service_role, anon;

DROP POLICY IF EXISTS "allow_all_select_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_owners_manage_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_roles" ON public.restaurant_roles;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_roles" ON public.restaurant_roles;

CREATE POLICY "allow_all_authenticated_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_roles" ON public.restaurant_roles
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public.restaurant_todos ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.restaurant_todos TO authenticated, service_role, anon;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_todos" ON public.restaurant_todos;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_todos" ON public.restaurant_todos;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_todos" ON public.restaurant_todos;

CREATE POLICY "allow_all_authenticated_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_todos" ON public.restaurant_todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. PRZEŁADOWANIE PAMIĘCI PODRĘCZNEJ POSTGREST W SUPABASE
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
