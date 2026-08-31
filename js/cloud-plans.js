// js/cloud-plans.js - Cloud-Speicherung der Pläne in Supabase
// ===================================================================
// Speichert den Wochen-/Monatsplan als JSONB-Snapshot in der Tabelle
// "plans" (eine Zeile pro Organisation, Standort und Plantyp), sodass alle
// Admins einer Organisation auf dieselben Pläne zugreifen UND Mitarbeiter
// (Rolle "user") ihn lesend abrufen können – in jedem Tarif, denn ohne
// das könnten Mitarbeiter den vom Admin erstellten Plan nie sehen.
//
// Einbindung: am ENDE des <body>, NACH dem Inline-Script der Seite
// (damit saveDataToLocalStorage auf Admin-Seiten bereits definiert ist).
// Auf den *user.html-Seiten gibt es kein saveDataToLocalStorage – das ist
// unkritisch, siehe hookSave().
//
// Verhalten:
//  - Ohne Login passiert nichts (rein lokal).
//  - Admins: Beim Laden wird der Cloud-Stand geholt; ist er neuer als der
//    zuletzt übernommene, werden die localStorage-Keys ersetzt und die
//    Seite einmalig neu geladen. Liegen lokal ungespeicherte Änderungen
//    vor, wird vorher nachgefragt. Das Hochladen erfolgt BEWUSST über das
//    Badge unten rechts („☁ Änderungen speichern"). Lokale Änderungen
//    markieren den Plan nur als ungespeichert; beim Verlassen der Seite
//    mit ungespeicherten Änderungen warnt der Browser.
//  - Mitarbeiter (Rolle "user"): nur lesend – der Cloud-Stand wird beim
//    Laden übernommen (kein Badge, kein Speichern-Button, keine
//    Verlassen-Warnung), damit sie den vom Admin veröffentlichten Plan
//    sehen.
// ===================================================================

