-- OrgaShift: neue Tarifstruktur sowie Standorte und Abteilungen.
-- Idempotent ausgelegt; bestehende Datensaetze werden einem Standardstandort
-- und einer Standardabteilung zugeordnet. Basic/Premium bleiben als Aliase
-- lesbar und werden in der Anwendung als Team/Business behandelt.

create extension if not exists pgcrypto;

alter table public.organizations add column if not exists extra_employees integer not null default 0;
alter table public.organizations add column if not exists extra_admins integer not null default 0;
alter table public.organizations add column if not exists extra_locations integer not null default 0;
alter table public.organizations drop constraint if exists organizations_extra_quantities_check;
alter table public.organizations add constraint organizations_extra_quantities_check
    check (extra_employees >= 0 and extra_admins >= 0 and extra_locations >= 0);

-- Alte Installationen erlauben per CHECK teilweise nur free/basic/premium.
-- Die Aliase bleiben gueltig, neue Organisationen koennen Starter/Team/Business nutzen.
do $$
declare item record;
begin
    for item in
        select conname from pg_constraint
        where conrelid = 'public.organizations'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%tier%'
    loop execute format('alter table public.organizations drop constraint %I', item.conname); end loop;
    for item in
        select conname from pg_constraint
        where conrelid = 'public.profiles'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%tier%'
    loop execute format('alter table public.profiles drop constraint %I', item.conname); end loop;
end $$;
alter table public.organizations drop constraint if exists organizations_tier_v2_check;
alter table public.organizations add constraint organizations_tier_v2_check
    check (tier in ('free','starter','team','business','basic','premium'));
alter table public.profiles drop constraint if exists profiles_tier_v2_check;
alter table public.profiles add constraint profiles_tier_v2_check
    check (tier in ('free','starter','team','business','basic','premium'));

alter table public.tier_limits add column if not exists label text;
alter table public.tier_limits add column if not exists monthly_price numeric(10,2) not null default 0;
alter table public.tier_limits add column if not exists yearly_price numeric(10,2) not null default 0;
alter table public.tier_limits add column if not exists included_employees integer not null default 3;
alter table public.tier_limits add column if not exists included_admins integer not null default 1;
alter table public.tier_limits add column if not exists max_admins integer not null default 1;
alter table public.tier_limits add column if not exists included_locations integer not null default 1;
alter table public.tier_limits add column if not exists max_locations integer not null default 1;
alter table public.tier_limits add column if not exists extra_employee_price numeric(10,2);
alter table public.tier_limits add column if not exists extra_admin_price numeric(10,2);
alter table public.tier_limits add column if not exists extra_location_price numeric(10,2);

insert into public.tier_limits (
    tier, max_weeks_history, can_export, can_cloud_save,
    label, monthly_price, yearly_price,
    included_employees, max_employees, included_admins, max_admins,
    included_locations, max_locations,
    extra_employee_price, extra_admin_price, extra_location_price
) values
    ('free',       8, true, true, 'Free',      0,     0,   3,   3, 1,  1, 1,  1, null, 0.00, null),
    ('starter',   52, true, true, 'Starter',   9.90, 99,  10,  15, 2,  2, 1,  1, 1.00, 0.00, null),
    ('team',      52, true, true, 'Team',     19.90, 199, 25,  40, 3,  6, 2,  5, 0.80, 2.90, 4.90),
    ('business', 260, true, true, 'Business', 34.90, 349, 50, 100, 5, 15, 4, 20, 0.60, 2.90, 3.90),
    ('basic',     52, true, true, 'Team',     19.90, 199, 25,  40, 3,  6, 2,  5, 0.80, 2.90, 4.90),
    ('premium',  260, true, true, 'Business', 34.90, 349, 50, 100, 5, 15, 4, 20, 0.60, 2.90, 3.90)
