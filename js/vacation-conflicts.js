// js/vacation-conflicts.js - Regelbasierte Konfliktprüfung für Urlaubs-/Krankheitsanträge
// ===================================================================
// Prüft einen Zeitraum auf zwei Arten von Risiken, BEVOR ein Urlaub
// eingereicht/genehmigt/eingetragen wird:
//  1. Direkter Schichtkonflikt: Ist die Person im Zeitraum bereits im
//     Monatsplan eingeplant? Dafür wird NUR der Monatsplan herangezogen,
//     da nur er echte Kalenderdaten hat (monatsplan_dayNames im Format
//     "Mo 01.03." + monatsplan_selectMonth "YYYY-MM", siehe
//     monatsplan.html). Der Wochenplan ist eine wiederkehrende
//     Wochentag-Vorlage ohne Kalenderbezug und wird daher NICHT geprüft.
//     Außerdem liegt pro Organisation nur EIN aktueller Monatsplan-
//     Snapshot in der Cloud (keine Historie) - Direktkonflikte werden
//     also nur erkannt, wenn der angefragte Zeitraum in den Monat des
//     aktuell gespeicherten Plans fällt.
//  2. Überschneidende Abwesenheiten: Wie viele andere Mitarbeitende sind
//     im selben Zeitraum bereits (genehmigt oder beantragt) abwesend,
//     im Verhältnis zur Teamgröße.
//
// Reine Warnung, kein Blocker - die Entscheidung bleibt beim Menschen.
// Bei fehlenden Berechtigungen (RLS) oder Fehlern wird die jeweilige
// Prüfung übersprungen (kein Absturz), analog zum Fehlerverhalten in
// js/analytics.js und js/cloud-plans.js.
// ===================================================================

