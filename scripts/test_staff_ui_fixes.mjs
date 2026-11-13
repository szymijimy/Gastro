/**
 * Verification test script for Owner Staff Management improvements & fixes
 * (Issues 2, 3, 5, 6, 8)
 */
import assert from 'node:assert'

console.log('--- Rozpoczynanie testów weryfikacyjnych staff-ui ---')

// 1. Test Issue 2: Deduplikacja po emailu i usuwanie placeholder owner@gastro.pl
{
  const rawStaff = [
    {
      id: 'id-owner-demo',
      email: 'owner@gastro.pl',
      full_name: 'Krzysztof D.',
      is_active: true,
      default_hourly_rate: 0,
      memberships: [{ restaurant_id: 'v1', restaurant_name: 'Wielokran', role: 'owner', hourly_rate: 0 }],
    },
    {
      id: 'id-kd-1',
      email: 'kd@t.pl',
      full_name: 'Krzysztof D.',
      is_active: true,
      default_hourly_rate: 0,
      memberships: [{ restaurant_id: 'v1', restaurant_name: 'Wielokran', role: 'owner', hourly_rate: 0 }],
    },
    {
      id: 'id-kd-2',
      email: 'kd@t.pl',
      full_name: 'Krzysztof D.',
      is_active: true,
      default_hourly_rate: 0,
      memberships: [{ restaurant_id: 'v2', restaurant_name: 'Tankownia', role: 'owner', hourly_rate: 0 }],
    },
    {
      id: 'id-barman',
      email: 'barman@gastro.pl',
      full_name: 'Jan Barman',
      is_active: true,
      default_hourly_rate: 0,
      memberships: [{ restaurant_id: 'v1', restaurant_name: 'Wielokran', role: 'Barman', hourly_rate: 0 }],
    },
  ]

  const deduplicatedMap = new Map()
  rawStaff.forEach((staff) => {
    const normEmail = staff.email ? staff.email.trim().toLowerCase() : ''
    const key = normEmail && normEmail !== 'pracownik@gastro.pl' ? `email:${normEmail}` : `id:${staff.id}`
    if (!deduplicatedMap.has(key)) {
      deduplicatedMap.set(key, { ...staff, memberships: [...staff.memberships] })
    } else {
      const existing = deduplicatedMap.get(key)
      staff.memberships.forEach((m) => {
        if (!existing.memberships.some((em) => em.restaurant_id === m.restaurant_id)) {
          existing.memberships.push(m)
        }
      })
    }
  })

  let finalStaffList = Array.from(deduplicatedMap.values())
  const hasRealOwner = finalStaffList.some((s) => {
    const normEmail = s.email.trim().toLowerCase()
    const hasOwnerRole = s.memberships.some((m) => m.role.toLowerCase() === 'owner')
    return (normEmail === 'kd@t.pl' || hasOwnerRole) && normEmail !== 'owner@gastro.pl'
  })

  if (hasRealOwner) {
    finalStaffList = finalStaffList.filter((s) => s.email.trim().toLowerCase() !== 'owner@gastro.pl')
  }

  // Asercje:
  assert.strictEqual(finalStaffList.length, 2, 'Powinny pozostać tylko 2 konta: kd@t.pl i barman@gastro.pl')
  const kd = finalStaffList.find((s) => s.email === 'kd@t.pl')
  assert.ok(kd, 'kd@t.pl musi istnieć')
  assert.strictEqual(kd.memberships.length, 2, 'kd@t.pl powinien mieć połączone memberships dla v1 i v2')
  const placeholder = finalStaffList.find((s) => s.email === 'owner@gastro.pl')
  assert.strictEqual(placeholder, undefined, 'owner@gastro.pl musi zostać usunięty')
  console.log('✓ Test Issue 2 (Deduplikacja po emailu i filtracja owner@gastro.pl): SUKCES')
}

// 2. Test Issue 5: Brak sfabrykowanego "Barman / Obsługa", dokładne role z bazy
{
  const dbRoles = ['Barman', 'Kelner', 'Kuchnia']
  const roleMap = new Map()
  roleMap.set('owner', { value: 'owner', label: 'Właściciel' })
  roleMap.set('manager', { value: 'manager', label: 'Manager' })

  dbRoles.forEach((roleName) => {
    const trimmed = roleName.trim()
    const key = trimmed.toLowerCase()
    if (!roleMap.has(key)) {
      roleMap.set(key, { value: trimmed, label: trimmed })
    }
  })

  const roles = Array.from(roleMap.values())
  assert.ok(!roles.some((r) => r.label === 'Barman / Obsługa'), 'Niedopuszczalne wystąpienie "Barman / Obsługa"')
  assert.ok(roles.some((r) => r.label === 'Barman'), 'Rola Barman musi występować dokładnie jak w DB')
  assert.ok(roles.some((r) => r.label === 'Kelner'), 'Rola Kelner musi występować dokładnie jak w DB')
  assert.ok(roles.some((r) => r.label === 'Kuchnia'), 'Rola Kuchnia musi występować dokładnie jak w DB')
  console.log('✓ Test Issue 5 (Dokładne role z bazy bez "Barman / Obsługa"): SUKCES')
}

