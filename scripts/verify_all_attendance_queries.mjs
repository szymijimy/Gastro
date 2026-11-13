import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tgciyfqqowgdedufgycw.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_oZa2CRHkqzAEVhJ5B63kZg_6d0rX08E'

const RESTAURANT_1 = '11111111-1111-1111-1111-111111111111' // Wielokran
const RESTAURANT_2 = '22222222-2222-2222-2222-222222222222' // Tankownia

const TEST_USERS = [
  { role: 'Owner', email: 'kd@t.pl', name: 'Krzysztof D.' },
  { role: 'Manager', email: 'ps@t.pl', name: 'Paulina S.' },
  { role: 'Manager', email: 'mp@t.pl', name: 'Monika P.' },
  { role: 'Staff/Barman', email: 'sw@t.pl', name: 'Szymon W.' },
]

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
}

async function verifyQueries() {
  console.log('========================================================================')
  console.log('WERYFIKACJA ZAPYTAŃ DLA MODUŁU OBECNOŚCI, GRAFIKU, UTARGU I PREMII')
  console.log('========================================================================\n')

  const results = []

  for (const user of TEST_USERS) {
    console.log(`\n>>> Testowanie użytkownika: ${user.name} (${user.email}) [${user.role}]`)
    const sb = getClient()
    const { data: auth, error: loginErr } = await sb.auth.signInWithPassword({
      email: user.email,
      password: 'Testowe',
    })

    if (loginErr) {
      console.error(`Błąd logowania ${user.email}: ${loginErr.message}`)
      continue
    }

    const uid = auth.user.id
    const userRes = { user: user.name, role: user.role, email: user.email, tables: {} }

    // 1. attendance_logs query test (AttendanceManagerModule & StaffAttendanceModule)
    {
      const { data, error } = await sb
        .from('attendance_logs')
        .select('*')
        .eq('restaurant_id', RESTAURANT_1)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5)
      userRes.tables['attendance_logs_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 2. bonus_rules query test
    {
      const { data, error } = await sb
        .from('bonus_rules')
        .select('*')
        .eq('restaurant_id', RESTAURANT_1)
        .order('created_at', { ascending: false })
        .limit(5)
      userRes.tables['bonus_rules_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 3. daily_revenues query test
    {
      const { data, error } = await sb
        .from('daily_revenues')
        .select('*')
        .eq('restaurant_id', RESTAURANT_1)
        .order('work_date', { ascending: false })
        .limit(5)
      userRes.tables['daily_revenues_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 4. manual_bonuses query test
    {
      const { data, error } = await sb
        .from('manual_bonuses')
        .select('*')
        .eq('restaurant_id', RESTAURANT_1)
        .order('bonus_date', { ascending: false })
        .limit(5)
      userRes.tables['manual_bonuses_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 5. restaurant_revenue_fields query test
    {
      const { data, error } = await sb
        .from('restaurant_revenue_fields')
        .select('*')
        .eq('restaurant_id', RESTAURANT_1)
        .order('sort_order', { ascending: true })
        .limit(5)
      userRes.tables['restaurant_revenue_fields_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 6. schedule_shifts query test (ManagerScheduleModule & ShiftCalendar)
    {
      const { data, error } = await sb
        .from('schedule_shifts')
        .select('*')
        .limit(5)
      userRes.tables['schedule_shifts_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // 7. restaurant_day_requirements query test (ManagerScheduleModule)
    {
      const { data, error } = await sb
        .from('restaurant_day_requirements')
        .select('*')
        .in('restaurant_id', [RESTAURANT_1, RESTAURANT_2])
        .limit(5)
      userRes.tables['restaurant_day_requirements_read'] = { ok: !error, error: error?.message, count: data?.length }
    }

    // Write test (INSERT for owner / manager)
    if (user.role === 'Owner') {
      // Test attendance_logs insert for another staff member
      const testLog = {
        restaurant_id: RESTAURANT_1,
        user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-222222222222', // Szymon W.
        work_date: '2026-11-29',
        start_time: '11:00',
        end_time: '17:00',
        hours_worked: 6,
        note: 'RLS verification test',
      }
      const { error: insErr } = await sb.from('attendance_logs').insert([testLog])
      userRes.tables['attendance_logs_insert_other'] = {
        ok: !insErr,
        error: insErr?.message || null,
        blockedByRLS: insErr?.message?.includes('row-level security') || false,
      }

      // Test manual_bonuses insert
      const testBonus = {
        restaurant_id: RESTAURANT_1,
        user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-222222222222',
        amount: 50,
        bonus_date: '2026-11-29',
        reason: 'RLS verification test bonus',
      }
      const { error: bonusErr } = await sb.from('manual_bonuses').insert([testBonus])
      userRes.tables['manual_bonuses_insert'] = {
        ok: !bonusErr,
        error: bonusErr?.message || null,
        blockedByRLS: bonusErr?.message?.includes('row-level security') || false,
      }

      // Test bonus_rules insert
      const testRule = {
        restaurant_id: RESTAURANT_1,
        name: 'Weryfikacja RLS reguła',
        rule_type: 'revenue_total_step',
        param_x: 5000,
        param_y: 1000,
        param_z: 50,
        schedule_type: 'all',
        is_active: false,
      }
      const { error: ruleErr } = await sb.from('bonus_rules').insert([testRule])
      userRes.tables['bonus_rules_insert'] = {
        ok: !ruleErr,
        error: ruleErr?.message || null,
        blockedByRLS: ruleErr?.message?.includes('row-level security') || false,
      }
    }

    results.push(userRes)
    console.log(JSON.stringify(userRes, null, 2))
  }

  console.log('\n========================================================================')
  console.log('PODSUMOWANIE WERYFIKACJI:')
  console.log('========================================================================')
  const ownerResult = results.find((r) => r.role === 'Owner')
  console.log('Właściciel (kd@t.pl):')
  console.log(' - Odczyt 7 tabel:', Object.keys(ownerResult.tables).filter(k => k.endsWith('_read')).map(k => `${k}: ${ownerResult.tables[k].ok ? 'OK' : 'FAIL'}`).join(', '))
  console.log(' - Zapis attendance_logs dla personelu:', ownerResult.tables['attendance_logs_insert_other'].ok ? 'OK' : `ZABLOKOWANY PRZEZ RLS (${ownerResult.tables['attendance_logs_insert_other'].error})`)
  console.log(' - Zapis manual_bonuses:', ownerResult.tables['manual_bonuses_insert'].ok ? 'OK' : `ZABLOKOWANY PRZEZ RLS (${ownerResult.tables['manual_bonuses_insert'].error})`)
  console.log(' - Zapis bonus_rules:', ownerResult.tables['bonus_rules_insert'].ok ? 'OK' : `ZABLOKOWANY PRZEZ RLS (${ownerResult.tables['bonus_rules_insert'].error})`)
}

verifyQueries()
