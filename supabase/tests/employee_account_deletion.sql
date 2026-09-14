-- Run in a transaction after the migration; all synthetic accounts are rolled back.
-- No emails are sent: these are direct database fixtures, not Auth API requests.
set local statement_timeout = '20s';
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); u uuid := gen_random_uuid(); o uuid;
begin
  perform set_config('test.admin', a::text, true);
  perform set_config('test.other_admin', b::text, true);
  perform set_config('test.member', u::text, true);
  insert into auth.users (id, email, raw_user_meta_data)
  values (a, a::text || '@security-test.invalid', '{"role":"admin","company":"Security test A"}'),
         (b, b::text || '@security-test.invalid', '{"role":"admin","company":"Security test B"}'),
         (u, u::text || '@security-test.invalid', '{"role":"user"}');
  select organization_id into o from public.profiles where id = a;
  perform set_config('test.org', o::text, true);
  update public.profiles set organization_id = o where id = u;
  insert into public.employees (user_id, organization_id, employee_auth_id, name, email)
  values (a, o, u, 'Security fixture', u::text || '@security-test.invalid');
end $$;
set local role authenticated;
do $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', current_setting('test.admin'), true);
  perform set_config('request.jwt.claims', json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
  insert into public.employees (user_id, organization_id, name, email, must_change_password)
  values (auth.uid(), current_setting('test.org')::uuid, 'Allowed admin insert', 'fixture@security-test.invalid', true);
  update public.employees set name = 'Allowed admin update' where employee_auth_id = current_setting('test.member')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Admin update failed'; end if;
  begin
    update public.employees set employee_auth_id = current_setting('test.other_admin')::uuid;
    raise exception 'Account relinking was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.employees (user_id, name, email, employee_auth_id)
    values (auth.uid(), 'Attack', 'attack@security-test.invalid', current_setting('test.other_admin')::uuid);
    raise exception 'Forged account insert was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.employees set user_id = current_setting('test.other_admin')::uuid;
    raise exception 'Owner reassignment was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.employees set organization_id = null;
    raise exception 'Organization reassignment was allowed';
  exception when insufficient_privilege then null; end;
  delete from public.employees where name = 'Allowed admin insert';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Admin delete failed'; end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.other_admin'), true);
  perform set_config('request.jwt.claims', json_build_object('sub',current_setting('test.other_admin'),'role','authenticated')::text,true);
  begin
    insert into public.employees (user_id, organization_id, name, email)
    values (auth.uid(), current_setting('test.org')::uuid, 'Cross org', 'attack@security-test.invalid');
    raise exception 'Cross-org insert was allowed';
  exception when insufficient_privilege then null; end;
  delete from public.employees where employee_auth_id = current_setting('test.member')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-org delete was allowed'; end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.member'), true);
  perform set_config('request.jwt.claims', json_build_object('sub',current_setting('test.member'),'role','authenticated')::text,true);
  select count(*) into n from public.employees where employee_auth_id = auth.uid();
  if n <> 1 then raise exception 'Member self read failed'; end if;
  begin
    insert into public.employees (user_id, organization_id, name, email)
    values (auth.uid(), current_setting('test.org')::uuid, 'Attack', 'attack@security-test.invalid');
    raise exception 'Member insert was allowed';
  exception when insufficient_privilege then null; end;
  update public.employees set name = 'Attack' where employee_auth_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Member update was allowed'; end if;
  delete from public.employees where employee_auth_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Member delete was allowed'; end if;
  if has_table_privilege('anon','public.employees','INSERT')
     or has_table_privilege('authenticated','public.employees','TRUNCATE')
     or not has_column_privilege('service_role','public.employees','employee_auth_id','UPDATE') then
    raise exception 'Unexpected grants';
  end if;
end $$;
reset role;
select 'employee authorization tests passed; fixtures rolled back' as result;
rollback;