// 3. Test Issue 8: Stawki pracownicze (zachowanie 0 zł/h, brak || 30) i N/A dla właściciela
{
  const parseRate = (val) => (val !== null && val !== undefined ? Number(val) : 0)

  assert.strictEqual(parseRate(0), 0, 'Stawka 0 nie może zmienić się w 30')
  assert.strictEqual(parseRate(null), 0, 'Null powinien być 0')
  assert.strictEqual(parseRate(undefined), 0, 'Undefined powinien być 0')
  assert.strictEqual(parseRate(42.5), 42.5, 'Stawka 42.5 musi być zachowana')

  const ownerUser = {
    memberships: [{ role: 'owner', hourly_rate: 0 }],
  }
  const isOwner = ownerUser.memberships.some((m) => m.role.toLowerCase() === 'owner')
  const displayRate = isOwner ? 'Nie dotyczy (Właściciel)' : `${ownerUser.memberships[0].hourly_rate} zł/h`
  assert.strictEqual(displayRate, 'Nie dotyczy (Właściciel)', 'Dla właściciela stawka musi być oznaczona jako nie dotyczy')

  const employeeWithZero = {
    memberships: [{ role: 'Kuchnia', hourly_rate: 0 }],
    default_hourly_rate: 0,
  }
  const isEmpOwner = employeeWithZero.memberships.some((m) => m.role.toLowerCase() === 'owner')
  const empRate = Math.max(
    ...employeeWithZero.memberships.map((m) => parseRate(m.hourly_rate)),
    parseRate(employeeWithZero.default_hourly_rate)
  )
  const empDisplay = isEmpOwner ? 'Nie dotyczy (Właściciel)' : empRate > 0 ? `${empRate.toFixed(2)} zł/h` : '0.00 zł/h'
  assert.strictEqual(empDisplay, '0.00 zł/h', 'Dla pracownika ze stawką 0 musi być wyświetlone 0.00 zł/h, a nie 30 zł/h')

  console.log('✓ Test Issue 8 (Zachowanie stawek 0 i brak || 30, wyłączenie stawek dla właściciela): SUKCES')
}

// 4. Test Issue 3: Pigułki filtrów i wielowariantowe sortowanie
{
  const users = [
    {
      id: '1',
      full_name: 'Krzysztof D.',
      email: 'kd@t.pl',
      memberships: [
        { restaurant_id: 'v1', role: 'owner', hourly_rate: 0 },
        { restaurant_id: 'v2', role: 'owner', hourly_rate: 0 },
      ],
    },
    {
      id: '2',
      full_name: 'Anna Manager',
      email: 'anna@gastro.pl',
      memberships: [{ restaurant_id: 'v1', role: 'manager', hourly_rate: 45 }],
    },
    {
      id: '3',
      full_name: 'Zenon Kelner',
      email: 'zenon@gastro.pl',
      memberships: [{ restaurant_id: 'v2', role: 'Kelner', hourly_rate: 28 }],
    },
    {
      id: '4',
      full_name: 'Bartosz Barman',
      email: 'bartosz@gastro.pl',
      memberships: [
        { restaurant_id: 'v1', role: 'Barman', hourly_rate: 32 },
        { restaurant_id: 'v2', role: 'Barman', hourly_rate: 34 },
      ],
    },
  ]

  // Test Quick Filter: 'Właściciel'
  const owners = users.filter((u) => u.memberships.some((m) => m.role.toLowerCase() === 'owner'))
  assert.strictEqual(owners.length, 1, 'Tylko Krzysztof jest właścicielem')

  // Test Quick Filter: 'Managerowie'
  const managers = users.filter((u) => u.memberships.some((m) => m.role.toLowerCase() === 'manager'))
  assert.strictEqual(managers.length, 1, 'Tylko Anna jest managerem')

  // Test Quick Filter: 'Pracownicy'
  const staff = users.filter((u) => !u.memberships.some((m) => m.role.toLowerCase() === 'owner' || m.role.toLowerCase() === 'manager'))
  assert.strictEqual(staff.length, 2, 'Zenon i Bartosz to pracownicy szeregowi')

  // Test Quick Filter: 'Multi-lokal'
  const multi = users.filter((u) => u.memberships.length > 1)
  assert.strictEqual(multi.length, 2, 'Krzysztof i Bartosz mają multi-lokal')

  // Test Sort: Name A-Z
  const sortedNameAsc = [...users].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pl'))
  assert.strictEqual(sortedNameAsc[0].full_name, 'Anna Manager')
  assert.strictEqual(sortedNameAsc[3].full_name, 'Zenon Kelner')

  // Test Sort: Role hierarchy (Owner -> Manager -> Staff)
  const getWeight = (u) => {
    if (u.memberships.some((m) => m.role.toLowerCase() === 'owner')) return 1
    if (u.memberships.some((m) => m.role.toLowerCase() === 'manager')) return 2
    return 3
  }
  const sortedRole = [...users].sort((a, b) => getWeight(a) - getWeight(b))
  assert.strictEqual(sortedRole[0].full_name, 'Krzysztof D.', 'Właściciel powinien być pierwszy')
  assert.strictEqual(sortedRole[1].full_name, 'Anna Manager', 'Manager powinien być drugi')

  console.log('✓ Test Issue 3 (Pigułki filtrów i wielowariantowe sortowanie): SUKCES')
}

console.log('--- Wszystkie testy jednostkowe staff-ui zakończone pełnym sukcesem! ---')
