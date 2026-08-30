// Hält die Mitarbeiterliste der Admin-Planseiten mit dem aktiven Standort synchron.
(function () {
    'use strict';

    async function init() {
        if (!window.OrgaShiftLocation) return;
        var context = await window.OrgaShiftLocation.ready;
        if (!window.sbClient) return;
        if (!context.locationId || !context.organizationId) return;

        var sessionResult = await window.sbClient.auth.getSession();
        var session = sessionResult.data && sessionResult.data.session;
        if (!session) return;
        var profileResult = await window.sbClient.from('profiles').select('role')
            .eq('id', session.user.id).maybeSingle();
        if (!profileResult.data || profileResult.data.role !== 'admin') return;

        var results = await Promise.all([
            window.sbClient.from('employees').select('id,name').eq('organization_id', context.organizationId),
            window.sbClient.from('employee_locations').select('employee_id').eq('organization_id', context.organizationId).eq('location_id', context.locationId)
        ]);
        if (results[0].error || results[1].error) return;

        var allEmployees = results[0].data || [];
        var assignedIds = new Set((results[1].data || []).map(function (link) { return link.employee_id; }));
        var allNames = new Set(allEmployees.map(function (employee) { return employee.name; }).filter(Boolean));
        var assignedNames = allEmployees.filter(function (employee) { return assignedIds.has(employee.id); })
            .map(function (employee) { return employee.name; }).filter(Boolean);
        var assignedNameSet = new Set(assignedNames);

        var isWeekly = window.location.pathname.indexOf('wochenplan') !== -1;
        var key = isWeekly ? 'dienstplan_employees' : 'monatsplan_employees';
        var current = [];
        try { current = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}

        // Manuell im Plan angelegte Namen bleiben erhalten. Nur echte
        // Mitarbeiterdatensaetze fremder Standorte werden herausgefiltert.
        var next = current.filter(function (name) { return !allNames.has(name) || assignedNameSet.has(name); });
        assignedNames.forEach(function (name) { if (next.indexOf(name) === -1) next.push(name); });
        localStorage.setItem('shared_employees_' + context.locationId, JSON.stringify(next));

        var guard = 'orgashift_location_employees_reloaded:' + key + ':' + context.locationId;
        if (JSON.stringify(current) !== JSON.stringify(next)) {
            localStorage.setItem(key, JSON.stringify(next));
            localStorage.setItem('cloud_' + (isWeekly ? 'wochenplan' : 'monatsplan') + '_' + context.locationId + '_dirty', '1');
            if (!sessionStorage.getItem(guard)) {
                sessionStorage.setItem(guard, '1');
                window.location.reload();
            } else {
                sessionStorage.removeItem(guard);
            }
        } else sessionStorage.removeItem(guard);
    }

    init().catch(function (error) { console.warn('[location-employees] Synchronisierung fehlgeschlagen:', error); });
})();
