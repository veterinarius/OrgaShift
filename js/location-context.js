// Aktiven Standort je Organisation laden und seitenuebergreifend bereitstellen.
// Ohne eingespielte Standort-Migration bleibt locationId null (Legacy-Modus).
(function () {
    'use strict';

    var state = { organizationId: null, locationId: null, locations: [], legacy: true };
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });

    function selectedKey(orgId) { return 'orgashift_active_location:' + orgId; }

    function addSelector() {
        if (state.locations.length < 2) return;
        var host = document.querySelector('.nav-right') || document.querySelector('.nav-container');
        if (!host || document.getElementById('orgashiftLocationSelect')) return;

        var select = document.createElement('select');
        select.id = 'orgashiftLocationSelect';
        select.title = 'Aktiver Standort';
        select.setAttribute('aria-label', 'Aktiver Standort');
        select.style.cssText = 'max-width:180px;padding:7px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.3);background:var(--card-bg,#171717);color:inherit;font:inherit;';
        state.locations.forEach(function (location) {
            var option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            option.selected = location.id === state.locationId;
            select.appendChild(option);
        });
        select.addEventListener('change', function () {
            var currentId = state.locationId;
            var hasDirtyPlan = ['wochenplan', 'monatsplan'].some(function (type) {
                return localStorage.getItem('cloud_' + type + '_' + currentId + '_dirty') === '1';
            });
            if (hasDirtyPlan && !window.confirm('Für diesen Standort gibt es ungespeicherte Planänderungen. Standort trotzdem wechseln und lokale Änderungen verwerfen?')) {
                select.value = currentId;
                return;
            }
            Object.keys(localStorage).forEach(function (key) {
                if (key.indexOf('dienstplan_') === 0 || key.indexOf('monatsplan_') === 0) localStorage.removeItem(key);
            });
            localStorage.setItem(selectedKey(state.organizationId), select.value);
            window.location.reload();
        });
        host.insertBefore(select, host.firstChild);
    }

    async function init() {
        try {
            var client = window.sbClient;
            if (!client && typeof sbClient !== 'undefined') client = sbClient;
            if (!client && typeof supabase !== 'undefined' && supabase.createClient) {
                client = supabase.createClient(
                    'https://porfotcajsrjlilliwnx.supabase.co',
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcmZvdGNhanNyamxpbGxpd254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzkyMDQsImV4cCI6MjA5Njc1NTIwNH0.XdzS6sfUAzk4BK89QNhgyW3dLDdWrJyxCzcod514fCo'
                );
            }
            if (!client) return;
            window.sbClient = client;
            var sessionResult = await client.auth.getSession();
            var session = sessionResult.data && sessionResult.data.session;
            if (!session) return;
            var profileResult = await client.from('profiles')
                .select('organization_id,role').eq('id', session.user.id).maybeSingle();
            state.organizationId = profileResult.data && profileResult.data.organization_id;
            if (!state.organizationId) return;

            var allowedLocationIds = null;
            if (profileResult.data.role !== 'admin') {
                var employeeResult = await client.from('employees').select('id')
                    .eq('employee_auth_id', session.user.id).maybeSingle();
                if (employeeResult.data) {
                    var linkResult = await client.from('employee_locations').select('location_id')
                        .eq('employee_id', employeeResult.data.id);
                    if (!linkResult.error) allowedLocationIds = (linkResult.data || []).map(function (link) { return link.location_id; });
                }
            }

            var locationQuery = client.from('locations')
                .select('id,name,is_active').eq('organization_id', state.organizationId)
                .eq('is_active', true).order('name');
            if (allowedLocationIds) {
                if (!allowedLocationIds.length) { state.legacy = false; return; }
                locationQuery = locationQuery.in('id', allowedLocationIds);
            }
            var locationResult = await locationQuery;
            if (locationResult.error) {
                console.info('[location-context] Standorttabellen noch nicht verfuegbar; Legacy-Modus aktiv.');
                return;
            }
            state.locations = locationResult.data || [];
            state.legacy = false;
            if (!state.locations.length) return;
            var stored = localStorage.getItem(selectedKey(state.organizationId));
            var selected = state.locations.find(function (location) { return location.id === stored; });
            state.locationId = (selected || state.locations[0]).id;
            localStorage.setItem(selectedKey(state.organizationId), state.locationId);
            addSelector();
        } catch (error) {
            console.warn('[location-context] Initialisierung fehlgeschlagen:', error);
        } finally {
            resolveReady(state);
            window.dispatchEvent(new CustomEvent('orgashift:location-ready', { detail: state }));
        }
    }

    window.OrgaShiftLocation = {
        ready: ready,
        getState: function () { return state; },
        getActiveLocationId: function () { return state.locationId; },
        getLocations: function () { return state.locations.slice(); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