(function () {
    'use strict';

    var SUPA_URL = 'https://porfotcajsrjlilliwnx.supabase.co';
    var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcmZvdGNhanNyamxpbGxpd254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzkyMDQsImV4cCI6MjA5Njc1NTIwNH0.XdzS6sfUAzk4BK89QNhgyW3dLDdWrJyxCzcod514fCo';

    var isWochenplan = window.location.pathname.includes('wochenplan');
    var PLAN_TYPE = isWochenplan ? 'wochenplan' : 'monatsplan';
    var PLAN_LABEL = isWochenplan ? 'Wochenplan' : 'Monatsplan';
    var KEY_PREFIX = isWochenplan ? 'dienstplan_' : 'monatsplan_';
    var MARKER_KEY = 'cloud_' + PLAN_TYPE + '_synced_at';
    var DIRTY_KEY = 'cloud_' + PLAN_TYPE + '_dirty';
    var RELOAD_GUARD = 'cloud_' + PLAN_TYPE + '_reloaded';

    if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.warn('[cloud-plans] supabase-js nicht geladen – Cloud-Sync inaktiv.');
        return;
    }

    var sb = window.sbClient || supabase.createClient(SUPA_URL, SUPA_KEY);
    window.sbClient = sb; // anderen Skripten auf der Seite (z.B. Tarif-Limit-Prüfung) zugänglich machen
    var orgId = null;
    var locationId = null;
    var userId = null;
    var isAdmin = false; // steuert Schreibrechte (Badge/Speichern/Verlassen-Warnung)
    var saving = false;
    var badge = null;

    function setStorageScope() {
        var suffix = locationId ? '_' + locationId : '';
        MARKER_KEY = 'cloud_' + PLAN_TYPE + suffix + '_synced_at';
        DIRTY_KEY = 'cloud_' + PLAN_TYPE + suffix + '_dirty';
        RELOAD_GUARD = 'cloud_' + PLAN_TYPE + suffix + '_reloaded';
    }

    function withLocation(query) {
        return locationId ? query.eq('location_id', locationId) : query;
    }

    // ---------- Ungespeicherte Änderungen (nur relevant für Admins) ----------
    function isDirty() { return localStorage.getItem(DIRTY_KEY) === '1'; }
    function setDirty(on) {
        if (on) localStorage.setItem(DIRTY_KEY, '1');
        else localStorage.removeItem(DIRTY_KEY);
    }

    // ---------- Status-Badge (bei Änderungen klickbar = Speichern-Button) ----------
    // Wird nur für Admins angezeigt – Mitarbeiter haben keinen Speichern-Button.
    function showBadge(text, opts) {
        opts = opts || {};
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'cloudSyncBadge';
            badge.style.cssText =
                'position:fixed;bottom:14px;right:14px;z-index:9999;' +
                'padding:7px 14px;border-radius:16px;font:12px/1.4 -apple-system,sans-serif;' +
                'background:rgba(18,18,28,.85);color:#f0f0f5;box-shadow:0 2px 8px rgba(0,0,0,.35);' +
                'transition:opacity .3s;user-select:none;';
            badge.addEventListener('click', function () {
                if (badge.dataset.clickable === '1' && !saving) pushToCloud();
            });
            document.body.appendChild(badge);
        }
        badge.textContent = text;
        badge.style.opacity = opts.muted ? '0.55' : '1';
        badge.dataset.clickable = opts.clickable ? '1' : '0';
        badge.style.cursor = opts.clickable ? 'pointer' : 'default';
        badge.style.background = opts.clickable ? 'rgba(0,122,255,.92)' : 'rgba(18,18,28,.85)';
    }

    function updateBadge() {
        if (!isAdmin) return; // Mitarbeiter bekommen keinen Sync-Status angezeigt
        if (isDirty()) showBadge('☁ Änderungen speichern', { clickable: true });
        else showBadge('☁ Synchron', { muted: true });
    }

    // ---------- Snapshot-Helfer ----------
    function collectSnapshot() {
        var snap = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(KEY_PREFIX) === 0) snap[k] = localStorage.getItem(k);
        }
        return snap;
    }

    function applySnapshot(snap) {
        Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf(KEY_PREFIX) === 0 && !(k in snap)) localStorage.removeItem(k);
        });
        Object.keys(snap).forEach(function (k) {
            localStorage.setItem(k, snap[k]);
        });
    }

    // Enthält der Snapshot echten Planinhalt (befüllte Tabelle/Schichten)?
    function snapshotHasContent(snap) {
        return Object.keys(snap || {}).some(function (k) {
            if (!/(_tableData|_schedule)$/.test(k)) return false;
            var v = snap[k];
            return v && v !== '{}' && v !== '[]' && v !== 'null' && v !== '""';
        });
    }

    // Wert-für-Wert-Vergleich zweier Snapshots (Reihenfolge egal).
    function sameSnapshot(a, b) {
        a = a || {}; b = b || {};
        var ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        return ka.every(function (k) { return b[k] === a[k]; });
    }

    // Sichert den aktuellen lokalen Plan, bevor er durch Cloud-Daten ersetzt wird.
    function backupLocalPlan(reason) {
        if (!isAdmin) return null;
        if (window.orgaPlanBackups && typeof window.orgaPlanBackups.save === 'function') {
            return window.orgaPlanBackups.save([KEY_PREFIX], { reason: reason, locationId: locationId, planType: PLAN_TYPE });
        }
        return null;
    }

    // ---------- Cloud lesen (automatisch beim Öffnen, für Admins UND Mitarbeiter) ----------
    function pullFromCloud() {
        var query = sb.from('plans')
            .select('data, updated_at')
            .eq('organization_id', orgId)
            .eq('plan_type', PLAN_TYPE);
        return withLocation(query).maybeSingle()
            .then(function (res) {
                if (res.error) { console.warn('[cloud-plans] Laden fehlgeschlagen:', res.error.message); return; }

                if (!res.data) {
                    // Noch kein Cloud-Stand. Nur Admins können ihn erzeugen: vorhandene
                    // lokale Daten als speicherbar markieren. Mitarbeiter haben ohnehin
                    // keinen Speichern-Button, für sie gibt es hier nichts zu tun.
                    sessionStorage.removeItem(RELOAD_GUARD);
                    if (isAdmin && Object.keys(collectSnapshot()).length > 0) setDirty(true);
                    updateBadge();
                    return;
                }

                if (localStorage.getItem(MARKER_KEY) === res.data.updated_at) {
                    sessionStorage.removeItem(RELOAD_GUARD);
                    updateBadge();
                    return;
                }

                // Cloud unterscheidet sich vom zuletzt übernommenen Stand.
                var cloudData = res.data.data || {};
                var localSnap = collectSnapshot();
                var localHasContent = snapshotHasContent(localSnap);
                var neverSynced = !localStorage.getItem(MARKER_KEY);
                var contentDiffers = !sameSnapshot(localSnap, cloudData);

                // Würde lokaler Planinhalt überschrieben, wird er zuerst als
                // Backup gesichert – auch wenn (z.B. nach der Standort-Migration)
                // noch nie synchronisiert wurde und daher der Marker fehlt.
                if (isAdmin && localHasContent && contentDiffers) {
                    backupLocalPlan(neverSynced ? 'erste-cloud-sync' : 'cloud-abweichung');
                }

                // Nachfragen, bevor echter lokaler Planinhalt verworfen wird.
                if (isAdmin && localHasContent && contentDiffers && (isDirty() || neverSynced)) {
                    var takeCloud = window.confirm(
                        'Für „' + PLAN_LABEL + '" gibt es in der Cloud eine andere Version als lokal auf diesem Gerät.\n\n' +
                        'OK = Cloud-Version laden. Ihr lokaler Stand wurde als Backup gesichert – Wiederherstellen mit\n' +
                        '        window.orgaPlanBackups.list()  bzw.  window.orgaPlanBackups.restore("<key>")\n' +
                        'Abbrechen = lokale Version behalten und mit „☁ Änderungen speichern" in die Cloud übernehmen.'
                    );
                    if (!takeCloud) {
                        setDirty(true);
                        sessionStorage.removeItem(RELOAD_GUARD);
                        updateBadge();
                        return;
                    }
                }

                applySnapshot(cloudData);
                localStorage.setItem(MARKER_KEY, res.data.updated_at);
                setDirty(false);

                if (!isAdmin && isWochenplan) {
                    // Nur-Lese-Wochenansicht: sofort neu rendern statt hart neu zu laden,
                    // damit Wochen-Navigation und spätere Admin-Updates ohne F5 sichtbar werden.
                    sessionStorage.removeItem(RELOAD_GUARD);
                    window.dispatchEvent(new CustomEvent('cloud-plans:updated'));
                    updateBadge();
                    return;
                }

                // Einmalig neu laden, damit die Seite die Cloud-Daten übernimmt
                if (!sessionStorage.getItem(RELOAD_GUARD)) {
                    sessionStorage.setItem(RELOAD_GUARD, '1');
                    window.location.reload();
                } else {
                    sessionStorage.removeItem(RELOAD_GUARD);
                    updateBadge();
                }
            });
    }

    // Erlaubt Seiten (z.B. Wochennavigation), gezielt einen frischen Cloud-Stand
    // anzufordern, statt sich auf den einmaligen Pull beim Laden zu verlassen.
    window.__refreshCloudPlan = function () {
        if (!orgId) return Promise.resolve();
        return pullFromCloud();
    };

    // ---------- Cloud schreiben (nur Admins, über das Badge / manuell) ----------
    function pushToCloud() {
        if (!isAdmin || saving) return;
        saving = true;
        showBadge('☁ Speichert…', { muted: true });

        var row = {
                organization_id: orgId,
                plan_type: PLAN_TYPE,
                data: collectSnapshot(),
                updated_by: userId
            };
        if (locationId) row.location_id = locationId;
        sb.from('plans')
            .upsert(row, { onConflict: locationId ? 'organization_id,location_id,plan_type' : 'organization_id,plan_type' })
            .select('updated_at')
            .single()
            .then(function (res) {
                saving = false;
                if (res.error) {
                    console.warn('[cloud-plans] Speichern fehlgeschlagen:', res.error.message);
                    showBadge('☁ Fehler – erneut versuchen', { clickable: true });
                    return;
                }
                localStorage.setItem(MARKER_KEY, res.data.updated_at);
                setDirty(false);
                var t = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                showBadge('☁ Gespeichert ' + t, { muted: true });
            });
    }

    // saveDataToLocalStorage der Seite umhüllen: markiert nur als ungespeichert.
    // Auf den *user.html-Seiten existiert diese Funktion nicht (rein lesend) –
    // dann passiert hier nichts.
    function hookSave() {
        var original = window.saveDataToLocalStorage;
        if (typeof original !== 'function') return;
        window.saveDataToLocalStorage = function () {
            var result = original.apply(this, arguments);
            setDirty(true);
            updateBadge();
            return result;
        };
    }

    // Beim Verlassen mit ungespeicherten Änderungen warnen (nur Admins)
    window.addEventListener('beforeunload', function (e) {
        if (isAdmin && isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ---------- Initialisierung ----------
    sb.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return; // nicht eingeloggt → rein lokal

        userId = session.user.id;

        return sb.from('profiles')
            .select('organization_id, role')
            .eq('id', userId)
            .single()
            .then(function (p) {
                if (p.error || !p.data || !p.data.organization_id) return;

                orgId = p.data.organization_id;
                isAdmin = p.data.role === 'admin';

                var contextReady = window.OrgaShiftLocation
                    ? window.OrgaShiftLocation.ready
                    : Promise.resolve(null);
                return contextReady.then(function (context) {
                    locationId = context && context.locationId ? context.locationId : null;
                    setStorageScope();
                    if (isAdmin) hookSave();
                    return pullFromCloud();
                });
            });
    }).catch(function (e) {
        console.warn('[cloud-plans] Initialisierung fehlgeschlagen:', e);
    });
})();
