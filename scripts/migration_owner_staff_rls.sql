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
-- 2. POLITYKI RLS DLA PUBLIC.RESTAURANT_USERS
-- ------------------------------------------------------------------------------

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.restaurant_users TO authenticated;
GRANT ALL ON TABLE public.restaurant_users TO service_role;

-- A. SELECT: Właściciel widzi wszystkich pracowników w przypisanych lokalach sieci
DROP POLICY IF EXISTS "allow_owners_select_restaurant_users" ON public.restaurant_users;
CREATE POLICY "allow_owners_select_restaurant_users" ON public.restaurant_users
  FOR SELECT
  TO authenticated, service_role
  USING (
    public.is_restaurant_owner(restaurant_id)
    OR public.is_any_owner()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.restaurant_users ru2
      WHERE ru2.user_id = auth.uid()
        AND ru2.restaurant_id = restaurant_users.restaurant_id
        AND LOWER(ru2.role) IN ('manager', 'owner')
    )
  );

-- B. INSERT / UPDATE / DELETE: Właściciel ma uprawnienia zarządcze nad personelem
DROP POLICY IF EXISTS "allow_owners_all_restaurant_users" ON public.restaurant_users;
CREATE POLICY "allow_owners_all_restaurant_users" ON public.restaurant_users
  FOR ALL
  TO authenticated, service_role
  USING (
    public.is_restaurant_owner(restaurant_id)
    OR public.is_any_owner()
  )
  WITH CHECK (
    public.is_restaurant_owner(restaurant_id)
    OR public.is_any_owner()
  );

-- ------------------------------------------------------------------------------
-- 3. POLITYKI RLS DLA PUBLIC.USERS
-- ------------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

-- A. SELECT: Właściciel widzi profile wszystkich pracowników należących do lokali sieci
DROP POLICY IF EXISTS "allow_owners_select_users" ON public.users;
CREATE POLICY "allow_owners_select_users" ON public.users
  FOR SELECT
  TO authenticated, service_role
  USING (
    public.is_any_owner()
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.user_id = public.users.id
        AND (public.is_restaurant_owner(ru.restaurant_id) OR public.is_any_owner())
    )
  );

-- B. UPDATE: Właściciel może aktualizować dane profilowe (np. stawki bazowe)
DROP POLICY IF EXISTS "allow_owners_update_users" ON public.users;
CREATE POLICY "allow_owners_update_users" ON public.users
  FOR UPDATE
  TO authenticated, service_role
  USING (
    public.is_any_owner() OR id = auth.uid()
  )
  WITH CHECK (
    public.is_any_owner() OR id = auth.uid()
  );

-- ------------------------------------------------------------------------------
-- 4. POLITYKI RLS DLA PUBLIC.RESTAURANT_ROLES
-- ------------------------------------------------------------------------------

ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.restaurant_roles TO authenticated;
GRANT ALL ON TABLE public.restaurant_roles TO service_role;

DROP POLICY IF EXISTS "allow_all_select_restaurant_roles" ON public.restaurant_roles;
CREATE POLICY "allow_all_select_restaurant_roles" ON public.restaurant_roles
  FOR SELECT
  TO authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "allow_owners_manage_restaurant_roles" ON public.restaurant_roles;
CREATE POLICY "allow_owners_manage_restaurant_roles" ON public.restaurant_roles
  FOR ALL
  TO authenticated, service_role
  USING (
    public.is_restaurant_owner(restaurant_id) OR public.is_any_owner()
  )
  WITH CHECK (
    public.is_restaurant_owner(restaurant_id) OR public.is_any_owner()
  );

-- ------------------------------------------------------------------------------
-- 5. PRZEŁADOWANIE PAMIĘCI PODRĘCZNEJ POSTGREST W SUPABASE
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
