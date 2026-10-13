-- Allow deleting a synthetic demo patient and retain an audit record for the
-- patient and each exam removed by the cascading foreign key.

alter table public.exams
  drop constraint if exists exams_patient_id_fkey;
alter table public.exams
  add constraint exams_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade;

alter table public.audit_events
  drop constraint if exists audit_events_action_check;
alter table public.audit_events
  add constraint audit_events_action_check
  check (action in ('CREATED', 'CORRECTED', 'DELETED'));

create or replace function public.audit_anthropometry_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare before_row jsonb; after_row jsonb; row_id uuid; row_org uuid; action_name text; changed text[];
begin
  if tg_op = 'INSERT' then
    before_row := null; after_row := to_jsonb(new); row_id := new.id; row_org := new.organization_id; action_name := 'CREATED'; changed := array(select jsonb_object_keys(after_row));
    insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, before_data, after_data, changed_fields)
    values (row_org, auth.uid(), case when tg_table_name = 'patients' then 'patient' else 'exam' end, row_id, action_name, before_row, after_row, changed);
    return new;
  elsif tg_op = 'DELETE' then
    before_row := to_jsonb(old); after_row := null; row_id := old.id; row_org := old.organization_id; action_name := 'DELETED';
    changed := array(select jsonb_object_keys(before_row));
    insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, before_data, after_data, changed_fields)
    values (row_org, auth.uid(), case when tg_table_name = 'patients' then 'patient' else 'exam' end, row_id, action_name, before_row, after_row, changed);
    return old;
  else
    before_row := to_jsonb(old); after_row := to_jsonb(new); row_id := new.id; row_org := new.organization_id; action_name := 'CORRECTED';
    select coalesce(array_agg(n.key order by n.key), '{}') into changed
      from jsonb_each(after_row) n where before_row -> n.key is distinct from n.value;
    insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, before_data, after_data, changed_fields)
    values (row_org, auth.uid(), case when tg_table_name = 'patients' then 'patient' else 'exam' end, row_id, action_name, before_row, after_row, changed);
    return new;
  end if;
end;
$$;

drop policy if exists "clinical staff can delete patients" on public.patients;
create policy "clinical staff can delete patients" on public.patients for delete to authenticated
  using (public.has_org_role(organization_id, array['admin', 'clinician']));

drop policy if exists "public demo can delete patients" on public.patients;
create policy "public demo can delete patients" on public.patients for delete to anon
  using (public.is_public_demo_org(organization_id));

grant delete on public.patients to authenticated, anon;
