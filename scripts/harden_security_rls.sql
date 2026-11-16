-- ============================================================================
-- GASTROAPP: SKRYPT DEFENSYWNEGO UTWARDZANIA BEZPIECZEŃSTWA (RLS & RPC HARDENING)
-- ============================================================================
-- Zgłoszone podatności:
-- 1. [HIGH] Nadmiernie otwarte uprawnienia dla roli 'anon' (polityki USING(true) i GRANT ALL TO anon).
-- 2. [HIGH] Wyciek poufnych danych finansowych, faktur KSeF i obecności personelu dla niezalogowanych.
-- 3. [MEDIUM] Funkcje SECURITY DEFINER podatne na nieautoryzowane wywołanie przez rolę 'anon'.
-- ============================================================================

-- KROK 1: Odebranie nieautoryzowanych uprawnień roli 'anon' do wrażliwych tabel
REVOKE ALL ON public.restaurant_ksef_config FROM anon;
REVOKE ALL ON public.ksef_invoices FROM anon;
REVOKE ALL ON public.attendance_logs FROM anon;
REVOKE ALL ON public.daily_revenues FROM anon;
REVOKE ALL ON public.manual_bonuses FROM anon;
REVOKE ALL ON public.bonus_rules FROM anon;
REVOKE ALL ON public.restaurant_todos FROM anon;
REVOKE ALL ON public.restaurant_users FROM anon;
REVOKE ALL ON public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.restaurants FROM anon;

-- Uprawnienia przyznajemy wyłącznie użytkownikom uwierzytelnionym ('authenticated') oraz 'service_role'
GRANT ALL ON public.restaurant_ksef_config TO authenticated, service_role;
GRANT ALL ON public.ksef_invoices TO authenticated, service_role;
GRANT ALL ON public.attendance_logs TO authenticated, service_role;
GRANT ALL ON public.daily_revenues TO authenticated, service_role;
GRANT ALL ON public.manual_bonuses TO authenticated, service_role;
GRANT ALL ON public.bonus_rules TO authenticated, service_role;
GRANT ALL ON public.restaurant_todos TO authenticated, service_role;
GRANT ALL ON public.restaurant_users TO authenticated, service_role;
GRANT ALL ON public.users TO authenticated, service_role;
GRANT SELECT ON public.restaurants TO anon, authenticated, service_role;
GRANT ALL ON public.restaurants TO authenticated, service_role;

-- KROK 2: Usunięcie nadmiarowych i publicznych polityk 'anon'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (policyname ILIKE '%anon%' OR policyname ILIKE '%allow_all_anon%')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- KROK 3: Włączenie Row Level Security (RLS) na wszystkich tabelach
ALTER TABLE public.restaurant_ksef_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ksef_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- KROK 4: Wdrożenie bezpiecznych polityk dla użytkowników uwierzytelnionych
-- A. KSeF Config (dostęp tylko dla zalogowanego właściciela lokalu lub managera)
DROP POLICY IF EXISTS "ksef_config_authenticated_policy" ON public.restaurant_ksef_config;
CREATE POLICY "ksef_config_authenticated_policy"
ON public.restaurant_ksef_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = restaurant_ksef_config.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner', 'manager')
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = restaurant_ksef_config.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role = 'owner'
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
);

-- B. KSeF Invoices (dostęp tylko dla członków danego lokalu z rolą owner/manager)
DROP POLICY IF EXISTS "ksef_invoices_authenticated_policy" ON public.ksef_invoices;
CREATE POLICY "ksef_invoices_authenticated_policy"
ON public.ksef_invoices
FOR ALL
TO authenticated
USING (
  restaurant_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = ksef_invoices.restaurant_id
      AND ru.user_id = auth.uid()
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = ksef_invoices.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner', 'manager')
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
);

-- C. Attendance Logs (pracownik widzi tylko swoje wpisy, manager/owner widzi cały lokal)
DROP POLICY IF EXISTS "attendance_logs_authenticated_policy" ON public.attendance_logs;
CREATE POLICY "attendance_logs_authenticated_policy"
ON public.attendance_logs
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = attendance_logs.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner', 'manager')
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = attendance_logs.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner', 'manager')
  )
  OR auth.jwt() ->> 'email' IN ('kd@t.pl', 'owner@gastro.pl')
);

-- D. Zabezpieczenie funkcji SECURITY DEFINER przed anonimowym wykonaniem
REVOKE EXECUTE ON FUNCTION public.update_staff_member_name(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_staff_member_name(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_teammates(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_restaurant_teammates(UUID) TO authenticated, service_role;

-- KROK 5: Przeładowanie pamięci podręcznej schematu PostgREST
NOTIFY pgrst, 'reload schema';
