-- Caller wraps this file in BEGIN; all synthetic users are rolled back.
set local statement_timeout = '20s';
do $$
declare owner_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid();
 o uuid; code text:=gen_random_uuid()::text;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (owner_id,owner_id||'@owner-test.invalid','{"role":"admin","plan":"business"}'),
 (member_id,member_id||'@owner-test.invalid','{"role":"user"}');
 select organization_id into o from public.profiles where id=owner_id;
 insert into public.admin_invites(organization_id,created_by,code) values(o,owner_id,code);
 insert into auth.users(id,email,raw_user_meta_data) values
 (admin_id,admin_id||'@owner-test.invalid',jsonb_build_object('admin_invite_code',code));
 update public.profiles set organization_id=o where id=member_id;
 perform set_config('test.owner',owner_id::text,true);
 perform set_config('test.admin',admin_id::text,true);
 perform set_config('test.member',member_id::text,true);
 perform set_config('test.org',o::text,true);
end $$;
set local role authenticated;
do $$
declare o uuid:=current_setting('test.org')::uuid; n integer; accepted boolean;
begin
 perform set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
 begin
   update public.organizations set created_by=auth.uid() where id=o;
   raise exception 'Admin could take ownership';
 exception when insufficient_privilege then null; end;
 begin
   update public.organizations set created_by=null where id=o;
   raise exception 'Admin could remove owner';
 exception when insufficient_privilege then null; end;
 accepted:=false;
 begin
   perform public.set_org_tier('business'); accepted:=true;
 exception when raise_exception then null; end;
 if accepted then raise exception 'Non-owner could set tariff'; end if;
 update public.organizations set name='Owner security test', logo_url='https://example.invalid/logo.png',brand_color='#123456' where id=o;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Admin presentation edit failed'; end if;
 if (select created_by from public.organizations where id=o) is distinct from current_setting('test.owner')::uuid then
 raise exception 'Owner changed'; end if;

 perform set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
 begin
   update public.organizations set created_by=current_setting('test.admin')::uuid where id=o;
   raise exception 'Direct owner transfer allowed';
 exception when insufficient_privilege then null; end;
 if public.set_org_tier('business') is distinct from 'business' then raise exception 'Owner tariff operation failed'; end if;

 perform set_config('request.jwt.claim.sub',current_setting('test.member'),true);
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member'),'role','authenticated')::text,true);
 update public.organizations set name='Unauthorized' where id=o;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Member changed organization'; end if;
 if has_column_privilege('anon','public.organizations','created_by','UPDATE')
 or has_column_privilege('authenticated','public.organizations','created_by','UPDATE')
 or has_column_privilege('authenticated','public.organizations','id','UPDATE')
 or not has_column_privilege('service_role','public.organizations','created_by','UPDATE') then
 raise exception 'Incorrect ownership grants'; end if;
end $$;
reset role;
select 'organization ownership tests passed' as result;
rollback;
