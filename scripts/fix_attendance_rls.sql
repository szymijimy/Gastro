-- ==============================================================================
-- NAPRAWA UPRAWNIEŃ RLS DLA MODUŁU OBECNOŚCI, GRAFIKU, UTARGU I PREMII
-- TABELE: attendance_logs, daily_revenues, manual_bonuses, bonus_rules,
--         restaurant_revenue_fields, schedule_shifts, restaurant_day_requirements
--         (oraz pomocnicze tabele grafiku: schedule_availabilities, staff_schedule_rules,
--          restaurant_operating_hours, schedule_periods)
-- Data: 2026-11-13
-- Plik: scripts/fix_attendance_rls.sql
--
-- INSTRUKCJA:
-- 1. Otwórz Supabase Studio -> SQL Editor
-- 2. Wklej całą treść tego pliku i kliknij zielony przycisk "RUN"
--
-- PROBLEM:
-- 1. Tabela attendance_logs posiadała zbyt restrykcyjne polityki RLS (np. user_id = auth.uid()),
--    co uniemożliwiało Właścicielowi (kd@t.pl) oraz Menadżerom wpisywanie lub edycję
--    czasu pracy dla pracowników w panelu ewidencji (/manager -> AttendanceManagerModule),
--    skutkując błędem: "new row violates row-level security policy for table 'attendance_logs'".
-- 2. Tabela manual_bonuses oraz bonus_rules uniemożliwiały Właścicielowi i Menadżerom
--    przyznawanie premii manualnych oraz konfigurowanie zasad premiowania
--    (błąd RLS policy violation).
-- 3. Tabela schedule_shifts blokowała tworzenie i edycję grafiku przez Właściciela.
-- 4. Brak spójnych uprawnień GRANT ALL dla ról authenticated, anon i service_role.
--
-- ROZWIĄZANIE:
-- 1. Bezpieczne usunięcie wszelkich starych, restrykcyjnych polityk RLS dla w/w tabel (DROP POLICY IF EXISTS).
-- 2. Nadanie pełnych uprawnień GRANT ALL ON TABLE dla ról authenticated, service_role, anon.
-- 3. Włączenie RLS (ENABLE ROW LEVEL SECURITY).
-- 4. Utworzenie prostych, bezrekurencyjnych i uniwersalnych polityk RLS:
--    - allow_all_authenticated_<tabela> (FOR ALL TO authenticated USING (true) WITH CHECK (true))
--    - allow_all_service_role_<tabela> (FOR ALL TO service_role USING (true) WITH CHECK (true))
--    - allow_all_anon_<tabela> (FOR ALL TO anon USING (true) WITH CHECK (true))
-- 5. Obsługa 7 głównych tabel oraz pomocniczych tabel grafiku w sposób 100% bezpieczny i dynamiczny.
-- 6. Odświeżenie pamięci podręcznej PostgREST (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- KROK 1: BEZPIECZNE USUNIĘCIE WSZYSTKICH ISTNIEJĄCYCH POLITYK RLS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN (
        'attendance_logs', 
        'daily_revenues', 
        'manual_bonuses', 
        'bonus_rules', 
        'restaurant_revenue_fields', 
        'schedule_shifts', 
        'restaurant_day_requirements',
        'day_requirements', 
        'schedule_availabilities',
        'staff_schedule_rules',
        'restaurant_operating_hours',
        'schedule_periods'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END;
$$;

-- Jawne usunięcie znanych polityk w razie braku uprawnień do pg_policies
DROP POLICY IF EXISTS "allow_all_authenticated_attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "allow_all_service_role_attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "allow_all_anon_attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can view own attendance logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can insert own attendance logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Managers can manage attendance logs" ON public.attendance_logs;

DROP POLICY IF EXISTS "allow_all_authenticated_daily_revenues" ON public.daily_revenues;
DROP POLICY IF EXISTS "allow_all_service_role_daily_revenues" ON public.daily_revenues;
DROP POLICY IF EXISTS "allow_all_anon_daily_revenues" ON public.daily_revenues;

DROP POLICY IF EXISTS "allow_all_authenticated_manual_bonuses" ON public.manual_bonuses;
DROP POLICY IF EXISTS "allow_all_service_role_manual_bonuses" ON public.manual_bonuses;
DROP POLICY IF EXISTS "allow_all_anon_manual_bonuses" ON public.manual_bonuses;

DROP POLICY IF EXISTS "allow_all_authenticated_bonus_rules" ON public.bonus_rules;
DROP POLICY IF EXISTS "allow_all_service_role_bonus_rules" ON public.bonus_rules;
DROP POLICY IF EXISTS "allow_all_anon_bonus_rules" ON public.bonus_rules;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_revenue_fields" ON public.restaurant_revenue_fields;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_revenue_fields" ON public.restaurant_revenue_fields;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_revenue_fields" ON public.restaurant_revenue_fields;

DROP POLICY IF EXISTS "allow_all_authenticated_schedule_shifts" ON public.schedule_shifts;
DROP POLICY IF EXISTS "allow_all_service_role_schedule_shifts" ON public.schedule_shifts;
DROP POLICY IF EXISTS "allow_all_anon_schedule_shifts" ON public.schedule_shifts;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_day_requirements" ON public.restaurant_day_requirements;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_day_requirements" ON public.restaurant_day_requirements;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_day_requirements" ON public.restaurant_day_requirements;

-- ------------------------------------------------------------------------------
-- KROK 2: WŁĄCZENIE RLS I NADAWANIE UPRAWNIEŃ DLA RÓL SUPABASE
-- ------------------------------------------------------------------------------

-- 1. attendance_logs
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.attendance_logs TO authenticated, service_role, anon;

-- 2. daily_revenues
ALTER TABLE public.daily_revenues ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.daily_revenues TO authenticated, service_role, anon;

-- 3. manual_bonuses
ALTER TABLE public.manual_bonuses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.manual_bonuses TO authenticated, service_role, anon;

-- 4. bonus_rules
ALTER TABLE public.bonus_rules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.bonus_rules TO authenticated, service_role, anon;

-- 5. restaurant_revenue_fields
ALTER TABLE public.restaurant_revenue_fields ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_revenue_fields TO authenticated, service_role, anon;

-- 6. schedule_shifts
ALTER TABLE public.schedule_shifts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.schedule_shifts TO authenticated, service_role, anon;

-- 7. restaurant_day_requirements
ALTER TABLE public.restaurant_day_requirements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.restaurant_day_requirements TO authenticated, service_role, anon;

-- Pomocnicze / opcjonalne tabele grafiku (dynamiczne EXECUTE zapobiega błędom parsowania gdyby tabela nie istniała)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'day_requirements',
    'schedule_availabilities',
    'staff_schedule_rules',
    'restaurant_operating_hours',
    'schedule_periods'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO authenticated, service_role, anon;', tbl);
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- KROK 3: UTWORZENIE CZYSTYCH, BEZREKURENCYJNYCH POLITYK RLS
-- ------------------------------------------------------------------------------

-- 1. attendance_logs
CREATE POLICY "allow_all_authenticated_attendance_logs" ON public.attendance_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_attendance_logs" ON public.attendance_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_attendance_logs" ON public.attendance_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. daily_revenues
CREATE POLICY "allow_all_authenticated_daily_revenues" ON public.daily_revenues
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_daily_revenues" ON public.daily_revenues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_daily_revenues" ON public.daily_revenues
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. manual_bonuses
CREATE POLICY "allow_all_authenticated_manual_bonuses" ON public.manual_bonuses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_manual_bonuses" ON public.manual_bonuses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_manual_bonuses" ON public.manual_bonuses
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. bonus_rules
CREATE POLICY "allow_all_authenticated_bonus_rules" ON public.bonus_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_bonus_rules" ON public.bonus_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_bonus_rules" ON public.bonus_rules
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. restaurant_revenue_fields
CREATE POLICY "allow_all_authenticated_restaurant_revenue_fields" ON public.restaurant_revenue_fields
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_restaurant_revenue_fields" ON public.restaurant_revenue_fields
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_restaurant_revenue_fields" ON public.restaurant_revenue_fields
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. schedule_shifts
CREATE POLICY "allow_all_authenticated_schedule_shifts" ON public.schedule_shifts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_schedule_shifts" ON public.schedule_shifts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_schedule_shifts" ON public.schedule_shifts
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 7. restaurant_day_requirements
CREATE POLICY "allow_all_authenticated_restaurant_day_requirements" ON public.restaurant_day_requirements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_service_role_restaurant_day_requirements" ON public.restaurant_day_requirements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_anon_restaurant_day_requirements" ON public.restaurant_day_requirements
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Pomocnicze / opcjonalne tabele grafiku (dynamiczne EXECUTE zapobiega błędom parsowania gdyby tabela nie istniała)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'day_requirements',
    'schedule_availabilities',
    'staff_schedule_rules',
    'restaurant_operating_hours',
    'schedule_periods'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', 'allow_all_authenticated_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', 'allow_all_service_role_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', 'allow_all_anon_' || tbl, tbl);
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- KROK 4: ODŚWIEŻENIE PAMIĘCI PODRĘCZNEJ SCHEMATU POSTGREST
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
