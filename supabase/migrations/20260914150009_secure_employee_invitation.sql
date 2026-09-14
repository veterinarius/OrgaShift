-- Backend-only finalization. Lock and validate both sides before linking.
create or replace function public.finalize_employee_invitation(
  p_actor uuid, p_employee uuid, p_user uuid, p_email text
) returns void language plpgsql security invoker set search_path = '' as $$
declare actor public.profiles%rowtype; employee public.employees%rowtype;
        target public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = p_actor for share;
  if actor.role is distinct from 'admin' or actor.organization_id is null then
    raise exception 'Invitation not authorized' using errcode = '42501';
  end if;
  select * into employee from public.employees where id = p_employee for update;
  if employee.id is null or employee.organization_id is distinct from actor.organization_id
     or employee.employee_auth_id is not null
     or lower(trim(employee.email)) is distinct from lower(trim(p_email)) then
    raise exception 'Employee unavailable for invitation' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = p_user for update;
  if target.id is null or target.role is distinct from 'user'
     or target.organization_id is not null
     or lower(trim(target.email)) is distinct from lower(trim(p_email))
     or exists (select 1 from public.employees where employee_auth_id = p_user)
     or exists (select 1 from public.organizations where created_by = p_user) then
    raise exception 'Account unavailable for invitation' using errcode = '42501';
  end if;
  update public.profiles set organization_id = employee.organization_id,
    tier = (select tier from public.organizations where id = employee.organization_id)
    where id = p_user;
  update public.employees set employee_auth_id = p_user where id = p_employee;
end $$;
revoke all on function public.finalize_employee_invitation(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.finalize_employee_invitation(uuid,uuid,uuid,text) to service_role;