on conflict (tier) do update set
    max_weeks_history = excluded.max_weeks_history,
    can_export = excluded.can_export,
    can_cloud_save = excluded.can_cloud_save,
    label = excluded.label,
    monthly_price = excluded.monthly_price,
    yearly_price = excluded.yearly_price,
    included_employees = excluded.included_employees,
    max_employees = excluded.max_employees,
    included_admins = excluded.included_admins,
    max_admins = excluded.max_admins,
    included_locations = excluded.included_locations,
    max_locations = excluded.max_locations,
    extra_employee_price = excluded.extra_employee_price,
    extra_admin_price = excluded.extra_admin_price,
    extra_location_price = excluded.extra_location_price;

create table if not exists public.locations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    address text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, name)
);

create table if not exists public.departments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    location_id uuid not null references public.locations(id) on delete cascade,
    name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (location_id, name)
);

create table if not exists public.employee_locations (
    employee_id uuid not null references public.employees(id) on delete cascade,
    location_id uuid not null references public.locations(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (employee_id, location_id)
);

create table if not exists public.employee_departments (
    employee_id uuid not null references public.employees(id) on delete cascade,
    department_id uuid not null references public.departments(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (employee_id, department_id)
);

create table if not exists public.location_memberships (
    user_id uuid not null references auth.users(id) on delete cascade,
    location_id uuid not null references public.locations(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, location_id)
);

alter table public.plans add column if not exists location_id uuid references public.locations(id) on delete cascade;
alter table public.day_notes add column if not exists location_id uuid references public.locations(id) on delete cascade;

-- Ein Hauptstandort je bestehender Organisation.
insert into public.locations (organization_id, name)
select o.id, 'Hauptstandort'
from public.organizations o
where not exists (
    select 1 from public.locations l where l.organization_id = o.id
);

-- Eine allgemeine Abteilung je Standort.
insert into public.departments (organization_id, location_id, name)
select l.organization_id, l.id, 'Allgemein'
from public.locations l
where not exists (
    select 1 from public.departments d where d.location_id = l.id and d.name = 'Allgemein'
);

-- Bestehende Plaene und Tagesnotizen werden dem ersten aktiven Standort zugeordnet.
update public.plans p
set location_id = (
    select l.id from public.locations l
    where l.organization_id = p.organization_id
    order by l.created_at, l.id limit 1
)
where p.location_id is null;

update public.day_notes n
set location_id = (
    select l.id from public.locations l
    where l.organization_id = n.organization_id
    order by l.created_at, l.id limit 1
)
where n.location_id is null;

-- Bestehende Mitarbeitende bleiben erhalten und werden dem Hauptstandort zugeordnet.
insert into public.employee_locations (employee_id, location_id, organization_id, is_primary)
select e.id, l.id, e.organization_id, true
from public.employees e
join lateral (
    select id from public.locations
    where organization_id = e.organization_id
    order by created_at, id limit 1
) l on true
where e.organization_id is not null
on conflict (employee_id, location_id) do nothing;

insert into public.employee_departments (employee_id, department_id, organization_id)
select el.employee_id, d.id, el.organization_id
from public.employee_locations el
join public.departments d on d.location_id = el.location_id and d.name = 'Allgemein'
on conflict (employee_id, department_id) do nothing;

-- Alte Eindeutigkeit "Organisation + Plantyp" durch "Organisation + Standort + Plantyp" ersetzen.
do $$
declare item record;
begin
    for item in
        select conname
        from pg_constraint
        where conrelid = 'public.plans'::regclass
          and contype = 'u'
          and pg_get_constraintdef(oid) ilike '%organization_id%'
          and pg_get_constraintdef(oid) ilike '%plan_type%'
          and pg_get_constraintdef(oid) not ilike '%location_id%'
    loop
        execute format('alter table public.plans drop constraint %I', item.conname);
    end loop;

    for item in
        select conname
        from pg_constraint
        where conrelid = 'public.day_notes'::regclass
          and contype = 'u'
          and pg_get_constraintdef(oid) ilike '%organization_id%'
          and pg_get_constraintdef(oid) ilike '%note_date%'
          and pg_get_constraintdef(oid) not ilike '%location_id%'
    loop
        execute format('alter table public.day_notes drop constraint %I', item.conname);
    end loop;

    for item in
        select indexname
        from pg_indexes
        where schemaname = 'public' and tablename = 'plans'
          and indexdef ilike 'create unique index%'
          and indexdef ilike '%organization_id%'
          and indexdef ilike '%plan_type%'
          and indexdef not ilike '%location_id%'
    loop execute format('drop index if exists public.%I', item.indexname); end loop;

    for item in
        select indexname
        from pg_indexes
        where schemaname = 'public' and tablename = 'day_notes'
          and indexdef ilike 'create unique index%'
          and indexdef ilike '%organization_id%'
          and indexdef ilike '%note_date%'
          and indexdef not ilike '%location_id%'
    loop execute format('drop index if exists public.%I', item.indexname); end loop;
end $$;

create unique index if not exists plans_org_location_type_uidx
    on public.plans (organization_id, location_id, plan_type);
create unique index if not exists day_notes_org_location_date_uidx
    on public.day_notes (organization_id, location_id, note_date);

-- PostgreSQL indexiert Fremdschluessel nicht automatisch. Diese Indizes
-- beschleunigen RLS-Pruefungen, Standortfilter und ON-DELETE-CASCADE.
create index if not exists departments_organization_id_idx
    on public.departments (organization_id);
create index if not exists employee_locations_location_id_idx
    on public.employee_locations (location_id);
create index if not exists employee_locations_organization_id_idx
    on public.employee_locations (organization_id);
create index if not exists employee_departments_department_id_idx
    on public.employee_departments (department_id);
create index if not exists employee_departments_organization_id_idx
    on public.employee_departments (organization_id);
create index if not exists location_memberships_location_id_idx
    on public.location_memberships (location_id);
create index if not exists location_memberships_organization_id_idx
    on public.location_memberships (organization_id);
create index if not exists plans_location_id_idx
    on public.plans (location_id);
create index if not exists day_notes_location_id_idx
    on public.day_notes (location_id);

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select organization_id from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.current_user_is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and organization_id = p_org_id and role = 'admin'
    )
$$;

alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.employee_locations enable row level security;
alter table public.employee_departments enable row level security;
alter table public.location_memberships enable row level security;

-- Explizite Data-API-Rechte; der Zeilenzugriff bleibt durch RLS begrenzt.
revoke all on table public.locations, public.departments,
    public.employee_locations, public.employee_departments,
    public.location_memberships from public, anon;
grant select, insert, update, delete on table public.locations, public.departments,
    public.employee_locations, public.employee_departments,
    public.location_memberships to authenticated;
grant all on table public.locations, public.departments,
    public.employee_locations, public.employee_departments,
    public.location_memberships to service_role;

drop policy if exists locations_org_read on public.locations;
create policy locations_org_read on public.locations for select to authenticated
using (organization_id = (select public.current_user_organization_id()));
drop policy if exists locations_admin_write on public.locations;
create policy locations_admin_write on public.locations for all to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));

