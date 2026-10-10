-- Synthetic public-demo seed: Jaka Widada and five longitudinal measurements.
-- Run only after both migrations. Target UUID is copied from the local config;
-- confirm that this organization is marked is_public_demo and contains only synthetic data.
do $$
declare
  demo_org_id uuid := '97d31d90-6c36-4d93-ad42-865daa5346ff';
  jaka_patient_id uuid := 'd1c9fdca-f04b-44f2-a623-9b9f7f301001';
  demo_calculation jsonb := jsonb_build_object(
    'calculationOrigin', 'synthetic-demo-seed',
    'overallStatus', 'not_calculated',
    'results', '[]'::jsonb,
    'note', 'Data sintetis; aplikasi menghitung ulang Z-score dari nilai ukur.'
  );
begin
  if not exists (
    select 1 from public.organizations
    where id = demo_org_id and is_public_demo is true
  ) then
    raise exception 'Organisasi % tidak ditemukan atau belum ditandai is_public_demo. Pastikan UUID benar dan organisasi hanya berisi data sintetis.', demo_org_id;
  end if;

  insert into public.patients (
    id, organization_id, owner_id, name, medical_record_number, birth_date,
    sex_at_birth, gestational_age_at_birth, guardian_name, clinical_notes
  ) values (
    jaka_patient_id, demo_org_id, null, 'Jaka Widada', 'DEMO-ANTRO-001',
    date '2022-04-12', 'male', null, 'Wali Demo',
    'Data sintetis untuk demonstrasi aplikasi; bukan catatan pasien nyata.'
  )
  on conflict (organization_id, medical_record_number) do update set
    name = excluded.name,
    birth_date = excluded.birth_date,
    sex_at_birth = excluded.sex_at_birth,
    gestational_age_at_birth = excluded.gestational_age_at_birth,
    guardian_name = excluded.guardian_name,
    clinical_notes = excluded.clinical_notes;

  select id into jaka_patient_id from public.patients
  where organization_id = demo_org_id and medical_record_number = 'DEMO-ANTRO-001';

  insert into public.exams (
    id, organization_id, owner_id, patient_id, rme_visit_id, exam_date,
    weight_kg, length_height_cm, measurement_type, edema_status,
    head_circumference_cm, mid_upper_arm_circumference_cm, notes,
    recorded_by, data_validation_status, interpretation_status,
    verification_status, anthropometry_calculation
  ) values
    (
      'd1c9fdca-f04b-44f2-a623-9b9f7f301101', demo_org_id, null, jaka_patient_id,
      'DEMO-JAKA-20230412', date '2023-04-12', 9.00, 74.50,
      'recumbent_length', 'absent', 45.50, 14.00,
      'Pengukuran sintetis pertama untuk demo.', null, 'valid', 'not_calculated',
      'pending', demo_calculation
    ),
    (
      'd1c9fdca-f04b-44f2-a623-9b9f7f301102', demo_org_id, null, jaka_patient_id,
      'DEMO-JAKA-20231012', date '2023-10-12', 10.20, 80.50,
      'recumbent_length', 'absent', 47.00, 14.50,
      'Pengukuran sintetis untuk riwayat longitudinal demo.', null, 'valid', 'not_calculated',
      'pending', demo_calculation
    ),
    (
      'd1c9fdca-f04b-44f2-a623-9b9f7f301103', demo_org_id, null, jaka_patient_id,
      'DEMO-JAKA-20240412', date '2024-04-12', 11.50, 86.00,
      'standing_height', 'absent', 48.00, 15.00,
      'Pengukuran sintetis sekitar usia dua tahun.', null, 'valid', 'not_calculated',
      'pending', demo_calculation
    ),
    (
      'd1c9fdca-f04b-44f2-a623-9b9f7f301104', demo_org_id, null, jaka_patient_id,
      'DEMO-JAKA-20250412', date '2025-04-12', 13.80, 95.00,
      'standing_height', 'absent', 49.00, 15.50,
      'Pengukuran sintetis untuk riwayat longitudinal demo.', null, 'valid', 'not_calculated',
      'pending', demo_calculation
    ),
    (
      'd1c9fdca-f04b-44f2-a623-9b9f7f301105', demo_org_id, null, jaka_patient_id,
      'DEMO-JAKA-20260912', date '2026-09-12', 16.40, 104.20,
      'standing_height', 'absent', 50.00, 16.00,
      'Pengukuran sintetis terbaru untuk demo.', null, 'valid', 'not_calculated',
      'pending', demo_calculation
    )
  on conflict (id) do update set
    patient_id = excluded.patient_id,
    rme_visit_id = excluded.rme_visit_id,
    exam_date = excluded.exam_date,
    weight_kg = excluded.weight_kg,
    length_height_cm = excluded.length_height_cm,
    measurement_type = excluded.measurement_type,
    edema_status = excluded.edema_status,
    head_circumference_cm = excluded.head_circumference_cm,
    mid_upper_arm_circumference_cm = excluded.mid_upper_arm_circumference_cm,
    notes = excluded.notes,
    data_validation_status = excluded.data_validation_status,
    interpretation_status = excluded.interpretation_status,
    verification_status = excluded.verification_status,
    anthropometry_calculation = excluded.anthropometry_calculation;

  raise notice 'Seed sintetis Jaka Widada selesai: 1 profil dan 5 pemeriksaan.';
end;
$$;
