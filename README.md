# OrgaShift

Frameworkfreie Webanwendung für Dienstplanung, Urlaub, Personal, Standorte und Abteilungen.

## Datenbank-Migration

`supabase/migrations/20260830153440_pricing_locations_departments.sql` bringt die
Standort-/Abteilungstabellen sowie die neue Tariflogik. Die Migration ist auf dem
verknüpften Projekt bereits eingespielt; für weitere Umgebungen genügt
`supabase db push` bzw. das Ausführen im Supabase-SQL-Editor. Sie ist idempotent,
legt für bestehende Organisationen den Standort „Hauptstandort“ und die Abteilung
„Allgemein“ an und ordnet vorhandene Daten zu.

Ohne eingespielte Migration läuft die Browseroberfläche im Legacy-Modus weiter.

## Tarifwahl

Eine Zahlungsabwicklung ist vorerst nicht angebunden. Der Kontoinhaber wählt den
Basistarif direkt auf `pricing.html`; er wird über `public.set_org_tier(text)`
sofort für die Organisation gesetzt. Erlaubte Tarife: `free`, `starter`, `team`,
`business`. Die Funktion ist auf den Kontoinhaber beschränkt und prüft
serverseitig, dass die im Tarif enthaltenen Mengen (Mitarbeitende, Admins,
Standorte) die vorhandenen Daten fassen (Downgrade-Schutz). Neu registrierte
Admins übernehmen den auf der Pricing-Seite gewählten Tarif per
`?plan=…`-Parameter.

### Kostenpflichtige Zusatzpakete (extra_*)

Über den Basistarif hinausgehende Zusatzmengen werden weiterhin ausschließlich im
Supabase-SQL-Editor bzw. mit der `service_role` gesetzt:

```sql
select public.set_org_subscription(
  'ORGANISATIONS-UUID',
  'team',
  5, -- zusätzliche Mitarbeitende
  1, -- zusätzlicher Admin
  1  -- zusätzlicher Standort
);
```
