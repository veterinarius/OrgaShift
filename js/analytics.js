// js/analytics.js - Ist-Stunden, Teamauslastung und optionale Überstunden
// aus dem aktuellen Cloud-Wochenplan sowie Einsätze/Monat aus dem Cloud-
// Monatsplan (Tabelle "plans", plan_type='wochenplan'/'monatsplan') berechnen.
// Läuft nur auf analytics.html; erwartet ein globales sbClient.

(function () {
    'use strict';

    function parseSnapshotValue(snap, key, fallback) {
        if (!snap || !(key in snap)) return fallback;
        try { return JSON.parse(snap[key]); } catch (e) { return fallback; }
    }

    // monatsplan_selectMonth wird als roher String (kein JSON) gespeichert, siehe monatsplan.html
    function rawSnapshotValue(snap, key, fallback) {
        if (!snap || !(key in snap)) return fallback;
        return snap[key];
    }

    // Erkennt "HH:MM–HH:MM" (auch mit "-" statt "–") irgendwo im Zelltext.
    // Über-Mitternacht-Schichten (Ende <= Start) werden als +24h gerechnet.
    const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/;

    // Zerlegt eine Zelle in Name (erste Zeile) und, falls vorhanden, die daraus
    // ablesbare tatsächliche Dauer in Stunden. Der Zelltext kann z.B.
    // "Micha\n08:00–16:00" lauten (siehe generateSchedule() in wochenplan.html).
    function parseCellEntry(rawText) {
        const text = (rawText || '').trim();
        if (!text) return null;
        const name = text.split('\n')[0].trim();
        if (!name) return null;
        const match = text.match(TIME_RANGE_RE);
        let hours = null;
        if (match) {
            const startMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
            let endMin = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
            if (endMin <= startMin) endMin += 24 * 60;
            hours = (endMin - startMin) / 60;
        }
        return { name, hours };
    }

    // Sucht eine hinterlegte Start-/Endzeit-Präferenz für Name/Tag/Schicht und
    // liefert die daraus berechnete Dauer in Stunden, oder null.
    function preferenceHours(preferences, name, day, shift) {
        const t = preferences && preferences[name] && preferences[name].shiftTimes &&
            preferences[name].shiftTimes[day] && preferences[name].shiftTimes[day][shift];
        if (!t || !t.start || !t.end) return null;
        const [sh, sm] = t.start.split(':').map(Number);
        const [eh, em] = t.end.split(':').map(Number);
        if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null;
        let startMin = sh * 60 + sm, endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        return (endMin - startMin) / 60;
    }

    function showState(html) {
        document.getElementById('analyticsContent').innerHTML = '';
        document.getElementById('analyticsState').innerHTML = html;
        document.getElementById('analyticsState').style.display = 'block';
    }

    function formatMonthLabel(ym) {
        if (!ym) return null;
        const parts = ym.split('-').map(Number);
        const y = parts[0], m = parts[1];
        if (!y || !m) return null;
        return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }

    // ISO-8601-Kalenderwoche (Donnerstag-der-Woche-Algorithmus, wie in wochenplan.html).
    function getISOWeekInfo(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
        firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
        const isoWeek = 1 + Math.round((d - firstThursday) / (7 * 86400000));
        return isoWeek;
    }

    // dienstplan_startDate ist das Startdatum der zuletzt in wochenplan.html
    // veröffentlichten Woche (roher ISO-String, kein JSON).
    function formatWeekLabel(startDateIso) {
        if (!startDateIso) return null;
        const start = new Date(startDateIso);
        if (isNaN(start.getTime())) return null;
        return 'KW ' + getISOWeekInfo(start);
    }

    // Zählt besetzte Zellen im Schedule-Grid, ohne Dauer zu berücksichtigen
    // (für "Anzahl Einsätze"). Gibt außerdem Auslastungswerte je Schicht zurück.
    function countGrid(shiftNames, dayNames, rowCounts, schedule) {
        const countByName = {};
        let filledCells = 0;
        let totalCells = 0;
        const shiftUtilization = [];

        shiftNames.forEach((shift, sIdx) => {
            const rows = rowCounts[sIdx] || 0;
            let shiftFilled = 0;
            const shiftTotal = rows * dayNames.length;
            const shiftRows = (schedule && schedule[shift]) || [];

            for (let r = 0; r < rows; r++) {
                const row = shiftRows[r] || [];
                dayNames.forEach((_, dIdx) => {
                    const entry = parseCellEntry(row[dIdx]);
                    if (entry) {
                        shiftFilled++;
                        countByName[entry.name] = (countByName[entry.name] || 0) + 1;
                    }
                });
            }

            filledCells += shiftFilled;
            totalCells += shiftTotal;
            shiftUtilization.push({
                name: shift,
                filled: shiftFilled,
                total: shiftTotal,
                pct: shiftTotal > 0 ? Math.round((shiftFilled / shiftTotal) * 100) : 0
            });
        });

        return { countByName, filledCells, totalCells, shiftUtilization };
    }

    // Ist-Stunden je Mitarbeiter für ein Schedule-Grid: tatsächliche Dauer, wenn im
    // Zelltext ("Name\nHH:MM–HH:MM") oder – falls timeLookupFn übergeben – in den
    // Präferenzen (Start-/Endzeit je Tag/Schicht) hinterlegt, sonst Fallback auf die
    // pauschale Schichtdauer. Gemeinsam für Wochen- und Monatsplan genutzt (der
    // Monatsplan kennt keine Präferenz-Uhrzeiten, daher dort timeLookupFn=null).
    function computeHoursForGrid(shiftNames, dayNames, rowCounts, shiftDurations, schedule, timeLookupFn) {
        const hoursByName = {};
        let durationsMissing = false;
        let exactCells = 0;
        let estimatedCells = 0;
        shiftNames.forEach((shift, sIdx) => {
            const rows = rowCounts[sIdx] || 0;
            const duration = (shiftDurations && shiftDurations[sIdx] != null) ? shiftDurations[sIdx] : null;
            if (duration == null) durationsMissing = true;
            const fallbackDuration = duration != null ? duration : 8;
            const shiftRows = (schedule && schedule[shift]) || [];
            for (let r = 0; r < rows; r++) {
                const row = shiftRows[r] || [];
                dayNames.forEach((day, dIdx) => {
                    const entry = parseCellEntry(row[dIdx]);
                    if (!entry) return;
                    let hours = entry.hours;
                    if (hours == null && timeLookupFn) hours = timeLookupFn(entry.name, day, shift);
                    if (hours != null) exactCells++;
                    else { hours = fallbackDuration; estimatedCells++; }
                    hoursByName[entry.name] = (hoursByName[entry.name] || 0) + hours;
                });
            }
        });
        return { hoursByName, durationsMissing, exactCells, estimatedCells };
    }

    function computeStats(weekly, monthly, employees) {
        const { shiftNames, dayNames, rowCounts, shiftDurations, preferences, weekLabel } = weekly;

        const weeklyResult = computeHoursForGrid(
            shiftNames, dayNames, rowCounts, shiftDurations, weekly.schedule,
            (name, day, shift) => preferenceHours(preferences, name, day, shift)
        );
        const hoursByName = weeklyResult.hoursByName;

        const weeklyGrid = countGrid(shiftNames, dayNames, rowCounts, weekly.schedule);

        // Monatsstunden (für den Abgleich mit dem Monatslimit): echte Ist-Stunden
        // aus dem Monatsplan, nicht nur die reine Einsatz-Anzahl.
        let assignmentsByName = {};
        let monthlyHoursByName = {};
        let monthlyDurationsMissing = false;
        let monthlyExactCells = 0;
        let monthlyEstimatedCells = 0;
        if (monthly) {
            assignmentsByName = countGrid(monthly.shiftNames, monthly.dayNames, monthly.rowCounts, monthly.schedule).countByName;
            const monthlyResult = computeHoursForGrid(
                monthly.shiftNames, monthly.dayNames, monthly.rowCounts, monthly.shiftDurations, monthly.schedule, null
            );
            monthlyHoursByName = monthlyResult.hoursByName;
            monthlyDurationsMissing = monthlyResult.durationsMissing;
            monthlyExactCells = monthlyResult.exactCells;
            monthlyEstimatedCells = monthlyResult.estimatedCells;
        }

        // Mit Mitarbeiterstamm abgleichen (für optionales Monatsstunden-Limit)
        const byName = {};
        employees.forEach(emp => { if (emp.name) byName[emp.name] = emp; });

        const allNames = new Set([
            ...Object.keys(hoursByName),
            ...Object.keys(monthlyHoursByName),
            ...Object.keys(assignmentsByName),
            ...employees.map(e => e.name).filter(Boolean)
        ]);

        const perEmployee = Array.from(allNames).map(name => {
            const emp = byName[name];
            const hours = hoursByName[name] || 0;
            const monthlyHours = monthly ? (monthlyHoursByName[name] || 0) : null;
            const weeklyAssignments = weeklyGrid.countByName[name] || 0;
            const monthlyAssignments = monthly ? (assignmentsByName[name] || 0) : null;
            const limit = emp && emp.weekly_hours_limit != null ? emp.weekly_hours_limit : null;
            return {
                name,
                hours,
                monthlyHours,
                weeklyAssignments,
                monthlyAssignments,
                limit,
                overLimit: limit != null && monthlyHours != null && monthlyHours > limit
            };
        }).sort((a, b) => b.hours - a.hours);

        const teamHours = perEmployee.reduce((sum, e) => sum + e.hours, 0);
        const teamWeeklyAssignments = weeklyGrid.filledCells;
        const teamMonthlyAssignments = monthly ? perEmployee.reduce((sum, e) => sum + (e.monthlyAssignments || 0), 0) : null;
        const avgUtilization = weeklyGrid.totalCells > 0 ? Math.round((weeklyGrid.filledCells / weeklyGrid.totalCells) * 100) : 0;
        const overLimitCount = perEmployee.filter(e => e.overLimit).length;

        return {
            perEmployee,
            shiftUtilization: weeklyGrid.shiftUtilization,
            teamHours,
            teamWeeklyAssignments,
            teamMonthlyAssignments,
            monthLabel: monthly ? monthly.monthLabel : null,
            weekLabel: weekLabel || null,
            avgUtilization,
            overLimitCount,
            hasMonthly: !!monthly,
            durationsMissing: weeklyResult.durationsMissing || monthlyDurationsMissing,
            exactCells: weeklyResult.exactCells + monthlyExactCells,
            estimatedCells: weeklyResult.estimatedCells + monthlyEstimatedCells
        };
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    }

    // Leitet aus den bereits berechneten Kennzahlen verständliche Hinweise ab
    // (regelbasiert, kein LLM) – kritischste Fälle zuerst.
    function generateInsights(stats) {
        const insights = [];

        stats.perEmployee.filter(e => e.overLimit).forEach(e => {
            const diff = e.monthlyHours - e.limit;
            insights.push({
                severity: 'critical',
                text: `${esc(e.name)} liegt ${diff.toLocaleString('de-DE')} Std. über dem Monatslimit (${e.monthlyHours.toLocaleString('de-DE')} von ${e.limit.toLocaleString('de-DE')} Std.).`
            });
        });

        stats.shiftUtilization
            .filter(s => s.pct < 50)
            .sort((a, b) => a.pct - b.pct)
            .forEach(s => {
                insights.push({
                    severity: 'warning',
                    text: `Schicht „${esc(s.name)}" ist nur zu ${s.pct}% besetzt (${s.filled}/${s.total} Plätzen).`
                });
            });

        const withHours = stats.perEmployee.filter(e => e.hours > 0);
        if (withHours.length > 1) {
            const max = Math.max(...withHours.map(e => e.hours));
            const min = Math.min(...withHours.map(e => e.hours));
            const avg = withHours.reduce((sum, e) => sum + e.hours, 0) / withHours.length;
            if (avg > 0 && (max - min) > avg * 0.5) {
                const top = withHours.find(e => e.hours === max);
                const low = withHours.find(e => e.hours === min);
                insights.push({
                    severity: 'info',
                    text: `Ungleiche Verteilung: ${esc(top.name)} arbeitet ${max.toLocaleString('de-DE')} Std., ${esc(low.name)} nur ${min.toLocaleString('de-DE')} Std. (Ø ${avg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.).`
                });
            }
        }

        if (stats.estimatedCells > 0) {
            const totalCells = stats.exactCells + stats.estimatedCells;
            const pct = totalCells > 0 ? Math.round((stats.exactCells / totalCells) * 100) : 0;
            insights.push({
                severity: 'info',
                text: `${pct}% der Einsätze basieren auf hinterlegten Uhrzeiten, für die restlichen ${stats.estimatedCells} von ${totalCells} wurde mit der pauschalen Schichtdauer gerechnet. Für genauere Ist-Stunden im Wochenplan bei den Mitarbeiter-Präferenzen (⚙️) Start-/Endzeiten je Tag hinterlegen.`
            });
        } else if (stats.durationsMissing) {
            insights.push({
                severity: 'info',
                text: 'Für mindestens eine Schicht ist keine Dauer hinterlegt – bei den Ist-Stunden wurde mit 8 Std. gerechnet. Dauer im Wochenplan unter „Einstellungen" pflegen für genaue Werte.'
            });
        }
        if (!stats.hasMonthly) {
            insights.push({
                severity: 'info',
                text: 'Noch kein Monatsplan in der Cloud gespeichert – die Spalten „Ist-Stunden (Monat)" und „Einsätze (Monat)" bleiben leer, und Monatslimits können nicht geprüft werden. Im <a href="monatsplan.html">Monatsplan</a> speichern, um sie zu befüllen.'
            });
        }

        if (insights.length === 0) {
            insights.push({ severity: 'info', text: 'Alles im grünen Bereich – keine Auffälligkeiten bei Auslastung, Stunden oder Verteilung.' });
        }

        return insights;
    }

    function render(stats) {
        document.getElementById('analyticsState').style.display = 'none';

        const insights = generateInsights(stats);
        const insightsPanel = `
            <div class="panel">
                <h2>Hinweise</h2>
                ${insights.map(i => `<div class="insight-row insight-${i.severity}">${i.text}</div>`).join('')}
            </div>`;

        const kpis = `
            <div class="kpi-grid">
                <div class="kpi-tile">
                    <div class="kpi-label">Team-Ist-Stunden${stats.weekLabel ? ' (' + esc(stats.weekLabel) + ')' : ' (aktuelle Woche)'}</div>
                    <div class="kpi-value">${stats.teamHours.toLocaleString('de-DE')} Std.</div>
                </div>
                <div class="kpi-tile">
                    <div class="kpi-label">Team-Einsätze${stats.weekLabel ? ' (' + esc(stats.weekLabel) + ')' : ' (Woche)'}</div>
                    <div class="kpi-value">${stats.teamWeeklyAssignments.toLocaleString('de-DE')}</div>
                </div>
                <div class="kpi-tile">
                    <div class="kpi-label">Team-Einsätze${stats.monthLabel ? ' (' + esc(stats.monthLabel) + ')' : ' (Monat)'}</div>
                    <div class="kpi-value">${stats.teamMonthlyAssignments != null ? stats.teamMonthlyAssignments.toLocaleString('de-DE') : '–'}</div>
                </div>
                <div class="kpi-tile">
                    <div class="kpi-label">Ø Teamauslastung</div>
                    <div class="kpi-value">${stats.avgUtilization}%</div>
                </div>
                <div class="kpi-tile">
                    <div class="kpi-label">Über Monatslimit</div>
                    <div class="kpi-value">${stats.overLimitCount}</div>
                </div>
            </div>`;

        const rows = stats.perEmployee.map(e => {
            const diff = (e.limit != null && e.monthlyHours != null) ? (e.monthlyHours - e.limit) : null;
            const diffHtml = diff == null
                ? '<span class="muted">–</span>'
                : `<span class="${diff > 0 ? 'over' : 'under'}">${diff > 0 ? '+' : ''}${diff.toLocaleString('de-DE')} Std.</span>`;
            return `<tr>
                <td>${esc(e.name)}</td>
                <td>${e.hours.toLocaleString('de-DE')} Std.</td>
                <td>${e.weeklyAssignments.toLocaleString('de-DE')}</td>
                <td>${e.monthlyHours != null ? e.monthlyHours.toLocaleString('de-DE') + ' Std.' : '<span class="muted">–</span>'}</td>
                <td>${e.monthlyAssignments != null ? e.monthlyAssignments.toLocaleString('de-DE') : '<span class="muted">–</span>'}</td>
                <td>${e.limit != null ? e.limit.toLocaleString('de-DE') + ' Std.' : '<span class="muted">kein Limit</span>'}</td>
                <td>${diffHtml}</td>
            </tr>`;
        }).join('');

        const table = `
            <div class="panel">
                <h2>Stunden &amp; Einsätze je Mitarbeitende:r</h2>
                <table class="analytics-table">
                    <thead><tr><th>Name</th><th>Ist-Stunden${stats.weekLabel ? ' (' + esc(stats.weekLabel) + ')' : ' (Woche)'}</th><th>Einsätze${stats.weekLabel ? ' (' + esc(stats.weekLabel) + ')' : ' (Woche)'}</th><th>Ist-Stunden${stats.monthLabel ? ' (' + esc(stats.monthLabel) + ')' : ' (Monat)'}</th><th>Einsätze${stats.monthLabel ? ' (' + esc(stats.monthLabel) + ')' : ' (Monat)'}</th><th>Monatslimit</th><th>Differenz</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="7" class="muted">Keine Einsätze im aktuellen Wochenplan.</td></tr>'}</tbody>
                </table>
            </div>`;

        const bars = stats.shiftUtilization.map(s => `
            <div class="bar-row">
                <div class="bar-label">${esc(s.name)}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${s.pct}%"></div></div>
                <div class="bar-pct">${s.pct}% (${s.filled}/${s.total})</div>
            </div>`).join('');

        const chart = `
            <div class="panel">
                <h2>Auslastung je Schicht</h2>
                ${bars || '<p class="muted">Keine Schichten konfiguriert.</p>'}
            </div>`;

        document.getElementById('analyticsContent').innerHTML = insightsPanel + kpis + table + chart;
    }

    async function init() {
        const { data: { session } } = await sbClient.auth.getSession();
        if (!session) { window.location.href = 'login.html'; return; }

        const { data: profile } = await sbClient
            .from('profiles').select('organization_id').eq('id', session.user.id).single();
        const orgId = profile && profile.organization_id;
        if (!orgId) {
            showState('<p>Diesem Konto ist keine Organisation zugeordnet.</p>');
            return;
        }

        const locationState = window.OrgaShiftLocation ? await OrgaShiftLocation.ready : null;
        const locationId = locationState && locationState.locationId;
        let weeklyQuery = sbClient.from('plans').select('data, updated_at')
            .eq('organization_id', orgId).eq('plan_type', 'wochenplan');
        let monthlyQuery = sbClient.from('plans').select('data, updated_at')
            .eq('organization_id', orgId).eq('plan_type', 'monatsplan');
        if (locationId) {
            weeklyQuery = weeklyQuery.eq('location_id', locationId);
            monthlyQuery = monthlyQuery.eq('location_id', locationId);
        }

        let employeeQuery;
        if (locationId) {
            const { data: links, error: linkError } = await sbClient.from('employee_locations')
                .select('employee_id').eq('organization_id', orgId).eq('location_id', locationId);
            if (linkError) { showState('<p>Fehler beim Laden der Standortzuordnungen: ' + esc(linkError.message) + '</p>'); return; }
            const employeeIds = (links || []).map(link => link.employee_id);
            employeeQuery = employeeIds.length
                ? sbClient.from('employees').select('name, weekly_hours_limit').in('id', employeeIds)
                : Promise.resolve({ data: [], error: null });
        } else {
            employeeQuery = sbClient.from('employees').select('name, weekly_hours_limit').eq('organization_id', orgId);
        }

        const [{ data: weeklyRow }, { data: monthlyRow }, { data: employees, error: empError }] = await Promise.all([
            weeklyQuery.maybeSingle(),
            monthlyQuery.maybeSingle(),
            employeeQuery
        ]);

        if (empError) { showState('<p>Fehler beim Laden der Mitarbeiterdaten: ' + esc(empError.message) + '</p>'); return; }
        if (!weeklyRow || !weeklyRow.data) {
            showState('<p>Noch kein Wochenplan in der Cloud gespeichert. Legen Sie zuerst im <a href="wochenplan.html">Wochenplan</a> einen Plan an und speichern Sie ihn.</p>');
            return;
        }

        const weeklySnap = weeklyRow.data;
        const shiftNames = parseSnapshotValue(weeklySnap, 'dienstplan_shiftNames', []);
        const dayNames = parseSnapshotValue(weeklySnap, 'dienstplan_dayNames', []);
        const rowCounts = parseSnapshotValue(weeklySnap, 'dienstplan_rowCounts', shiftNames.map(() => 7));
        const shiftDurations = parseSnapshotValue(weeklySnap, 'dienstplan_shiftDurations', null);
        const schedule = parseSnapshotValue(weeklySnap, 'dienstplan_schedule', {});
        const preferences = parseSnapshotValue(weeklySnap, 'dienstplan_preferences', {});
        const weekLabel = formatWeekLabel(rawSnapshotValue(weeklySnap, 'dienstplan_startDate', null));

        if (shiftNames.length === 0 || dayNames.length === 0) {
            showState('<p>Der Wochenplan enthält noch keine Schichten oder Tage.</p>');
            return;
        }

        let monthly = null;
        if (monthlyRow && monthlyRow.data) {
            const monthlySnap = monthlyRow.data;
            const mShiftNames = parseSnapshotValue(monthlySnap, 'monatsplan_shiftNames', []);
            const mDayNames = parseSnapshotValue(monthlySnap, 'monatsplan_dayNames', []);
            if (mShiftNames.length > 0 && mDayNames.length > 0) {
                monthly = {
                    shiftNames: mShiftNames,
                    dayNames: mDayNames,
                    rowCounts: parseSnapshotValue(monthlySnap, 'monatsplan_rowCounts', mShiftNames.map(() => 7)),
                    shiftDurations: parseSnapshotValue(monthlySnap, 'monatsplan_shiftDurations', null),
                    schedule: parseSnapshotValue(monthlySnap, 'monatsplan_schedule', {}),
                    monthLabel: formatMonthLabel(rawSnapshotValue(monthlySnap, 'monatsplan_selectMonth', null))
                };
            }
        }

        const stats = computeStats({ shiftNames, dayNames, rowCounts, shiftDurations, schedule, preferences, weekLabel }, monthly, employees || []);
        render(stats);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
