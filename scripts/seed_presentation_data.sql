-- ==============================================================================
-- GASTRO APP: DANE TESTOWE DO PREZENTACJI (SEED)
-- Poprawiona wersja bez klauzuli ON CONFLICT na auth.users
-- ==============================================================================

-- 1. LOKALE (RESTAURANTS)
INSERT INTO restaurants (id, name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Wielokran'),
  ('22222222-2222-2222-2222-222222222222', 'Tankownia')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;


-- 2. ROLE W LOKALACH (RESTAURANT_ROLES)
INSERT INTO restaurant_roles (id, restaurant_id, name, color)
VALUES
  -- Wielokran
  ('33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-111111111111', 'Manager', '#3b82f6'),
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-111111111111', 'Barman', '#10b981'),
  -- Tankownia
  ('33333333-3333-3333-3333-000000000003', '22222222-2222-2222-2222-222222222222', 'Manager', '#3b82f6'),
  ('33333333-3333-3333-3333-000000000004', '22222222-2222-2222-2222-222222222222', 'Barman', '#10b981')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color;


-- 3. UŻYTKOWNICY I KONTA LOGOWANIA (BEZPOŚREDNIO W AUTH.USERS, PUBLIC.USERS I RESTAURANT_USERS)
DO $$
DECLARE
  v_users RECORD;
  v_pw_hash text;
  v_user_id uuid;
BEGIN
  -- Wyliczenie hashu hasła "Testowe"
  v_pw_hash := crypt('Testowe', gen_salt('bf'));

  FOR v_users IN 
    SELECT * FROM (VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-111111111111'::uuid, 'ps@t.pl', 'Paulina S.'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-222222222222'::uuid, 'mp@t.pl', 'Monika P.'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-111111111111'::uuid, 'pd@t.pl', 'Paweł D.'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-222222222222'::uuid, 'sw@t.pl', 'Szymon W.'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-333333333333'::uuid, 'pn@t.pl', 'Patrycja N.'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-444444444444'::uuid, 'mo@t.pl', 'Magda O.')
    ) AS t(uid, email, full_name)
  LOOP
    -- A. Aktualizuj jeśli już istnieje w auth.users (hasło + potwierdzenie emaila)
    UPDATE auth.users
    SET encrypted_password = v_pw_hash,
        email_confirmed_at = now(),
        raw_user_meta_data = jsonb_build_object('full_name', v_users.full_name)
    WHERE email = v_users.email;

    -- B. Wstaw jeśli jeszcze nie istnieje (bezpiecznie przez WHERE NOT EXISTS)
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    SELECT
      v_users.uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_users.email,
      v_pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_users.full_name),
      now(),
      now()
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_users.email);

    -- Pobierz aktualny UUID użytkownika z auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_users.email;

    -- C. Dodaj wpis do auth.identities (wymagany przez Supabase do logowania hasłem)
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    SELECT
      v_user_id::text,
      v_user_id,
      json_build_object('sub', v_user_id::text, 'email', v_users.email, 'full_name', v_users.full_name)::jsonb,
      'email',
      now(),
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = v_user_id
    );

    -- D. Zapisz profil w public.users
    INSERT INTO public.users (id, email, full_name, default_hourly_rate, is_active)
    VALUES (v_user_id, v_users.email, v_users.full_name, 30.00, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      is_active = EXCLUDED.is_active;

  END LOOP;

  -- 4. PRZYPISANIE DO LOKALI W RESTAURANT_USERS
  -- Paulina S. (oba lokale, Manager)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '11111111-1111-1111-1111-111111111111', id, 'manager', 40.00 FROM auth.users WHERE email = 'ps@t.pl'
  ON CONFLICT DO NOTHING;

  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '22222222-2222-2222-2222-222222222222', id, 'manager', 40.00 FROM auth.users WHERE email = 'ps@t.pl'
  ON CONFLICT DO NOTHING;

  -- Monika P. (tylko Wielokran, Manager)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '11111111-1111-1111-1111-111111111111', id, 'manager', 40.00 FROM auth.users WHERE email = 'mp@t.pl'
  ON CONFLICT DO NOTHING;

  -- Paweł D. (tylko Wielokran, Barman)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '11111111-1111-1111-1111-111111111111', id, 'Barman', 30.00 FROM auth.users WHERE email = 'pd@t.pl'
  ON CONFLICT DO NOTHING;

  -- Szymon W. (oba lokale, Barman)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '11111111-1111-1111-1111-111111111111', id, 'Barman', 30.00 FROM auth.users WHERE email = 'sw@t.pl'
  ON CONFLICT DO NOTHING;

  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '22222222-2222-2222-2222-222222222222', id, 'Barman', 30.00 FROM auth.users WHERE email = 'sw@t.pl'
  ON CONFLICT DO NOTHING;

  -- Patrycja N. (tylko Tankownia, Barman)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '22222222-2222-2222-2222-222222222222', id, 'Barman', 30.00 FROM auth.users WHERE email = 'pn@t.pl'
  ON CONFLICT DO NOTHING;

  -- Magda O. (oba lokale, Barman)
  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '11111111-1111-1111-1111-111111111111', id, 'Barman', 30.00 FROM auth.users WHERE email = 'mo@t.pl'
  ON CONFLICT DO NOTHING;

  INSERT INTO restaurant_users (restaurant_id, user_id, role, hourly_rate)
  SELECT '22222222-2222-2222-2222-222222222222', id, 'Barman', 30.00 FROM auth.users WHERE email = 'mo@t.pl'
  ON CONFLICT DO NOTHING;

END $$;


-- 5. KATEGORIE I PRODUKTY W TANKOWNI (22222222-2222-2222-2222-222222222222)
INSERT INTO product_categories (id, restaurant_id, name, description)
VALUES
  ('44444444-4444-4444-4444-000000000001', '22222222-2222-2222-2222-222222222222', 'Mrożonki', null),
  ('44444444-4444-4444-4444-000000000002', '22222222-2222-2222-2222-222222222222', 'Alkohole Mocne', 'powyżej 20%')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO restaurant_products (id, restaurant_id, category_id, name, unit, quantity, min_quantity)
VALUES
  -- Mrożonki
  ('55555555-5555-5555-5555-000000000001', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000001', 'Krewetki', 'paczka', 2, 2),
  ('55555555-5555-5555-5555-000000000002', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000001', 'Pierożki', 'paczka', 2, 2),
  ('55555555-5555-5555-5555-000000000003', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000001', 'Stripsy', 'paczka', 8, 8),
  ('55555555-5555-5555-5555-000000000004', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000001', 'Stripsy Hot', 'paczka', 6, 6),

  -- Alkohole Mocne
  ('55555555-5555-5555-5555-000000000005', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000002', 'Soplica Wiśniowa', 'but.', 4, 4),
  ('55555555-5555-5555-5555-000000000006', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-000000000002', 'Ardbeg', 'but.', 1, 1)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  quantity = EXCLUDED.quantity,
  min_quantity = EXCLUDED.min_quantity;


-- 6. KATEGORIE I PRODUKTY W WIELOKRANIE (11111111-1111-1111-1111-111111111111)
INSERT INTO product_categories (id, restaurant_id, name, description)
VALUES
  ('44444444-4444-4444-4444-000000000003', '11111111-1111-1111-1111-111111111111', 'Piwa Kegi', null)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO restaurant_products (id, restaurant_id, category_id, name, unit, quantity, min_quantity)
VALUES
  ('55555555-5555-5555-5555-000000000007', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-000000000003', 'Hopkido', 'keg', 1, 0),
  ('55555555-5555-5555-5555-000000000008', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-000000000003', 'Pilstolet', 'keg', 1, 0)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  quantity = EXCLUDED.quantity,
  min_quantity = EXCLUDED.min_quantity;
