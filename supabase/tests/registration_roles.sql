-- Synthetic Auth rows inside a transaction; never sends an email.
set local statement_timeout = '20s';
do $$
declare owner_id uuid:=gen_random_uuid(); second_owner uuid:=gen_random_uuid();
 member_id uuid:=gen_random_uuid(); invited_admin uuid:=gen_random_uuid();
 plain_user uuid:=gen_random_uuid(); o uuid; other_org uuid;
 employee_id uuid:=gen_random_uuid(); code text:=gen_random_uuid()::text;
 admin_code text:=gen_random_uuid()::text; bad_id uuid; meta jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (owner_id,owner_id||'@registration-test.invalid','{"role":"admin","plan":"business"}'),
 (second_owner,second_owner||'@registration-test.invalid','{"role":"admin","plan":"business"}');
 select organization_id into o from public.profiles where id=owner_id and role='admin';
 select organization_id into other_org from public.profiles where id=second_owner;
 if o is null or other_org is null or o=other_org then raise exception 'New organizations failed'; end if;
 insert into public.employees(id,user_id,organization_id,name,email,code)
 values(employee_id,owner_id,o,'Fixture','fixture@registration-test.invalid',code);
 insert into public.admin_invites(organization_id,created_by,code) values(o,owner_id,admin_code);

 -- Exploit regression: role=admin + employee code must remain an ordinary user.
 insert into auth.users(id,email,raw_user_meta_data) values(member_id,member_id||'@registration-test.invalid',
 jsonb_build_object('role','admin','invite_code',code,'organization_id',other_org,'plan','free'));
 if not exists(select 1 from public.profiles where id=member_id and role='user' and organization_id=o and tier='business')
 or not exists(select 1 from public.employees where id=employee_id and employee_auth_id=member_id) then
 raise exception 'Employee registration granted wrong identity or role'; end if;

 insert into auth.users(id,email,raw_user_meta_data) values(invited_admin,invited_admin||'@registration-test.invalid',
 jsonb_build_object('role','user','admin_invite_code',admin_code));
 if not exists(select 1 from public.profiles where id=invited_admin and role='admin' and organization_id=o)
 or not exists(select 1 from public.admin_invites ai where ai.code=admin_code and used_by=invited_admin) then
 raise exception 'Valid admin invitation failed'; end if;

 insert into auth.users(id,email,raw_user_meta_data) values(plain_user,plain_user||'@registration-test.invalid',
 jsonb_build_object('role','user','organization_id',o));
 if not exists(select 1 from public.profiles where id=plain_user and role='user' and organization_id is null) then
 raise exception 'Uninvited user joined organization'; end if;

 for meta in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_object('role','admin','invite_code',code),
 jsonb_build_object('admin_invite_code',admin_code),
 jsonb_build_object('role','admin','invite_code','nonexistent-'||code),
 jsonb_build_object('role','admin','admin_invite_code','nonexistent-'||code),
 jsonb_build_object('invite_code',code,'admin_invite_code',admin_code))) loop
   bad_id:=gen_random_uuid();
   begin
     insert into auth.users(id,email,raw_user_meta_data) values(bad_id,bad_id||'@registration-test.invalid',meta);
   exception when raise_exception then null;
   end;
   if exists(select 1 from auth.users where id=bad_id) then raise exception 'Invalid/reused/mixed code accepted'; end if;
 end loop;
 -- Duplicate codes across organizations must never select an arbitrary employee.
 code:=gen_random_uuid()::text;
 insert into public.employees(user_id,organization_id,name,email,code) values
 (owner_id,o,'Duplicate A','a@registration-test.invalid',code),
 (second_owner,other_org,'Duplicate B','b@registration-test.invalid',code);
 bad_id:=gen_random_uuid();
 begin
 insert into auth.users(id,email,raw_user_meta_data) values(bad_id,bad_id||'@registration-test.invalid',jsonb_build_object('invite_code',code));
 exception when raise_exception then null; end;
 if exists(select 1 from auth.users where id=bad_id) then raise exception 'Ambiguous code accepted'; end if;
end $$;
select 'registration role tests passed' as result;
rollback;