drop policy if exists departments_org_read on public.departments;
create policy departments_org_read on public.departments for select to authenticated
using (organization_id = (select public.current_user_organization_id()));
drop policy if exists departments_admin_write on public.departments;
create policy departments_admin_write on public.departments for all to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));

drop policy if exists employee_locations_org_read on public.employee_locations;
create policy employee_locations_org_read on public.employee_locations for select to authenticated
using (organization_id = (select public.current_user_organization_id()));
drop policy if exists employee_locations_admin_write on public.employee_locations;
create policy employee_locations_admin_write on public.employee_locations for all to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));

drop policy if exists employee_departments_org_read on public.employee_departments;
create policy employee_departments_org_read on public.employee_departments for select to authenticated
using (organization_id = (select public.current_user_organization_id()));
drop policy if exists employee_departments_admin_write on public.employee_departments;
create policy employee_departments_admin_write on public.employee_departments for all to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));

drop policy if exists location_memberships_org_read on public.location_memberships;
create policy location_memberships_org_read on public.location_memberships for select to authenticated
using (organization_id = (select public.current_user_organization_id()));
drop policy if exists location_memberships_admin_write on public.location_memberships;
create policy location_memberships_admin_write on public.location_memberships for all to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));

-- Fremdschluessel muessen nicht nur existieren, sondern auch derselben
-- Organisation angehoeren. Das verhindert organisationsuebergreifende Links.
create or replace function public.validate_department_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.locations where id = new.location_id and organization_id = new.organization_id) then
        raise exception 'Standort und Abteilung gehoeren nicht derselben Organisation an.';
    end if;
    return new;