(function () {
    'use strict';

    function parseSnapshotValue(snap, key, fallback) {
        if (!snap || !(key in snap)) return fallback;
        try { return JSON.parse(snap[key]); } catch (e) { return fallback; }
    }

    // "Mo 01.03." + Jahr 2026 -> "2026-03-01"
    function dayLabelToIsoDate(label, year, month) {
        const match = String(label).match(/(\d{1,2})\.(\d{1,2})\.\s*$/);
        if (!match) return null;
        const day = match[1].padStart(2, '0');
        return `${year}-${String(month).padStart(2, '0')}-${day}`;
    }

    async function findDirectShiftConflicts(sb, orgId, employeeName, fromDate, toDate) {
        const { data: row, error } = await sb.from('plans')
            .select('data').eq('organization_id', orgId).eq('plan_type', 'monatsplan').maybeSingle();
        if (error) { console.warn('[vacation-conflicts] Monatsplan laden fehlgeschlagen:', error.message); return []; }
        if (!row || !row.data) return [];

        const snap = row.data;
        const selectMonth = snap['monatsplan_selectMonth']; // roher String "YYYY-MM", kein JSON
        if (!selectMonth) return [];
        const [year, month] = String(selectMonth).split('-').map(Number);
        if (!year || !month) return [];

        const shiftNames = parseSnapshotValue(snap, 'monatsplan_shiftNames', []);
        const dayNames = parseSnapshotValue(snap, 'monatsplan_dayNames', []);
        const rowCounts = parseSnapshotValue(snap, 'monatsplan_rowCounts', shiftNames.map(() => 7));
        const schedule = parseSnapshotValue(snap, 'monatsplan_schedule', {});

        const conflicts = [];
        dayNames.forEach((label, dIdx) => {
            const iso = dayLabelToIsoDate(label, year, month);
            if (!iso || iso < fromDate || iso > toDate) return;

            shiftNames.forEach((shift, sIdx) => {
                const shiftRows = schedule[shift] || [];
                const rows = rowCounts[sIdx] || 0;
                for (let r = 0; r < rows; r++) {
                    const cell = ((shiftRows[r] || [])[dIdx] || '').trim();
                    if (cell && cell === employeeName) conflicts.push({ date: iso, shift: shift });
                }
            });
        });
        return conflicts;
    }

    async function findAbsenceOverlaps(sb, employeeId, fromDate, toDate) {
        const [vacRes, sickRes] = await Promise.all([
            sb.from('vacations').select('id, employee_id, from_date, to_date')
                .in('status', ['approved', 'pending'])
                .neq('employee_id', employeeId)
                .lte('from_date', toDate).gte('to_date', fromDate),
            sb.from('sick_leave').select('id, employee_id, from_date, to_date')
                .neq('employee_id', employeeId)
                .lte('from_date', toDate).gte('to_date', fromDate)
        ]);
        if (vacRes.error) console.warn('[vacation-conflicts] Urlaubs-Überschneidungen laden fehlgeschlagen:', vacRes.error.message);
        if (sickRes.error) console.warn('[vacation-conflicts] Krankheits-Überschneidungen laden fehlgeschlagen:', sickRes.error.message);
        return [].concat(vacRes.data || [], sickRes.data || []);
    }

    async function countOrgEmployees(sb) {
        const { count, error } = await sb.from('employees').select('id', { count: 'exact', head: true });
        if (error) { console.warn('[vacation-conflicts] Mitarbeiterzahl laden fehlgeschlagen:', error.message); return null; }
        return count;
    }

    // employees (optional): [{id, name}] der Organisation, bereits von der
    // aufrufenden Seite geladen - wird nur genutzt, um überschneidende
    // Abwesenheiten mit Namen statt anonym anzuzeigen (Admin-Seiten haben
    // diese Liste bereits, urlaubUSER.html nicht).
    window.checkVacationConflicts = async function checkVacationConflicts(sb, opts) {
        const { orgId, employeeId, employeeName, fromDate, toDate, employees } = opts || {};
        const result = {
            directConflictDays: [],
            overlapCount: 0,
            overlapNames: [],
            totalEmployees: null,
            riskLevel: 'none'
        };
        if (!sb || !orgId || !employeeId || !fromDate || !toDate) return result;

        try {
            const [directConflicts, overlaps, totalEmployees] = await Promise.all([
                employeeName ? findDirectShiftConflicts(sb, orgId, employeeName, fromDate, toDate) : Promise.resolve([]),
                findAbsenceOverlaps(sb, employeeId, fromDate, toDate),
                countOrgEmployees(sb)
            ]);

            result.directConflictDays = directConflicts;
            result.overlapCount = overlaps.length;
            result.totalEmployees = totalEmployees;

            if (employees && employees.length) {
                const nameById = {};
                employees.forEach(e => { nameById[e.id] = e.name; });
                result.overlapNames = overlaps.map(o => nameById[o.employee_id]).filter(Boolean);
            }

            const ratio = totalEmployees ? overlaps.length / totalEmployees : 0;
            if (directConflicts.length > 0 || ratio >= 0.25) result.riskLevel = 'high';
            else if (overlaps.length > 0) result.riskLevel = 'low';
        } catch (e) {
            console.warn('[vacation-conflicts] Prüfung fehlgeschlagen:', e);
        }

        return result;
    };

    // Baut aus dem Ergebnis von checkVacationConflicts() einen Klartext-Hinweis.
    // Gibt null zurück, wenn kein Risiko erkannt wurde (riskLevel 'none').
    window.formatVacationConflictMessage = function formatVacationConflictMessage(result) {
        if (!result || result.riskLevel === 'none') return null;
        const lines = [];
        if (result.directConflictDays.length > 0) {
            const days = result.directConflictDays.map(c => `${c.date} (${c.shift})`).join(', ');
            lines.push(`Die Person ist laut Monatsplan an folgenden Tagen bereits eingeplant: ${days}.`);
        }
        if (result.overlapCount > 0) {
            const names = result.overlapNames.length > 0 ? ` (${result.overlapNames.join(', ')})` : '';
            lines.push(`Im selben Zeitraum sind bereits ${result.overlapCount} weitere Kolleg:innen abwesend${names}.`);
        }
        return lines.join(' ');
    };
})();
