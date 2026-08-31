// Aktiven Standort + Abteilung je Organisation laden und seitenuebergreifend
// bereitstellen. Ohne eingespielte Standort-Migration bleibt locationId null
// (Legacy-Modus). Der Abteilungsfilter wirkt rein visuell (Seitenleiste +
// Auto-Generierung) und veraendert keine gespeicherten Plandaten.
(function () {
    'use strict';

    var state = {
        organizationId: null,
        locationId: null,
        locations: [],
        departmentId: null,            // null = "Alle Abteilungen"
        departments: [],
        departmentEmployeeNames: null, // Array der Namen in der aktiven Abteilung (oder null)
        allEmployeeNames: [],          // alle echten Mitarbeiternamen der Organisation
        legacy: true
    };
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });

    // Standardwert, damit Planseiten window.OrgaShiftDeptFilter jederzeit lesen koennen.
    window.OrgaShiftDeptFilter = { departmentId: null, names: null };

    // ─────────────────────────────────────────────────────────────────────────
    //  PLAN-BACKUPS
    //  Sichert Wochen-/Monatsplan-Daten aus dem localStorage, BEVOR sie
    //  ueberschrieben werden (Standortwechsel, "Cloud ist neuer"-Fall). Rein
    //  lokal je Browserprofil; hilft, versehentlich verlorene, nie in die Cloud
    //  gespeicherte Plaene zurueckzuholen. Konsole: window.orgaPlanBackups.list()
    // ─────────────────────────────────────────────────────────────────────────
    (function () {
        var BACKUP_PREFIX = 'orgashift_planbackup_';
        var MAX_BACKUPS = 8;

        function planKeys() {
            return Object.keys(localStorage).filter(function (k) { return k.indexOf(BACKUP_PREFIX) === 0; }).sort();
        }
        function prune(keep) {
            var keys = planKeys();
            while (keys.length > Math.max(0, keep)) localStorage.removeItem(keys.shift());
        }
        function hasContent(data) {
            return Object.keys(data).some(function (k) {
                if (!/(_tableData|_schedule)$/.test(k)) return false;
                var v = data[k];
                return v && v !== '{}' && v !== '[]' && v !== 'null' && v !== '""';
            });
        }

        window.orgaPlanBackups = {
            // prefixes: z.B. ['monatsplan_'] oder ['dienstplan_','monatsplan_']
            save: function (prefixes, meta) {
                prefixes = prefixes && prefixes.length ? prefixes : ['dienstplan_', 'monatsplan_'];
                meta = meta || {};
                var data = {};
                Object.keys(localStorage).forEach(function (k) {
                    if (prefixes.some(function (p) { return k.indexOf(p) === 0; })) data[k] = localStorage.getItem(k);
                });
                if (!hasContent(data)) return null;

                var key = BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') +
                    '_' + Math.random().toString(36).slice(2, 6);
                var payload = JSON.stringify({
                    saved_at: new Date().toISOString(),
                    reason: meta.reason || 'auto',
                    plan_type: meta.planType || null,
                    location_id: meta.locationId || null,
                    data: data
                });
                try {
                    localStorage.setItem(key, payload);
                } catch (e) {
                    prune(2);
                    try { localStorage.setItem(key, payload); } catch (_) { return null; }
                }
                prune(MAX_BACKUPS);
                console.info('[plan-backup] gesichert: ' + key +
                    ' (' + Object.keys(data).length + ' Schlüssel, Grund: ' + (meta.reason || 'auto') + ')');
                return key;
            },
            list: function () {
                return planKeys().map(function (k) {
                    var p = {};
                    try { p = JSON.parse(localStorage.getItem(k)) || {}; } catch (_) {}
                    return {
                        key: k,
                        saved_at: p.saved_at || null,
                        reason: p.reason || null,
                        plan_type: p.plan_type || null,
                        location_id: p.location_id || null,
                        keys: p.data ? Object.keys(p.data).length : 0,
                        bytes: (localStorage.getItem(k) || '').length
                    };
                });
            },
            peek: function (key) {
                try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
            },
            restore: function (key, opts) {
                opts = opts || {};
                var raw = localStorage.getItem(key);
                if (!raw) { console.warn('[plan-backup] nicht gefunden: ' + key); return false; }
                var p;
                try { p = JSON.parse(raw); } catch (_) { console.warn('[plan-backup] beschädigt: ' + key); return false; }
                if (!p || !p.data) { console.warn('[plan-backup] leer: ' + key); return false; }
                // Aktuellen Stand vor dem Zurückspielen sichern.
                this.save(Object.keys(p.data).map(function (k) { return k.split('_')[0] + '_'; })
                    .filter(function (v, i, a) { return a.indexOf(v) === i; }), { reason: 'vor-wiederherstellung' });
                Object.keys(p.data).forEach(function (k) { localStorage.setItem(k, p.data[k]); });
                console.info('[plan-backup] wiederhergestellt aus ' + key + (opts.reload === false ? '' : ' – Seite wird neu geladen.'));
                if (opts.reload !== false) window.location.reload();
                return true;
            },
            remove: function (key) { localStorage.removeItem(key); },
            clear: function () { planKeys().forEach(function (k) { localStorage.removeItem(k); }); }
        };
    })();

    function selectedKey(orgId) { return 'orgashift_active_location:' + orgId; }
    function departmentKey(orgId, locId) { return 'orgashift_active_department:' + orgId + ':' + locId; }

    function currentLocationName() {
        var loc = state.locations.find(function (l) { return l.id === state.locationId; });
        return loc ? loc.name : null;
    }
    function currentDepartmentName() {
        if (!state.departmentId) return 'Alle Abteilungen';
        var dep = state.departments.find(function (d) { return d.id === state.departmentId; });
        return dep ? dep.name : 'Alle Abteilungen';
    }

    // ── Theme-Farben ──
    // Planseiten schalten Light/Dark per <body class="light">, das Dashboard und
    // die Analytics-Seite dagegen per <html data-theme="light|dark">. Ohne die
    // zweite Prüfung bleibt das Standort-Dropdown dort im hellen Modus dunkel
    // ("schwarzes Menü").
    function themeColors() {
        var rootTheme = document.documentElement.getAttribute('data-theme');
        var light = rootTheme === 'light'
            || (rootTheme !== 'dark' && document.body.classList.contains('light'));
        return {
            bg:     light ? '#ffffff' : '#1b1b24',
            fg:     light ? '#1a1a2e' : '#f0f0f5',
            border: light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.20)'
        };
    }
    var navSelects = [];
    function paintSelect(select) {
        var c = themeColors();
        select.style.background = c.bg;
        select.style.color = c.fg;
        select.style.borderColor = c.border;
        for (var i = 0; i < select.options.length; i++) {
            select.options[i].style.background = c.bg;
            select.options[i].style.color = c.fg;
        }
    }
    function repaintNavSelects() { navSelects.forEach(paintSelect); }

    function navHost() {
        return document.querySelector('.nav-right') || document.querySelector('.nav-container');
    }

    function baseSelectCss() {
        return 'max-width:200px;padding:7px 10px;border-radius:10px;border:1px solid;font:inherit;cursor:pointer;';
    }

    function addLocationSelector() {
        if (state.locations.length < 2) return;
        var host = navHost();
        if (!host || document.getElementById('orgashiftLocationSelect')) return;

        var select = document.createElement('select');
        select.id = 'orgashiftLocationSelect';
        select.title = 'Aktiver Standort';
        select.setAttribute('aria-label', 'Aktiver Standort');
        select.style.cssText = baseSelectCss();
        state.locations.forEach(function (location) {
            var option = document.createElement('option');
            option.value = location.id;
            option.textContent = '📍 ' + location.name;
            option.selected = location.id === state.locationId;
            select.appendChild(option);
        });
        select.addEventListener('change', function () {
            var currentId = state.locationId;
            var hasDirtyPlan = ['wochenplan', 'monatsplan'].some(function (type) {
                return localStorage.getItem('cloud_' + type + '_' + currentId + '_dirty') === '1';
            });
            if (hasDirtyPlan && !window.confirm(
                'Für diesen Standort gibt es ungespeicherte Planänderungen.\n\n' +
                'Standort trotzdem wechseln? Die lokalen Änderungen werden vorher als Backup ' +
                'gesichert (Wiederherstellen mit window.orgaPlanBackups.list()), aber nicht in die Cloud übernommen.')) {
                select.value = currentId;
                return;
            }
            // Lokale Plandaten vor dem Verwerfen sichern.
            if (window.orgaPlanBackups) {
                window.orgaPlanBackups.save(['dienstplan_', 'monatsplan_'], {
                    reason: 'standortwechsel', locationId: currentId
                });
            }
            Object.keys(localStorage).forEach(function (key) {
                if (key.indexOf('dienstplan_') === 0 || key.indexOf('monatsplan_') === 0) localStorage.removeItem(key);
            });
            localStorage.setItem(selectedKey(state.organizationId), select.value);
            window.location.reload();
        });
        host.insertBefore(select, host.firstChild);
        navSelects.push(select);
        paintSelect(select);
    }

    function addDepartmentSelector() {
        // Nur auf den Planseiten mit Mitarbeiterliste anbieten.
        if (!document.getElementById('employeeList')) return;
        if (state.departments.length < 2) return;
        var host = navHost();
        if (!host || document.getElementById('orgashiftDepartmentSelect')) return;

        var select = document.createElement('select');
        select.id = 'orgashiftDepartmentSelect';
        select.title = 'Abteilungsfilter';
        select.setAttribute('aria-label', 'Abteilungsfilter');
        select.style.cssText = baseSelectCss();

        var allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = '🗂️ Alle Abteilungen';
        allOpt.selected = !state.departmentId;
        select.appendChild(allOpt);

        state.departments.forEach(function (dep) {
            var option = document.createElement('option');
            option.value = dep.id;
            option.textContent = '🗂️ ' + dep.name;
            option.selected = dep.id === state.departmentId;
            select.appendChild(option);
        });

        select.addEventListener('change', function () {
            var value = select.value || '';
            // Tages-/Zellendaten bleiben erhalten – nur die Mitarbeiteransicht und
            // die Auto-Generierung richten sich nach dem Reload neu aus.
            localStorage.setItem(departmentKey(state.organizationId, state.locationId), value);
            window.location.reload();
        });

        var anchor = document.getElementById('orgashiftLocationSelect');
        if (anchor && anchor.parentNode === host) host.insertBefore(select, anchor.nextSibling);
        else host.insertBefore(select, host.firstChild);
        navSelects.push(select);
        paintSelect(select);
    }

    function updateContextBar() {
        var bar = document.getElementById('planContextBar');
        if (!bar) return;
        var locName = currentLocationName();
        if (state.legacy || !locName) { bar.hidden = true; return; }
        var locEl = document.getElementById('pcbLocation');
        var depEl = document.getElementById('pcbDepartment');
        if (locEl) locEl.textContent = locName;
        if (depEl) depEl.textContent = currentDepartmentName();
        bar.hidden = false;
    }

    function renderContext() {
        addLocationSelector();
        addDepartmentSelector();
        updateContextBar();

        var themeBtn = document.querySelector('.theme-toggle, #themeToggleBtn, #themeToggle');
        if (themeBtn && !themeBtn._orgashiftLocationHook) {
            themeBtn._orgashiftLocationHook = true;
            themeBtn.addEventListener('click', function () { setTimeout(repaintNavSelects, 0); });
        }
    }

    async function loadDepartments(client) {
        state.departments = [];
        state.departmentId = null;
        if (!state.locationId) return;
        var result = await client.from('departments')
            .select('id,name,location_id,is_active')
            .eq('organization_id', state.organizationId)
            .eq('location_id', state.locationId)
            .eq('is_active', true)
            .order('name');
        if (result.error) {
            console.info('[location-context] Abteilungstabelle noch nicht verfuegbar.');
            return;
        }
        state.departments = result.data || [];
        var stored = localStorage.getItem(departmentKey(state.organizationId, state.locationId));
        var match = stored && state.departments.find(function (d) { return d.id === stored; });
        state.departmentId = match ? match.id : null;
    }

    async function loadDepartmentMembers(client) {
        state.departmentEmployeeNames = null;
        window.OrgaShiftDeptFilter = { departmentId: state.departmentId, names: null };
        if (!state.departmentId) return;

        // Alle echten Mitarbeiternamen der Organisation – frei eingetippte Namen
        // im Plan werden dadurch nie ausgeblendet.
        var allRes = await client.from('employees').select('name')
            .eq('organization_id', state.organizationId);
        if (!allRes.error) {
            state.allEmployeeNames = (allRes.data || [])
                .map(function (e) { return e.name; }).filter(Boolean);
        }

        var names = [];
        var joined = await client.from('employee_departments')
            .select('employees(name)')
            .eq('organization_id', state.organizationId)
            .eq('department_id', state.departmentId);
        if (!joined.error && joined.data) {
            names = joined.data.map(function (r) { return r.employees && r.employees.name; }).filter(Boolean);
        } else {
            // Fallback ohne eingebettete Relation.
            var link = await client.from('employee_departments').select('employee_id')
                .eq('organization_id', state.organizationId).eq('department_id', state.departmentId);
            var ids = (!link.error && link.data ? link.data : []).map(function (x) { return x.employee_id; });
            if (ids.length) {
                var emps = await client.from('employees').select('name').in('id', ids);
                names = (!emps.error && emps.data ? emps.data : [])
                    .map(function (e) { return e.name; }).filter(Boolean);
            }
        }
        state.departmentEmployeeNames = names;
        window.OrgaShiftDeptFilter = { departmentId: state.departmentId, names: new Set(names) };
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

            await loadDepartments(client);
            await loadDepartmentMembers(client);
            renderContext();
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
        getLocations: function () { return state.locations.slice(); },
        getActiveDepartmentId: function () { return state.departmentId; },
        getDepartments: function () { return state.departments.slice(); },
        getDepartmentEmployeeNames: function () {
            return state.departmentEmployeeNames ? state.departmentEmployeeNames.slice() : null;
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
