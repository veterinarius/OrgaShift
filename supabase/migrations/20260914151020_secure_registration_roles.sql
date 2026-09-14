-- Roles for organization joins come exclusively from the invitation type.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role text := 'user';
  v_org uuid;
  v_tier text := 'free';
  v_invite public.admin_invites%rowtype;
  v_employee public.employees%rowtype;
  v_admin_code text := nullif(trim(new.raw_user_meta_data->>'admin_invite_code'), '');
  v_employee_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
begin
  if v_admin_code is not null and v_employee_code is not null then
    raise exception 'Bitte nur einen Einladungscode verwenden.';
  end if;

  if v_admin_code is not null then
    begin
      select * into strict v_invite from public.admin_invites
      where upper(code) = upper(v_admin_code) and used_by is null for update;
    exception when no_data_found or too_many_rows then
      raise exception 'Admin-Einladung ungueltig oder bereits verwendet.';
    end;
    v_org := v_invite.organization_id;
    v_role := 'admin';
    -- Serialize admin joins for this organization; the existing subscription
    -- trigger enforces the admin limit when the profile receives its org.
    perform 1 from public.organizations where id = v_org for update;
  elsif v_employee_code is not null then
    begin
      select * into strict v_employee from public.employees
      where upper(code) = upper(v_employee_code) and employee_auth_id is null for update;
    exception when no_data_found or too_many_rows then
      raise exception 'Mitarbeiter-Einladung ungueltig oder bereits verwendet.';
    end;
    if v_employee.organization_id is null then
      raise exception 'Mitarbeiter-Einladung ohne Organisation.';
    end if;
    v_org := v_employee.organization_id;
    v_role := 'user'; -- Ignore a caller-supplied admin role for employee codes.
  elsif new.raw_user_meta_data->>'role' = 'admin' then
    -- Self-service admin registration creates a NEW organization only.
    v_role := 'admin';
  end if;

  if v_org is not null then
    select tier into v_tier from public.organizations where id = v_org;
    v_tier := coalesce(v_tier, 'free');
  elsif v_role = 'admin' and exists (
    select 1 from public.tier_limits where tier = new.raw_user_meta_data->>'plan'
  ) then
    v_tier := new.raw_user_meta_data->>'plan';
  end if;

  insert into public.profiles(id,email,full_name,role,tier)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),v_role,v_tier);

  if v_org is null and v_role = 'admin' then
    insert into public.organizations(name,created_by,tier)
    values(coalesce(nullif(new.raw_user_meta_data->>'company',''),
      nullif(new.raw_user_meta_data->>'full_name',''),new.email,'Organisation'),new.id,v_tier)
    returning id into v_org;
  end if;
  if v_org is not null then
    update public.profiles set organization_id = v_org where id = new.id;
  end if;
  if v_invite.id is not null then
    update public.admin_invites set used_by = new.id, used_at = now() where id = v_invite.id;
  end if;
  if v_employee.id is not null then
    -- Link exactly the locked employee, never every row sharing a code.
    update public.employees set employee_auth_id = new.id, must_change_password = false
    where id = v_employee.id;
  end if;
  return new;
end $$;
-- Trigger execution is unaffected by removing direct API execution rights.
revoke all on function public.handle_new_user() from public, anon, authenticated;
