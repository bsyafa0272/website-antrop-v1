-- Enable no-login access only for a dedicated synthetic demo organization.
-- Do not mark an organization containing real patient data as public.
alter table public.organizations
  add column if not exists is_public_demo boolean not null default false;

alter table public.patients alter column owner_id drop not null;
alter table public.exams alter column owner_id drop not null;

create or replace function public.is_public_demo_org(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.is_public_demo is true
  )
$$;

revoke all on function public.is_public_demo_org(uuid) from public;
grant execute on function public.is_public_demo_org(uuid) to anon, authenticated;

drop policy if exists "public visitors can identify demo organizations" on public.organizations;
create policy "public visitors can identify demo organizations" on public.organizations for select to anon
  using (is_public_demo is true);

drop policy if exists "public demo can read patients" on public.patients;
create policy "public demo can read patients" on public.patients for select to anon
  using (public.is_public_demo_org(organization_id));
drop policy if exists "public demo can add patients" on public.patients;
create policy "public demo can add patients" on public.patients for insert to anon
  with check (public.is_public_demo_org(organization_id));
drop policy if exists "public demo can correct patients" on public.patients;
create policy "public demo can correct patients" on public.patients for update to anon
  using (public.is_public_demo_org(organization_id))
  with check (public.is_public_demo_org(organization_id));

drop policy if exists "public demo can read exams" on public.exams;
create policy "public demo can read exams" on public.exams for select to anon
  using (public.is_public_demo_org(organization_id));
drop policy if exists "public demo can add exams" on public.exams;
create policy "public demo can add exams" on public.exams for insert to anon
  with check (public.is_public_demo_org(organization_id));
drop policy if exists "public demo can correct exams" on public.exams;
create policy "public demo can correct exams" on public.exams for update to anon
  using (public.is_public_demo_org(organization_id))
  with check (public.is_public_demo_org(organization_id));

drop policy if exists "public demo can read audit events" on public.audit_events;
create policy "public demo can read audit events" on public.audit_events for select to anon
  using (public.is_public_demo_org(organization_id));

grant usage on schema public to anon;
grant select on public.organizations to anon;
grant select, insert, update on public.patients, public.exams to anon;
grant select on public.audit_events to anon;

create or replace function public.stamp_anthropometry_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare patient_org uuid; patient_birth_date date;
begin
  if tg_op = 'UPDATE' then new.organization_id := old.organization_id; end if;
  if auth.uid() is null and not public.is_public_demo_org(new.organization_id) then
    raise exception 'Authentication required outside public synthetic demo';
  end if;

  if tg_table_name = 'patients' then
    if new.birth_date > current_date then raise exception 'Birth date cannot be in the future'; end if;
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid(); new.version := 1; new.created_at := now();
    else
      new.owner_id := old.owner_id; new.organization_id := old.organization_id;
      new.version := old.version + 1; new.created_at := old.created_at;
    end if;
  else
    select p.organization_id, p.birth_date into patient_org, patient_birth_date
      from public.patients p where p.id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'Patient and exam organization mismatch';
    end if;
    if new.exam_date < patient_birth_date or new.exam_date > current_date then
      raise exception 'Exam date is outside the patient date range';
    end if;
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

-- Mark only the dedicated synthetic demo organization as public.
-- Replace the UUID below with the organizationId in js/supabase-config.js.
-- update public.organizations set is_public_demo = true where id = '<organization-uuid>';