end $$;
drop trigger if exists validate_department_organization_trigger on public.departments;
create trigger validate_department_organization_trigger before insert or update on public.departments
for each row execute function public.validate_department_organization();

create or replace function public.validate_employee_location_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.employees where id = new.employee_id and organization_id = new.organization_id)
       or not exists (select 1 from public.locations where id = new.location_id and organization_id = new.organization_id) then
        raise exception 'Mitarbeitende und Standort gehoeren nicht derselben Organisation an.';
    end if;
    return new;
end $$;
drop trigger if exists validate_employee_location_organization_trigger on public.employee_locations;
create trigger validate_employee_location_organization_trigger before insert or update on public.employee_locations
for each row execute function public.validate_employee_location_organization();

create or replace function public.validate_employee_department_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.employees where id = new.employee_id and organization_id = new.organization_id)
       or not exists (select 1 from public.departments where id = new.department_id and organization_id = new.organization_id) then
        raise exception 'Mitarbeitende und Abteilung gehoeren nicht derselben Organisation an.';
    end if;
    return new;
end $$;
drop trigger if exists validate_employee_department_organization_trigger on public.employee_departments;
create trigger validate_employee_department_organization_trigger before insert or update on public.employee_departments
for each row execute function public.validate_employee_department_organization();

create or replace function public.validate_location_membership_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles where id = new.user_id and organization_id = new.organization_id)
       or not exists (select 1 from public.locations where id = new.location_id and organization_id = new.organization_id) then
        raise exception 'Benutzer und Standort gehoeren nicht derselben Organisation an.';
    end if;
    return new;
end $$;
drop trigger if exists validate_location_membership_organization_trigger on public.location_memberships;
create trigger validate_location_membership_organization_trigger before insert or update on public.location_memberships
for each row execute function public.validate_location_membership_organization();

