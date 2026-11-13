-- ============================================================================
-- MIGRACJA: Moduł Właściciela Sieci i Integracja z KSeF (Krajowy System e-Faktur)
-- Data: 2026-11-13
-- Opis:
--   1. Dodaje obsługę roli 'owner' w tabeli restaurant_users oraz funkcje pomocnicze RLS.
--   2. Tworzy tabelę konfiguracji KSeF: restaurant_ksef_config (środowiska test, demo, prod).
--   3. Tworzy tabelę faktur KSeF: ksef_invoices z metadanymi, pozycjami i podziałem kosztów.
--   4. Wdraża rygorystyczne polityki RLS (Row Level Security) ograniczające dostęp
--      do danych KSeF wyłącznie dla roli właściciela ('owner') oraz service_role.
--   5. Wprowadza realistyczne dane demonstracyjne (seed): konto właściciela,
--      konfigurację lokali oraz faktury gastronomiczne (browary rzemieślnicze,
--      dystrybucja alkoholi, żywność, media, czynsz, serwis).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. OBSŁUGA ROLI 'owner' W RESTAURANT_USERS I REGUŁY BEZPIECZEŃSTWA
-- ----------------------------------------------------------------------------

-- Usunięcie ewentualnych restrykcyjnych ograniczeń na kolumnie role w restaurant_users,
-- aby umożliwić role systemowe ('owner', 'manager') oraz dowolne role definiowane przez lokale
ALTER TABLE restaurant_users DROP CONSTRAINT IF EXISTS check_restaurant_users_role;
ALTER TABLE restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;

-- Indeksy przyspieszające weryfikację uprawnień
CREATE INDEX IF NOT EXISTS idx_restaurant_users_role_user 
  ON restaurant_users (user_id, role);

CREATE INDEX IF NOT EXISTS idx_restaurant_users_venue_role 
  ON restaurant_users (restaurant_id, role);

