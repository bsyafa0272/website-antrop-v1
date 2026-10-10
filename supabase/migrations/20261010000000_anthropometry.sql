-- Supabase schema for the pediatric anthropometry app.
-- Run in the Supabase SQL editor. Access is scoped to organization membership.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'clinician', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = auth.uid()
) $$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = any(p_roles)
) $$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 160),
  medical_record_number text not null check (length(trim(medical_record_number)) between 1 and 80),
  birth_date date not null,
  sex_at_birth text not null check (sex_at_birth in ('female', 'male')),
  gestational_age_at_birth jsonb,
  guardian_name text,
  clinical_notes text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, medical_record_number)
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete restrict,
  rme_visit_id text,
  exam_date date not null,
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 0.1 and 300),
  length_height_cm numeric(6,2) check (length_height_cm is null or length_height_cm between 20 and 250),
  measurement_type text not null check (measurement_type in ('recumbent_length', 'standing_height')),
  edema_status text not null default 'unknown' check (edema_status in ('unknown', 'absent', 'present')),
  head_circumference_cm numeric(6,2) check (head_circumference_cm is null or head_circumference_cm between 10 and 100),
  mid_upper_arm_circumference_cm numeric(6,2) check (mid_upper_arm_circumference_cm is null or mid_upper_arm_circumference_cm between 3 and 80),
  notes text,
  recorded_by uuid references auth.users(id),
  verification_status text not null default 'pending',
  data_validation_status text not null check (data_validation_status in ('valid', 'incomplete', 'failed_validation')),
  interpretation_status text not null check (interpretation_status in ('not_calculated', 'valid', 'incomplete', 'failed_validation', 'stale')),
  anthropometry_calculation jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weight_kg is not null or length_height_cm is not null or head_circumference_cm is not null or mid_upper_arm_circumference_cm is not null)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id),
  entity_type text not null check (entity_type in ('patient', 'exam')),
  entity_id uuid not null,
  action text not null check (action in ('CREATED', 'CORRECTED')),
  before_data jsonb,
  after_data jsonb,
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now()
);

create index if not exists exams_org_patient_date_idx on public.exams (organization_id, patient_id, exam_date desc);
create index if not exists audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.patients enable row level security;
alter table public.exams enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "members can read their organization" on public.organizations;
create policy "members can read their organization" on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists "members can read organization roster" on public.organization_members;
create policy "members can read organization roster" on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "members can read patients" on public.patients;
create policy "members can read patients" on public.patients for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "clinical staff can add patients" on public.patients;
create policy "clinical staff can add patients" on public.patients for insert to authenticated
  with check (owner_id = auth.uid() and public.has_org_role(organization_id, array['admin', 'clinician']));
drop policy if exists "clinical staff can correct patients" on public.patients;
create policy "clinical staff can correct patients" on public.patients for update to authenticated
  using (public.has_org_role(organization_id, array['admin', 'clinician']))
  with check (public.has_org_role(organization_id, array['admin', 'clinician']));

drop policy if exists "members can read exams" on public.exams;
create policy "members can read exams" on public.exams for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "clinical staff can add exams" on public.exams;
create policy "clinical staff can add exams" on public.exams for insert to authenticated
  with check (owner_id = auth.uid() and public.has_org_role(organization_id, array['admin', 'clinician']));
drop policy if exists "clinical staff can correct exams" on public.exams;
create policy "clinical staff can correct exams" on public.exams for update to authenticated
  using (public.has_org_role(organization_id, array['admin', 'clinician']))
  with check (public.has_org_role(organization_id, array['admin', 'clinician']));

drop policy if exists "members can read audit events" on public.audit_events;
create policy "members can read audit events" on public.audit_events for select to authenticated
  using (public.is_org_member(organization_id));

grant usage on schema public to authenticated;
grant select on public.organizations, public.organization_members, public.audit_events to authenticated;
grant select, insert, update on public.patients, public.exams to authenticated;

create or replace function public.stamp_anthropometry_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare patient_org uuid; patient_birth_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if tg_table_name = 'patients' then
    if new.birth_date > current_date then raise exception 'Birth date cannot be in the future'; end if;
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid(); new.version := 1; new.created_at := now();
    else
      new.owner_id := old.owner_id; new.organization_id := old.organization_id;
      new.version := old.version + 1; new.created_at := old.created_at;
    end if;
  else
    select p.organization_id, p.birth_date into patient_org, patient_birth_date from public.patients p where p.id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then raise exception 'Patient and exam organization mismatch'; end if;
    if new.exam_date < patient_birth_date or new.exam_date > current_date then raise exception 'Exam date is outside the patient date range'; end if;
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid(); new.recorded_by := auth.uid(); new.version := 1; new.created_at := now();
    else
      new.owner_id := old.owner_id; new.recorded_by := old.recorded_by;
      new.organization_id := old.organization_id; new.version := old.version + 1; new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patients_stamp on public.patients;
create trigger patients_stamp before insert or update on public.patients
  for each row execute function public.stamp_anthropometry_row();
drop trigger if exists exams_stamp on public.exams;
create trigger exams_stamp before insert or update on public.exams
  for each row execute function public.stamp_anthropometry_row();

create or replace function public.audit_anthropometry_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare before_row jsonb; after_row jsonb; row_id uuid; row_org uuid; action_name text; changed text[];
begin
  if tg_op = 'INSERT' then
    before_row := null; after_row := to_jsonb(new); row_id := new.id; row_org := new.organization_id; action_name := 'CREATED'; changed := array(select jsonb_object_keys(after_row));
  else
    before_row := to_jsonb(old); after_row := to_jsonb(new); row_id := new.id; row_org := new.organization_id; action_name := 'CORRECTED';
    select coalesce(array_agg(n.key order by n.key), '{}') into changed
      from jsonb_each(after_row) n where before_row -> n.key is distinct from n.value;
  end if;
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, before_data, after_data, changed_fields)
  values (row_org, auth.uid(), case when tg_table_name = 'patients' then 'patient' else 'exam' end, row_id, action_name, before_row, after_row, changed);
  return new;
end;
$$;

drop trigger if exists patients_audit on public.patients;
create trigger patients_audit after insert or update on public.patients
  for each row execute function public.audit_anthropometry_change();
drop trigger if exists exams_audit on public.exams;
create trigger exams_audit after insert or update on public.exams
  for each row execute function public.audit_anthropometry_change();

-- Provision once from the Supabase SQL editor (replace the values):
-- insert into public.organizations (name) values ('Nama Klinik') returning id;
-- insert into public.organization_members (organization_id, user_id, role)
-- values ('<organization-uuid>', '<auth-user-uuid>', 'admin');