create or replace function public.current_user_can_read_location(p_org_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        public.current_user_is_org_admin(p_org_id)
        or p_location_id is null
        or exists (
            select 1
            from public.employees e
            join public.employee_locations el on el.employee_id = e.id
            where e.employee_auth_id = auth.uid()
              and e.organization_id = p_org_id
              and el.location_id = p_location_id
        )
        or exists (
            select 1 from public.location_memberships lm
            where lm.user_id = auth.uid() and lm.organization_id = p_org_id and lm.location_id = p_location_id
        )
$$;

-- Bestehende Plan-Policies werden kontrolliert ersetzt, damit Mitarbeitende
-- nicht ueber die REST-Schnittstelle Plaene fremder Standorte abrufen koennen.
do $$
declare item record;
begin
    for item in select policyname from pg_policies where schemaname = 'public' and tablename = 'plans'
    loop execute format('drop policy if exists %I on public.plans', item.policyname); end loop;
end $$;
alter table public.plans enable row level security;
create policy plans_location_read on public.plans for select to authenticated
using (
    organization_id = (select public.current_user_organization_id())
    and public.current_user_can_read_location(organization_id, location_id)
);
create policy plans_admin_insert on public.plans for insert to authenticated
with check (public.current_user_is_org_admin(organization_id));
create policy plans_admin_update on public.plans for update to authenticated
using (public.current_user_is_org_admin(organization_id))
with check (public.current_user_is_org_admin(organization_id));
create policy plans_admin_delete on public.plans for delete to authenticated
using (public.current_user_is_org_admin(organization_id));

-- Verbindliche, serverseitig berechnete Limits. Add-ons werden spaeter durch
-- das manuelle Abrechnungs-Backend gesetzt, nicht durch den Browser.
create or replace function public.get_org_entitlements(p_org_id uuid)
returns table (
    tier text,
    label text,
    included_employees integer,
    employee_limit integer,
    max_employees integer,
    included_admins integer,
    admin_limit integer,
    max_admins integer,
    included_locations integer,
    location_limit integer,
    max_locations integer,
    extra_employees integer,
    extra_admins integer,
    extra_locations integer
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        case o.tier when 'basic' then 'team' when 'premium' then 'business' else o.tier end,
        t.label,
        t.included_employees,
        least(t.max_employees, t.included_employees + o.extra_employees),
        t.max_employees,
        t.included_admins,
        least(t.max_admins, t.included_admins + o.extra_admins),
        t.max_admins,
        t.included_locations,
        least(t.max_locations, t.included_locations + o.extra_locations),
        t.max_locations,
        o.extra_employees,
        o.extra_admins,
        o.extra_locations
    from public.organizations o
    join public.tier_limits t on t.tier = o.tier
    where o.id = p_org_id
      and (
          coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or o.id = (select public.current_user_organization_id())
      )
$$;

-- Direkte Browser-Aenderungen an Abrechnungsfeldern blockieren. SQL-Editor,
-- service_role und die kontrollierte RPC bleiben fuer manuelle Aktivierung nutzbar.
create or replace function public.protect_organization_billing_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if auth.uid() is not null
       and coalesce(current_setting('orgashift.allow_tier_change', true), '') <> 'on'
       and (new.tier, new.extra_employees, new.extra_admins, new.extra_locations)
           is distinct from
           (old.tier, old.extra_employees, old.extra_admins, old.extra_locations) then
        raise exception 'Tarif und Zusatzpakete koennen nicht direkt im Browser geaendert werden.';
    end if;
    if auth.uid() is not null
       and (new.logo_url, new.brand_color) is distinct from (old.logo_url, old.brand_color)
       and (case new.tier when 'basic' then 'team' when 'premium' then 'business' else new.tier end)
           not in ('team', 'business') then
        raise exception 'Eigenes Branding ist erst ab dem Team-Tarif verfuegbar.';
    end if;
    return new;
end;
$$;

drop trigger if exists protect_organization_billing_fields_trigger on public.organizations;
create trigger protect_organization_billing_fields_trigger
before update on public.organizations
for each row execute function public.protect_organization_billing_fields();

-- Kontoinhaber duerfen weiterhin auf Free kuendigen. Bezahlte Aktivierungen
-- erfolgen bis zur spaeteren Stripe-Anbindung manuell mit service_role/SQL.
create or replace function public.set_org_tier(p_tier text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_owner uuid;
    v_target text;
    v_employee_count integer;
    v_admin_count integer;
    v_location_count integer;
begin
    v_target := case p_tier when 'basic' then 'team' when 'premium' then 'business' else p_tier end;
    if v_target not in ('free', 'starter', 'team', 'business') then
        raise exception 'Unbekannter Tarif.';
    end if;

    select p.organization_id, o.created_by into v_org_id, v_owner
    from public.profiles p join public.organizations o on o.id = p.organization_id
    where p.id = auth.uid();

    if v_org_id is null or v_owner <> auth.uid() then
        raise exception 'Nur der Kontoinhaber darf den Tarif kuendigen.';
    end if;
    if v_target <> 'free' then
        raise exception 'Bezahlte Tarife werden derzeit manuell aktiviert. Bitte kontaktieren Sie OrgaShift.';
    end if;

    select count(*) into v_employee_count from public.employees where organization_id = v_org_id;
    select count(*) into v_admin_count from public.profiles where organization_id = v_org_id and role = 'admin';
    select count(*) into v_location_count from public.locations where organization_id = v_org_id and is_active;
    if v_employee_count > 3 or v_admin_count > 1 or v_location_count > 1 then
        raise exception 'Vor der Rueckstufung muessen die Free-Limits (3 Mitarbeitende, 1 Admin, 1 Standort) eingehalten werden.';
    end if;

    perform set_config('orgashift.allow_tier_change', 'on', true);
    update public.organizations
    set tier = 'free', extra_employees = 0, extra_admins = 0, extra_locations = 0
    where id = v_org_id;
    update public.profiles set tier = 'free' where organization_id = v_org_id;
    return 'free';
end;
$$;

-- Manuelle Aktivierung bis Stripe eingefuehrt wird. Nur service_role oder
-- eine direkte Ausfuehrung im Supabase-SQL-Editor darf diese Funktion nutzen.
create or replace function public.set_org_subscription(
    p_org_id uuid,
    p_tier text,
    p_extra_employees integer default 0,
    p_extra_admins integer default 0,
    p_extra_locations integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tier text;
    v_limits public.tier_limits%rowtype;
    v_employee_limit integer;
    v_admin_limit integer;
    v_location_limit integer;
    v_employee_count integer;
    v_admin_count integer;
    v_location_count integer;
begin
    if auth.uid() is not null and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'Nur das interne Abrechnungs-Backend darf Abonnements aktivieren.';
    end if;
    v_tier := case p_tier when 'basic' then 'team' when 'premium' then 'business' else p_tier end;
    if v_tier not in ('free','starter','team','business') then raise exception 'Unbekannter Tarif.'; end if;
    if least(p_extra_employees, p_extra_admins, p_extra_locations) < 0 then raise exception 'Zusatzmengen duerfen nicht negativ sein.'; end if;

    select * into v_limits from public.tier_limits where tier = v_tier;
    if p_extra_employees > v_limits.max_employees - v_limits.included_employees
       or p_extra_admins > v_limits.max_admins - v_limits.included_admins
       or p_extra_locations > v_limits.max_locations - v_limits.included_locations then
        raise exception 'Eine Zusatzmenge ueberschreitet das Tarifmaximum.';
    end if;
    if v_tier = 'starter' and (p_extra_admins > 0 or p_extra_locations > 0) then
        raise exception 'Starter erlaubt keine zusaetzlichen Admins oder Standorte.';
    end if;
    if v_tier = 'free' and (p_extra_employees + p_extra_admins + p_extra_locations > 0) then
        raise exception 'Free erlaubt keine Zusatzpakete.';
    end if;

    v_employee_limit := v_limits.included_employees + p_extra_employees;
    v_admin_limit := v_limits.included_admins + p_extra_admins;
    v_location_limit := v_limits.included_locations + p_extra_locations;
    select count(*) into v_employee_count from public.employees where organization_id = p_org_id;
    select count(*) into v_admin_count from public.profiles where organization_id = p_org_id and role = 'admin';
    select count(*) into v_location_count from public.locations where organization_id = p_org_id and is_active;
    if v_employee_count > v_employee_limit or v_admin_count > v_admin_limit or v_location_count > v_location_limit then
        raise exception 'Die vorhandenen Daten ueberschreiten die gewaehlten Tariflimits.';
    end if;

    perform set_config('orgashift.allow_tier_change', 'on', true);
    update public.organizations set
        tier = v_tier,
        extra_employees = p_extra_employees,
        extra_admins = p_extra_admins,
        extra_locations = p_extra_locations
    where id = p_org_id;
    if not found then raise exception 'Organisation nicht gefunden.'; end if;
    update public.profiles set tier = v_tier where organization_id = p_org_id;

    return jsonb_build_object(
        'organization_id', p_org_id, 'tier', v_tier,
        'employee_limit', v_employee_limit, 'admin_limit', v_admin_limit,
        'location_limit', v_location_limit
    );
end;
$$;

-- Neue Organisationen erhalten sofort einen verwendbaren Standardstandort.
create or replace function public.create_default_org_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_location_id uuid;
begin
    insert into public.locations (organization_id, name)
    values (new.id, 'Hauptstandort')
    on conflict (organization_id, name) do update set is_active = true
    returning id into v_location_id;
    insert into public.departments (organization_id, location_id, name)
    values (new.id, v_location_id, 'Allgemein')
    on conflict (location_id, name) do nothing;
    return new;
end;
$$;

drop trigger if exists create_default_org_location_trigger on public.organizations;
create trigger create_default_org_location_trigger
after insert on public.organizations
for each row execute function public.create_default_org_location();

create or replace function public.create_default_location_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.departments (organization_id, location_id, name)
    values (new.organization_id, new.id, 'Allgemein')
    on conflict (location_id, name) do nothing;
    return new;
end;
$$;
drop trigger if exists create_default_location_department_trigger on public.locations;
create trigger create_default_location_department_trigger
after insert on public.locations
for each row execute function public.create_default_location_department();

-- Limits nicht nur in der UI, sondern auch serverseitig erzwingen.
create or replace function public.enforce_employee_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer; v_count integer;
begin
    if new.organization_id is null then return new; end if;
    select least(t.max_employees, t.included_employees + o.extra_employees)
    into v_limit from public.organizations o join public.tier_limits t on t.tier = o.tier
    where o.id = new.organization_id;
    select count(*) into v_count from public.employees
    where organization_id = new.organization_id and id is distinct from new.id;
    if v_count >= coalesce(v_limit, 3) then
        raise exception 'Das Mitarbeiterlimit des gebuchten Tarifs ist erreicht.';
    end if;
    return new;
end;
$$;
drop trigger if exists enforce_employee_subscription_limit_trigger on public.employees;
create trigger enforce_employee_subscription_limit_trigger
before insert or update of organization_id on public.employees
for each row execute function public.enforce_employee_subscription_limit();

create or replace function public.enforce_admin_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer; v_count integer;
begin
    if new.organization_id is null or new.role <> 'admin' then return new; end if;
    select least(t.max_admins, t.included_admins + o.extra_admins)
    into v_limit from public.organizations o join public.tier_limits t on t.tier = o.tier
    where o.id = new.organization_id;
    select count(*) into v_count from public.profiles
    where organization_id = new.organization_id and role = 'admin' and id is distinct from new.id;
    if v_count >= coalesce(v_limit, 1) then
        raise exception 'Das Adminlimit des gebuchten Tarifs ist erreicht.';
    end if;
    return new;
end;
$$;
drop trigger if exists enforce_admin_subscription_limit_trigger on public.profiles;
create trigger enforce_admin_subscription_limit_trigger
before insert or update of organization_id, role on public.profiles
for each row execute function public.enforce_admin_subscription_limit();

create or replace function public.enforce_admin_invite_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer; v_admins integer; v_pending integer;
begin
    select least(t.max_admins, t.included_admins + o.extra_admins)
    into v_limit from public.organizations o join public.tier_limits t on t.tier = o.tier
    where o.id = new.organization_id;
    select count(*) into v_admins from public.profiles
    where organization_id = new.organization_id and role = 'admin';
    select count(*) into v_pending from public.admin_invites
    where organization_id = new.organization_id and used_by is null and id is distinct from new.id;
    if v_admins + v_pending >= coalesce(v_limit, 1) then
        raise exception 'Das Adminlimit des gebuchten Tarifs ist erreicht.';
    end if;
    return new;
end;
$$;
drop trigger if exists enforce_admin_invite_subscription_limit_trigger on public.admin_invites;
create trigger enforce_admin_invite_subscription_limit_trigger
before insert or update of organization_id, used_by on public.admin_invites
for each row when (new.used_by is null)
execute function public.enforce_admin_invite_subscription_limit();

create or replace function public.enforce_location_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer; v_count integer;
begin
    if not new.is_active then return new; end if;
    select least(t.max_locations, t.included_locations + o.extra_locations)
    into v_limit from public.organizations o join public.tier_limits t on t.tier = o.tier
    where o.id = new.organization_id;
    select count(*) into v_count from public.locations
    where organization_id = new.organization_id and is_active and id is distinct from new.id;
    if v_count >= coalesce(v_limit, 1) then
        raise exception 'Das Standortlimit des gebuchten Tarifs ist erreicht.';
    end if;
    return new;
end;
$$;
drop trigger if exists enforce_location_subscription_limit_trigger on public.locations;
create trigger enforce_location_subscription_limit_trigger
before insert or update of organization_id, is_active on public.locations
for each row execute function public.enforce_location_subscription_limit();

create or replace function public.prevent_stranded_location_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.is_active and not new.is_active and exists (
        select 1 from public.employee_locations current_link
        where current_link.location_id = old.id
          and not exists (
              select 1 from public.employee_locations other_link
              join public.locations other_location on other_location.id = other_link.location_id
              where other_link.employee_id = current_link.employee_id
                and other_link.location_id <> old.id
                and other_location.is_active
          )
    ) then
        raise exception 'Mitarbeitende muessen vor der Archivierung einem anderen aktiven Standort zugeordnet werden.';
    end if;
    return new;
end;
$$;
drop trigger if exists prevent_stranded_location_members_trigger on public.locations;
create trigger prevent_stranded_location_members_trigger
before update of is_active on public.locations
for each row execute function public.prevent_stranded_location_members();

-- SECURITY-DEFINER-Funktionen erhalten keine impliziten PUBLIC-Rechte.
revoke all on function public.current_user_organization_id() from public, anon;
revoke all on function public.current_user_is_org_admin(uuid) from public, anon;
revoke all on function public.current_user_can_read_location(uuid,uuid) from public, anon;
revoke all on function public.get_org_entitlements(uuid) from public, anon;
revoke all on function public.set_org_tier(text) from public, anon;
grant execute on function public.current_user_organization_id() to authenticated;
grant execute on function public.current_user_is_org_admin(uuid) to authenticated;
grant execute on function public.current_user_can_read_location(uuid,uuid) to authenticated;
grant execute on function public.get_org_entitlements(uuid) to authenticated, service_role;
grant execute on function public.set_org_tier(text) to authenticated;
revoke all on function public.set_org_subscription(uuid,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.set_org_subscription(uuid,text,integer,integer,integer) to service_role;

revoke all on function public.validate_department_organization() from public, anon, authenticated;
revoke all on function public.validate_employee_location_organization() from public, anon, authenticated;
revoke all on function public.validate_employee_department_organization() from public, anon, authenticated;
revoke all on function public.validate_location_membership_organization() from public, anon, authenticated;
revoke all on function public.protect_organization_billing_fields() from public, anon, authenticated;
revoke all on function public.create_default_org_location() from public, anon, authenticated;
revoke all on function public.create_default_location_department() from public, anon, authenticated;
revoke all on function public.enforce_employee_subscription_limit() from public, anon, authenticated;
revoke all on function public.enforce_admin_subscription_limit() from public, anon, authenticated;
revoke all on function public.enforce_admin_invite_subscription_limit() from public, anon, authenticated;
revoke all on function public.enforce_location_subscription_limit() from public, anon, authenticated;
revoke all on function public.prevent_stranded_location_members() from public, anon, authenticated;