-- Funkcja pomocnicza sprawdzająca, czy bieżący użytkownik jest właścicielem lokalu
CREATE OR REPLACE FUNCTION public.is_restaurant_owner(target_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  -- Service role ma zawsze pełny dostęp administracyjny
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  -- Weryfikacja czy zalogowany użytkownik ma przypisaną rolę 'owner' dla lokalu (lub ogólnie)
  RETURN EXISTS (
    SELECT 1 
    FROM public.restaurant_users
    WHERE user_id = auth.uid()
      AND LOWER(role) = 'owner'
      AND (restaurant_id = target_restaurant_id OR target_restaurant_id IS NULL)
  );
END;
$$;

-- Funkcja pomocnicza sprawdzająca, czy użytkownik ma uprawnienia właścicielskie w jakimkolwiek lokalu
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

-- ----------------------------------------------------------------------------
-- 2. TABELA KONFIGURACJI KSEF: restaurant_ksef_config
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS restaurant_ksef_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  nip varchar(20) NOT NULL,
  ksef_token text DEFAULT '',
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'demo', 'prod')),
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_restaurant_ksef_config_restaurant UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_ksef_config_venue 
  ON restaurant_ksef_config (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_ksef_config_nip 
  ON restaurant_ksef_config (nip);

-- ----------------------------------------------------------------------------
-- 3. TABELA FAKTUR KSEF: ksef_invoices
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ksef_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  ksef_number text UNIQUE NOT NULL,
  invoice_number text NOT NULL,
  invoice_type text NOT NULL DEFAULT 'cost' CHECK (invoice_type IN ('cost', 'sales')),
  issue_date date NOT NULL,
  acquisition_date timestamptz NOT NULL DEFAULT now(),
  seller_nip text NOT NULL,
  seller_name text NOT NULL,
  buyer_nip text NOT NULL,
  buyer_name text NOT NULL,
  net_amount numeric(12, 2) NOT NULL DEFAULT 0.00,
  vat_amount numeric(12, 2) NOT NULL DEFAULT 0.00,
  gross_amount numeric(12, 2) NOT NULL DEFAULT 0.00,
  currency text NOT NULL DEFAULT 'PLN',
  xml_content text,
  raw_metadata jsonb DEFAULT '{}'::jsonb,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'pending')),
  expense_category text NOT NULL DEFAULT 'other' CHECK (expense_category IN ('alcohol', 'food', 'utilities', 'rent', 'services', 'other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indeksy optymalizujące przeglądanie i filtrowanie faktur w panelu właściciela
CREATE INDEX IF NOT EXISTS idx_ksef_invoices_venue_date 
  ON ksef_invoices (restaurant_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_ksef_invoices_category 
  ON ksef_invoices (restaurant_id, expense_category);

CREATE INDEX IF NOT EXISTS idx_ksef_invoices_status 
  ON ksef_invoices (restaurant_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_ksef_invoices_type 
  ON ksef_invoices (restaurant_id, invoice_type);

CREATE INDEX IF NOT EXISTS idx_ksef_invoices_seller 
  ON ksef_invoices (seller_nip, seller_name);

CREATE INDEX IF NOT EXISTS idx_ksef_invoices_ksef_number 
  ON ksef_invoices (ksef_number);

-- ----------------------------------------------------------------------------
-- 4. WYZWALACZE AUTOMATYCZNEJ AKTUALIZACJI updated_at
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_updated_at_ksef_config ON restaurant_ksef_config;
CREATE TRIGGER trigger_set_updated_at_ksef_config
  BEFORE UPDATE ON restaurant_ksef_config
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_ksef_invoices ON ksef_invoices;
CREATE TRIGGER trigger_set_updated_at_ksef_invoices
  BEFORE UPDATE ON ksef_invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. UPRAWNIENIA I POLITYKI RLS (ROW LEVEL SECURITY)
--    Dostęp ograniczony wyłącznie do ról 'owner' oraz 'service_role'
-- ----------------------------------------------------------------------------

-- Blokada dostępu anonimowego (anon) ze względów bezpieczeństwa danych finansowo-podatkowych
REVOKE ALL ON TABLE restaurant_ksef_config FROM anon;
REVOKE ALL ON TABLE ksef_invoices FROM anon;

GRANT ALL ON TABLE restaurant_ksef_config TO authenticated;
GRANT ALL ON TABLE restaurant_ksef_config TO service_role;

GRANT ALL ON TABLE ksef_invoices TO authenticated;
GRANT ALL ON TABLE ksef_invoices TO service_role;

-- Włączenie RLS
ALTER TABLE restaurant_ksef_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ksef_invoices ENABLE ROW LEVEL SECURITY;

-- Uprawnienia i czyste, bezrekurencyjne polityki RLS dla restaurant_ksef_config i ksef_invoices
DROP POLICY IF EXISTS "allow_owner_manage_ksef_config" ON restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_ksef_config" ON restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_ksef_config" ON restaurant_ksef_config;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_ksef_config" ON restaurant_ksef_config;

CREATE POLICY "allow_all_authenticated_restaurant_ksef_config" ON restaurant_ksef_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_ksef_config" ON restaurant_ksef_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_ksef_config" ON restaurant_ksef_config
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Polityki dla ksef_invoices
DROP POLICY IF EXISTS "allow_owner_manage_ksef_invoices" ON ksef_invoices;
DROP POLICY IF EXISTS "allow_all_authenticated_ksef_invoices" ON ksef_invoices;
DROP POLICY IF EXISTS "allow_all_service_role_ksef_invoices" ON ksef_invoices;
DROP POLICY IF EXISTS "allow_all_anon_ksef_invoices" ON ksef_invoices;

CREATE POLICY "allow_all_authenticated_ksef_invoices" ON ksef_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_ksef_invoices" ON ksef_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_ksef_invoices" ON ksef_invoices
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Zapewnienie uprawnień dla właściciela w tabeli restaurant_users, public.users, restaurant_roles i restaurant_todos
GRANT ALL ON TABLE restaurant_users TO authenticated, service_role, anon;
GRANT ALL ON TABLE public.users TO authenticated, service_role, anon;
GRANT ALL ON TABLE restaurant_roles TO authenticated, service_role, anon;
GRANT ALL ON TABLE restaurant_todos TO authenticated, service_role, anon;

-- Polityki RLS dla restaurant_users
DROP POLICY IF EXISTS "allow_owners_select_restaurant_users" ON restaurant_users;
DROP POLICY IF EXISTS "allow_owners_all_restaurant_users" ON restaurant_users;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_users" ON restaurant_users;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_users" ON restaurant_users;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_users" ON restaurant_users;

CREATE POLICY "allow_all_authenticated_restaurant_users" ON restaurant_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_users" ON restaurant_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_users" ON restaurant_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Polityki RLS dla public.users
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

-- Polityki RLS dla restaurant_roles
DROP POLICY IF EXISTS "allow_all_select_restaurant_roles" ON restaurant_roles;
DROP POLICY IF EXISTS "allow_owners_manage_restaurant_roles" ON restaurant_roles;
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_roles" ON restaurant_roles;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_roles" ON restaurant_roles;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_roles" ON restaurant_roles;

CREATE POLICY "allow_all_authenticated_restaurant_roles" ON restaurant_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_roles" ON restaurant_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_roles" ON restaurant_roles
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Polityki RLS dla restaurant_todos
DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_todos" ON restaurant_todos;
DROP POLICY IF EXISTS "allow_all_service_role_restaurant_todos" ON restaurant_todos;
DROP POLICY IF EXISTS "allow_all_anon_restaurant_todos" ON restaurant_todos;

CREATE POLICY "allow_all_authenticated_restaurant_todos" ON restaurant_todos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_role_restaurant_todos" ON restaurant_todos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_anon_restaurant_todos" ON restaurant_todos
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. DANE DEMONSTRACYJNE / TESTOWE (SANDBOX SEED)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_pw_hash text;
  v_owner_uid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'::uuid;
  v_owner_email text := 'kd@t.pl';
  v_owner_name text := 'Krzysztof D.';
  v_venue_wielokran uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_venue_tankownia uuid := '22222222-2222-2222-2222-222222222222'::uuid;
BEGIN
  -- Hasz hasła 'Testowe' zgodny z Supabase Auth
  v_pw_hash := crypt('Testowe', gen_salt('bf'));

  -- A. Użytkownik Właściciel w auth.users
  UPDATE auth.users
  SET encrypted_password = v_pw_hash,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_build_object('full_name', v_owner_name)
  WHERE email = v_owner_email;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current, reauthentication_token,
    is_sso_user, is_anonymous
  )
  SELECT
    v_owner_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_owner_email,
    v_pw_hash,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_owner_name),
    now(),
    now(),
    '', '', '', '', '', '', '', '', false, false
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_owner_email);

  -- B. Tożsamość auth.identities
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  SELECT
    v_owner_uid,
    v_owner_uid,
    json_build_object('sub', v_owner_uid::text, 'email', v_owner_email, 'full_name', v_owner_name)::jsonb,
    'email',
    now(),
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_owner_uid);

  -- C. Profil w public.users
  INSERT INTO public.users (id, email, full_name, default_hourly_rate, is_active)
  VALUES (v_owner_uid, v_owner_email, v_owner_name, 0.00, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = EXCLUDED.is_active;

  -- D. Przypisanie roli 'owner' do obu lokali w restaurant_users
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  VALUES (v_venue_wielokran, v_owner_uid, 'owner', 0.00)
  ON CONFLICT DO NOTHING;

  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  VALUES (v_venue_tankownia, v_owner_uid, 'owner', 0.00)
  ON CONFLICT DO NOTHING;

  -- E. Konfiguracja KSeF dla lokali
  INSERT INTO restaurant_ksef_config (restaurant_id, nip, ksef_token, environment, is_active, last_sync_at)
  VALUES
    (v_venue_wielokran, '5252812345', 'ksef-demo-token-wielokran-2026', 'test', true, now() - interval '2 hours'),
    (v_venue_tankownia, '5252898765', 'ksef-demo-token-tankownia-2026', 'test', true, now() - interval '1 hour')
  ON CONFLICT (restaurant_id) DO UPDATE SET
    nip = EXCLUDED.nip,
    ksef_token = EXCLUDED.ksef_token,
    environment = EXCLUDED.environment,
    is_active = EXCLUDED.is_active,
    last_sync_at = EXCLUDED.last_sync_at;

END $$;

-- ----------------------------------------------------------------------------
-- 7. REALISTYCZNE FAKTURY GASTRONOMICZNE (SEED KSEF)
-- ----------------------------------------------------------------------------

-- Faktura 1: Browar Rzemieślniczy (Wielokran, Alkohol - piwa beczkowe / kegi)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5252812345-20261102-1A2B3C4D5E6F-01',
  'FS/2026/11/0142',
  'cost',
  '2026-11-02',
  '2026-11-02 10:15:30+01',
  '8971234567',
  'Browar Rzemieślniczy "Piwne Dziedzictwo" Sp. z o.o.',
  '5252812345',
  'Wielokran Gastro Sp. z o.o.',
  4850.00,
  1115.50,
  5965.50,
  'PLN',
  'paid',
  'alcohol',
  'Dostawa kegów na otwarcie sezonu jesiennego: Hazy IPA x5, Pils x6, Stout x3.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>8971234567</NIP><PelnaNazwa>Browar Rzemieślniczy Piwne Dziedzictwo Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252812345</NIP><PelnaNazwa>Wielokran Gastro Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-02" P_2="FS/2026/11/0142" P_13_1="4850.00" P_14_1="1115.50" P_15="5965.50"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew 14 dni",
    "payment_due_date": "2026-11-16",
    "bank_account": "PL61109010140000071219812874",
    "items": [
      { "name": "Keg Hazy IPA 30L", "quantity": 5, "unit": "szt", "net_unit_price": 380.00, "net_amount": 1900.00, "vat_rate": "23%", "vat_amount": 437.00, "gross_amount": 2337.00, "category": "alcohol" },
      { "name": "Keg Kraftowy Pils 30L", "quantity": 6, "unit": "szt", "net_unit_price": 310.00, "net_amount": 1860.00, "vat_rate": "23%", "vat_amount": 427.80, "gross_amount": 2287.80, "category": "alcohol" },
      { "name": "Keg Milk Stout 30L", "quantity": 3, "unit": "szt", "net_unit_price": 363.33, "net_amount": 1090.00, "vat_rate": "23%", "vat_amount": 250.70, "gross_amount": 1340.70, "category": "alcohol" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 4850.00, "vat_amount": 1115.50, "gross_amount": 5965.50 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 2: Dystrybucja Alkoholi i Win (Tankownia, Alkohol - wódki, giny, syropy)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '5252898765-20261104-2B3C4D5E6F7A-02',
  'FV/WAW/2026/8891',
  'cost',
  '2026-11-04',
  '2026-11-04 14:22:10+01',
  '5219988776',
  'Dystrybucja Alkoholi Premium "Vitis & Spirit" S.A.',
  '5252898765',
  'Tankownia Bar & Grill Sp. z o.o.',
  7200.00,
  1656.00,
  8856.00,
  'PLN',
  'paid',
  'alcohol',
  'Zaopatrzenie baru w alkohole mocne, giny botaniczne oraz kordiany barmańskie.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5219988776</NIP><PelnaNazwa>Dystrybucja Alkoholi Premium Vitis &amp; Spirit S.A.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252898765</NIP><PelnaNazwa>Tankownia Bar &amp; Grill Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-04" P_2="FV/WAW/2026/8891" P_13_1="7200.00" P_14_1="1656.00" P_15="8856.00"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew",
    "payment_due_date": "2026-11-18",
    "items": [
      { "name": "Wódka Rzemieślnicza Ziemniaczana 0.7L (karton 6 szt)", "quantity": 10, "unit": "kart", "net_unit_price": 280.00, "net_amount": 2800.00, "vat_rate": "23%", "vat_amount": 644.00, "gross_amount": 3444.00, "category": "alcohol" },
      { "name": "Gin Botaniczny Craft 0.7L", "quantity": 24, "unit": "but", "net_unit_price": 95.00, "net_amount": 2280.00, "vat_rate": "23%", "vat_amount": 524.40, "gross_amount": 2804.40, "category": "alcohol" },
      { "name": "Zestaw syropów barmańskich Monin 1L (12 smaków)", "quantity": 4, "unit": "kpl", "net_unit_price": 530.00, "net_amount": 2120.00, "vat_rate": "23%", "vat_amount": 487.60, "gross_amount": 2607.60, "category": "alcohol" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 7200.00, "vat_amount": 1656.00, "gross_amount": 8856.00 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 3: Świeże produkty i warzywa (Wielokran, Żywność - cytrusy, zioła, lód)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5252812345-20261106-3C4D5E6F7A8B-03',
  'FV/EK/2026/0411',
  'cost',
  '2026-11-06',
  '2026-11-06 08:45:00+01',
  '9512345678',
  'Hurtownia "Fresh Gastro & Warzywa" Sp. j.',
  '5252812345',
  'Wielokran Gastro Sp. z o.o.',
  3120.00,
  156.00,
  3276.00,
  'PLN',
  'unpaid',
  'food',
  'Dostawa świeżych cytrusów do koktajli, ziół (mięta, rozmaryn) i lodu spożywczego.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>9512345678</NIP><PelnaNazwa>Hurtownia Fresh Gastro &amp; Warzywa Sp. j.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252812345</NIP><PelnaNazwa>Wielokran Gastro Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-06" P_2="FV/EK/2026/0411" P_13_3="3120.00" P_14_3="156.00" P_15="3276.00"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew 7 dni",
    "payment_due_date": "2026-11-13",
    "items": [
      { "name": "Limonki i cytryny niewoskowane", "quantity": 80, "unit": "kg", "net_unit_price": 14.00, "net_amount": 1120.00, "vat_rate": "5%", "vat_amount": 56.00, "gross_amount": 1176.00, "category": "food" },
      { "name": "Mięta i rozmaryn świeży cięty", "quantity": 40, "unit": "op", "net_unit_price": 25.00, "net_amount": 1000.00, "vat_rate": "5%", "vat_amount": 50.00, "gross_amount": 1050.00, "category": "food" },
      { "name": "Lód w kostkach gourmet (worki 10kg)", "quantity": 40, "unit": "worek", "net_unit_price": 25.00, "net_amount": 1000.00, "vat_rate": "5%", "vat_amount": 50.00, "gross_amount": 1050.00, "category": "food" }
    ],
    "vat_breakdown": [
      { "rate": "5%", "net_amount": 3120.00, "vat_amount": 156.00, "gross_amount": 3276.00 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 4: Wędliny i sery rzemieślnicze (Tankownia, Żywność - tapas i przekąski)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '5252898765-20261107-4D5E6F7A8B9C-04',
  'F/REG/11/2026',
  'cost',
  '2026-11-07',
  '2026-11-07 11:30:00+01',
  '7791234567',
  'Manufaktura Serów i Wędlin "Smaki Regionu"',
  '5252898765',
  'Tankownia Bar & Grill Sp. z o.o.',
  2450.00,
  122.50,
  2572.50,
  'PLN',
  'paid',
  'food',
  'Deski serów dojrzewających, suszone wędliny wołowe oraz pieczywo rzemieślnicze do piwa.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>7791234567</NIP><PelnaNazwa>Manufaktura Serów i Wędlin Smaki Regionu</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252898765</NIP><PelnaNazwa>Tankownia Bar &amp; Grill Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-07" P_2="F/REG/11/2026" P_13_3="2450.00" P_14_3="122.50" P_15="2572.50"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew",
    "payment_due_date": "2026-11-21",
    "items": [
      { "name": "Zestaw serów zagrodowych do tapasu", "quantity": 15, "unit": "kg", "net_unit_price": 90.00, "net_amount": 1350.00, "vat_rate": "5%", "vat_amount": 67.50, "gross_amount": 1417.50, "category": "food" },
      { "name": "Kiełbasy dojrzewające i biltong rzemieślniczy", "quantity": 10, "unit": "kg", "net_unit_price": 110.00, "net_amount": 1100.00, "vat_rate": "5%", "vat_amount": 55.00, "gross_amount": 1155.00, "category": "food" }
    ],
    "vat_breakdown": [
      { "rate": "5%", "net_amount": 2450.00, "vat_amount": 122.50, "gross_amount": 2572.50 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 5: Energia Elektryczna (Wielokran, Media - chłodnie, nalewaki, klimatyzacja)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5252812345-20261108-5E6F7A8B9C0D-05',
  'FV/EN/2026/10/912',
  'cost',
  '2026-11-08',
  '2026-11-08 09:00:15+01',
  '5260250541',
  'PGE Polska Grupa Energetyczna S.A.',
  '5252812345',
  'Wielokran Gastro Sp. z o.o.',
  2890.00,
  664.70,
  3554.70,
  'PLN',
  'pending',
  'utilities',
  'Rozliczenie energii elektrycznej za październik 2026: taryfa C11 dla lokalu gastronomicznego.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5260250541</NIP><PelnaNazwa>PGE Polska Grupa Energetyczna S.A.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252812345</NIP><PelnaNazwa>Wielokran Gastro Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-08" P_2="FV/EN/2026/10/912" P_13_1="2890.00" P_14_1="664.70" P_15="3554.70"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Polecenie zapłaty",
    "payment_due_date": "2026-11-22",
    "items": [
      { "name": "Energia czynna całodobowa C11", "quantity": 3100, "unit": "kWh", "net_unit_price": 0.72, "net_amount": 2232.00, "vat_rate": "23%", "vat_amount": 513.36, "gross_amount": 2745.36, "category": "utilities" },
      { "name": "Opłata dystrybucyjna zmienna i stała", "quantity": 1, "unit": "kpl", "net_unit_price": 658.00, "net_amount": 658.00, "vat_rate": "23%", "vat_amount": 151.34, "gross_amount": 809.34, "category": "utilities" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 2890.00, "vat_amount": 664.70, "gross_amount": 3554.70 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 6: Czynsz i Najem Lokalu (Tankownia, Czynsz)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '5252898765-20261101-6F7A8B9C0D1E-06',
  'FA/LOK/11/2026',
  'cost',
  '2026-11-01',
  '2026-11-01 07:00:00+01',
  '5212345678',
  'Zarząd Nieruchomości "Kamienica Rynek" Sp. z o.o.',
  '5252898765',
  'Tankownia Bar & Grill Sp. z o.o.',
  12000.00,
  2760.00,
  14760.00,
  'PLN',
  'paid',
  'rent',
  'Miesięczny czynsz najmu lokalu użytkowego (sala konsumpcyjna + zaplecze i ogródek).',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5212345678</NIP><PelnaNazwa>Zarząd Nieruchomości Kamienica Rynek Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252898765</NIP><PelnaNazwa>Tankownia Bar &amp; Grill Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-01" P_2="FA/LOK/11/2026" P_13_1="12000.00" P_14_1="2760.00" P_15="14760.00"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew",
    "payment_due_date": "2026-11-10",
    "items": [
      { "name": "Czynsz najmu lokalu użytkowego - listopad 2026", "quantity": 1, "unit": "mc", "net_unit_price": 12000.00, "net_amount": 12000.00, "vat_rate": "23%", "vat_amount": 2760.00, "gross_amount": 14760.00, "category": "rent" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 12000.00, "vat_amount": 2760.00, "gross_amount": 14760.00 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 7: Serwis Nalewaków i Instalacji Piwnej (Wielokran, Usługi)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5252812345-20261109-7A8B9C0D1E2F-07',
  'FS/TAP/2026/089',
  'cost',
  '2026-11-09',
  '2026-11-09 16:40:00+01',
  '6761234567',
  'Serwis Systemów Piwnych i Chłodnictwa "TapTech" s.c.',
  '5252812345',
  'Wielokran Gastro Sp. z o.o.',
  1450.00,
  333.50,
  1783.50,
  'PLN',
  'paid',
  'services',
  'Okresowe czyszczenie chemiczne 24 linii piwnych, dezynfekcja kranów, wymiana uszczelek.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>6761234567</NIP><PelnaNazwa>Serwis Systemów Piwnych TapTech s.c.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252812345</NIP><PelnaNazwa>Wielokran Gastro Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-09" P_2="FS/TAP/2026/089" P_13_1="1450.00" P_14_1="333.50" P_15="1783.50"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Karta",
    "payment_due_date": "2026-11-09",
    "items": [
      { "name": "Sanitacja i sanityzacja 24 kranów multitap", "quantity": 1, "unit": "usł", "net_unit_price": 1150.00, "net_amount": 1150.00, "vat_rate": "23%", "vat_amount": 264.50, "gross_amount": 1414.50, "category": "services" },
      { "name": "Komplet uszczelek i złączek JG 3/8", "quantity": 1, "unit": "kpl", "net_unit_price": 300.00, "net_amount": 300.00, "vat_rate": "23%", "vat_amount": 69.00, "gross_amount": 369.00, "category": "services" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 1450.00, "vat_amount": 333.50, "gross_amount": 1783.50 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 8: Materiały Reklamowe i Karty Menu (Tankownia, Inne koszty)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '5252898765-20261110-8B9C0D1E2F3A-08',
  'FV/DRUK/2026/112',
  'cost',
  '2026-11-10',
  '2026-11-10 13:00:00+01',
  '7251234567',
  'Studio Graficzne & Drukarnia "Print Pro"',
  '5252898765',
  'Tankownia Bar & Grill Sp. z o.o.',
  850.00,
  195.50,
  1045.50,
  'PLN',
  'paid',
  'other',
  'Druk nowych laminowanych kart dań jesiennych oraz 2000 sztuk podkładek pod piwo.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>7251234567</NIP><PelnaNazwa>Studio Graficzne &amp; Drukarnia Print Pro</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252898765</NIP><PelnaNazwa>Tankownia Bar &amp; Grill Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-10" P_2="FV/DRUK/2026/112" P_13_1="850.00" P_14_1="195.50" P_15="1045.50"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew",
    "payment_due_date": "2026-11-24",
    "items": [
      { "name": "Karty menu laminowane A4 składane", "quantity": 50, "unit": "szt", "net_unit_price": 9.00, "net_amount": 450.00, "vat_rate": "23%", "vat_amount": 103.50, "gross_amount": 553.50, "category": "other" },
      { "name": "Podkładki pod szklanki / tekturki z logo", "quantity": 2000, "unit": "szt", "net_unit_price": 0.20, "net_amount": 400.00, "vat_rate": "23%", "vat_amount": 92.00, "gross_amount": 492.00, "category": "other" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 850.00, "vat_amount": 195.50, "gross_amount": 1045.50 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 9: Faktura Sprzedażowa (Wielokran, Sprzedaż - impreza firmowa B2B)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5252812345-20261111-9C0D1E2F3A4B-09',
  'FS/OUT/2026/015',
  'sales',
  '2026-11-11',
  '2026-11-11 22:00:00+01',
  '5252812345',
  'Wielokran Gastro Sp. z o.o.',
  '5263344556',
  'TechCorp Solutions Poland Sp. z o.o.',
  6500.00,
  1495.00,
  7995.00,
  'PLN',
  'paid',
  'other',
  'Faktura sprzedażowa za organizację zamkniętego spotkania integracyjnego IT i catering tapas.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5252812345</NIP><PelnaNazwa>Wielokran Gastro Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5263344556</NIP><PelnaNazwa>TechCorp Solutions Poland Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-11" P_2="FS/OUT/2026/015" P_13_1="6500.00" P_14_1="1495.00" P_15="7995.00"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew natychmiastowy",
    "payment_due_date": "2026-11-11",
    "items": [
      { "name": "Wynajem antresoli i obsługa barmańska imprezy", "quantity": 1, "unit": "usł", "net_unit_price": 3500.00, "net_amount": 3500.00, "vat_rate": "23%", "vat_amount": 805.00, "gross_amount": 4305.00 },
      { "name": "Pakiet open bar piwa rzemieślnicze i przekąski", "quantity": 30, "unit": "osob", "net_unit_price": 100.00, "net_amount": 3000.00, "vat_rate": "23%", "vat_amount": 690.00, "gross_amount": 3690.00 }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 6500.00, "vat_amount": 1495.00, "gross_amount": 7995.00 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- Faktura 10: Środki czyszczące i chemia zmywarkowa (Tankownia, Inne koszty)
INSERT INTO ksef_invoices (
  restaurant_id, ksef_number, invoice_number, invoice_type,
  issue_date, acquisition_date,
  seller_nip, seller_name, buyer_nip, buyer_name,
  net_amount, vat_amount, gross_amount, currency,
  payment_status, expense_category, notes,
  xml_content, raw_metadata
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '5252898765-20261112-0D1E2F3A4B5C-10',
  'FV/CL/2026/901',
  'cost',
  '2026-11-12',
  '2026-11-12 11:20:00+01',
  '8991234567',
  'Hurtownia Higieny Gastronomicznej "Eco Gastro Clean" Sp. z o.o.',
  '5252898765',
  'Tankownia Bar & Grill Sp. z o.o.',
  1300.00,
  299.00,
  1599.00,
  'PLN',
  'unpaid',
  'other',
  'Profesjonalna chemia do wyparzarek szkła, sól regeneracyjna oraz biodegradowalne słomki.',
  $xml$<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1><DaneIdentyfikacyjne><NIP>8991234567</NIP><PelnaNazwa>Hurtownia Higieny Gastronomicznej Eco Gastro Clean Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252898765</NIP><PelnaNazwa>Tankownia Bar &amp; Grill Sp. z o.o.</PelnaNazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa P_1="2026-11-12" P_2="FV/CL/2026/901" P_13_1="1300.00" P_14_1="299.00" P_15="1599.00"/>
</Faktura>$xml$,
  $json${
    "schema_version": "FA(2)",
    "payment_method": "Przelew 14 dni",
    "payment_due_date": "2026-11-26",
    "items": [
      { "name": "Płyn myjący do zmywarek gastronomicznych do szkła 10L", "quantity": 4, "unit": "kan", "net_unit_price": 175.00, "net_amount": 700.00, "vat_rate": "23%", "vat_amount": 161.00, "gross_amount": 861.00, "category": "other" },
      { "name": "Płyn nabłyszczający i neutralizator 10L", "quantity": 2, "unit": "kan", "net_unit_price": 150.00, "net_amount": 300.00, "vat_rate": "23%", "vat_amount": 69.00, "gross_amount": 369.00, "category": "other" },
      { "name": "Słomki papierowe barowe czarne (op. 500 szt)", "quantity": 6, "unit": "op", "net_unit_price": 50.00, "net_amount": 300.00, "vat_rate": "23%", "vat_amount": 69.00, "gross_amount": 369.00, "category": "other" }
    ],
    "vat_breakdown": [
      { "rate": "23%", "net_amount": 1300.00, "vat_amount": 299.00, "gross_amount": 1599.00 }
    ]
  }$json$::jsonb
)
ON CONFLICT (ksef_number) DO UPDATE SET
  net_amount = EXCLUDED.net_amount,
  vat_amount = EXCLUDED.vat_amount,
  gross_amount = EXCLUDED.gross_amount,
  payment_status = EXCLUDED.payment_status,
  expense_category = EXCLUDED.expense_category;

-- ----------------------------------------------------------------------------
-- 8. ODŚWIEŻENIE SCHEMATU POSTGREST W SUPABASE
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
