# OrgaShift

Frameworkfreie Webanwendung für Dienstplanung, Urlaub, Personal, Standorte und Abteilungen.

## Datenbank-Migration

Vor dem Einsatz der Standort- und neuen Tariflogik muss
`supabase/migrations/202608300001_pricing_locations_departments.sql` einmal im
Supabase-SQL-Editor oder über die Supabase CLI ausgeführt werden. Die Migration
legt für bestehende Organisationen den Standort „Hauptstandort“ und die
Abteilung „Allgemein“ an und ordnet vorhandene Daten zu.

Die Browseroberfläche läuft bis dahin im Legacy-Modus weiter.

## Manuelle Tarifaktivierung

Bis zur späteren Stripe-Integration werden bezahlte Tarife ausschließlich im
Supabase-SQL-Editor beziehungsweise mit der `service_role` aktiviert:

```sql
select public.set_org_subscription(
  'ORGANISATIONS-UUID',
  'team',
  5, -- zusätzliche Mitarbeitende
  1, -- zusätzlicher Admin
  1  -- zusätzlicher Standort
);
```

Erlaubte Tarife: `free`, `starter`, `team`, `business`. Die Funktion prüft
Tarifmaxima und vorhandene Daten serverseitig. Öffentliche Browserkonten können
keine bezahlten Tarife oder Zusatzpakete selbst aktivieren.
