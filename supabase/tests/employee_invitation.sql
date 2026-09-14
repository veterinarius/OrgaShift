-- Synthetic fixtures only, no Auth API calls or emails. Caller wraps in BEGIN.
set local statement_timeout = '20s';
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
        v uuid:=gen_random_uuid(); o uuid; e uuid:=gen_random_uuid();
begin
 perform set_config('test.actor',a::text,true); perform set_config('test.other',b::text,true);
 perform set_config('test.user',u::text,true); perform set_config('test.second',v::text,true);
 perform set_config('test.employee',e::text,true);
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,a||'@invitation-test.invalid','{"role":"admin"}'),
 (b,b||'@invitation-test.invalid','{"role":"admin"}'),
 (u,u||'@invitation-test.invalid','{"role":"user"}'),
 (v,v||'@invitation-test.invalid','{"role":"user"}');
 select organization_id into o from public.profiles where id=a;
 insert into public.employees(id,user_id,organization_id,name,email)
 values(e,a,o,'Invitation fixture',u||'@invitation-test.invalid');
end $$;
set local role service_role;
do $$
declare a uuid:=current_setting('test.actor')::uuid; b uuid:=current_setting('test.other')::uuid;
 u uuid:=current_setting('test.user')::uuid; v uuid:=current_setting('test.second')::uuid;
 e uuid:=current_setting('test.employee')::uuid; email text:=u||'@invitation-test.invalid';
begin
 begin
 perform public.finalize_employee_invitation(u,e,u,email);
 raise exception 'Member allowed'; exception when insufficient_privilege then null; end;
 begin
 perform public.finalize_employee_invitation(b,e,u,email);
 raise exception 'Foreign admin allowed'; exception when insufficient_privilege then null; end;
 begin
 perform public.finalize_employee_invitation(a,e,u,'wrong@invitation-test.invalid');
 raise exception 'Wrong email allowed'; exception when insufficient_privilege then null; end;
 begin
 perform public.finalize_employee_invitation(a,e,b,email);
 raise exception 'Admin account allowed'; exception when insufficient_privilege then null; end;
 perform public.finalize_employee_invitation(a,e,u,email);
 if not exists(select 1 from public.employees x join public.profiles p on p.id=x.employee_auth_id
   where x.id=e and p.id=u and p.organization_id=x.organization_id and p.role='user') then
   raise exception 'Link and profile not set atomically';
 end if;
 begin
 perform public.finalize_employee_invitation(a,e,v,email);
 raise exception 'Existing link overwritten'; exception when insufficient_privilege then null; end;
 if (select employee_auth_id from public.employees where id=e) is distinct from u then
   raise exception 'Existing link changed'; end if;
 if has_function_privilege('authenticated','public.finalize_employee_invitation(uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('anon','public.finalize_employee_invitation(uuid,uuid,uuid,text)','EXECUTE') then
 raise exception 'Client can call finalizer'; end if;
end $$;
reset role;
select 'invitation database tests passed' as result;
rollback;
