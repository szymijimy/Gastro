-- ============================================================================
-- MIGRACJA: bonus_rules schedule (Reguły premiowania per dzień / daty)
-- Data: 2026-11-05
-- Opis: Pozwala określić zakres obowiązywania reguły premiowania:
--       - schedule_type: 'all' | 'weekdays' | 'specific_dates'
--       - applicable_days: int[] (1=Pon, 2=Wt, 3=Śr, 4=Czw, 5=Pt, 6=Sob, 0=Nd)
--       - applicable_dates: text[] (np. ['2026-12-31', '2026-11-29'])
-- ============================================================================

ALTER TABLE bonus_rules ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'all';
ALTER TABLE bonus_rules ADD COLUMN IF NOT EXISTS applicable_days int[] DEFAULT NULL;
ALTER TABLE bonus_rules ADD COLUMN IF NOT EXISTS applicable_dates text[] DEFAULT NULL;

-- Nadanie uprawnień i odświeżenie schematu
GRANT ALL ON TABLE bonus_rules TO authenticated;
GRANT ALL ON TABLE bonus_rules TO anon;
GRANT ALL ON TABLE bonus_rules TO service_role;

NOTIFY pgrst, 'reload schema';
