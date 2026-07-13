// js/cloud-plans.js - Cloud-Speicherung der Pläne in Supabase
// ===================================================================
// Speichert den Wochen-/Monatsplan als JSONB-Snapshot in der Tabelle
// "plans" (eine Zeile pro Organisation und Plantyp), sodass alle
// Admins einer Organisation auf dieselben Pläne zugreifen.
//
// Einbindung: am ENDE des <body>, NACH dem Inline-Script der Seite
// (damit saveDataToLocalStorage bereits definiert ist).
//
// Verhalten:
//  - Ohne Login oder im Free-Tarif passiert nichts (rein lokal).
//  - Beim Laden wird der Cloud-Stand geholt; ist er neuer als der
//    zuletzt übernommene, werden die localStorage-Keys ersetzt und
//    die Seite einmalig neu geladen. Liegen lokal ungespeicherte
//    Änderungen vor, wird vorher nachgefragt.
//  - Das Hochladen erfolgt BEWUSST über das Badge unten rechts
//    („☁ Änderungen speichern"). Lokale Änderungen markieren den
//    Plan nur als ungespeichert; beim Verlassen der Seite mit
//    ungespeicherten Änderungen warnt der Browser.
// ===================================================================

(function () {
    'use strict';

    var SUPA_URL = 'https://porfotcajsrjlilliwnx.supabase.co';
    var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcmZvdGNhanNyamxpbGxpd254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzkyMDQsImV4cCI6MjA5Njc1NTIwNH0.XdzS6sfUAzk4BK89QNhgyW3dLDdWrJyxCzcod514fCo';

    var isWochenplan = window.location.pathname.includes('wochenplan');
    var PLAN_TYPE = isWochenplan ? 'wochenplan' : 'monatsplan';
    var KEY_PREFIX = isWochenplan ? 'dienstplan_' : 'monatsplan_';
    var MARKER_KEY = 'cloud_' + PLAN_TYPE + '_synced_at';
    var DIRTY_KEY = 'cloud_' + PLAN_TYPE + '_dirty';
    var RELOAD_GUARD = 'cloud_' + PLAN_TYPE + '_reloaded';

    if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.warn('[cloud-plans] supabase-js nicht geladen – Cloud-Sync inaktiv.');
        return;
    }

    var sb = window.sbClient || supabase.createClient(SUPA_URL, SUPA_KEY);
    var orgId = null;
    var userId = null;
    var enabled = false;
    var saving = false;
    var badge = null;

    // ---------- Ungespeicherte Änderungen ----------
    function isDirty() { return localStorage.getItem(DIRTY_KEY) === '1'; }
    function setDirty(on) {
        if (on) localStorage.setItem(DIRTY_KEY, '1');
        else localStorage.removeItem(DIRTY_KEY);
    }

    // ---------- Status-Badge (bei Änderungen klickbar = Speichern-Button) ----------
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
        if (!enabled) return;
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

    // ---------- Cloud lesen (automatisch beim Öffnen) ----------
    function pullFromCloud() {
        return sb.from('plans')
            .select('data, updated_at')
            .eq('organization_id', orgId)
            .eq('plan_type', PLAN_TYPE)
            .maybeSingle()
            .then(function (res) {
                if (res.error) { console.warn('[cloud-plans] Laden fehlgeschlagen:', res.error.message); return; }

                if (!res.data) {
                    // Noch kein Cloud-Stand: vorhandene lokale Daten als speicherbar markieren
                    sessionStorage.removeItem(RELOAD_GUARD);
                    if (Object.keys(collectSnapshot()).length > 0) setDirty(true);
                    updateBadge();
                    return;
                }

                if (localStorage.getItem(MARKER_KEY) === res.data.updated_at) {
                    sessionStorage.removeItem(RELOAD_GUARD);
                    updateBadge();
                    return;
                }

                // Cloud ist neuer. Bei lokalen ungespeicherten Änderungen nachfragen.
                if (isDirty() && localStorage.getItem(MARKER_KEY)) {
                    var takeCloud = window.confirm(
                        'In der Cloud liegt eine neuere Version dieses Plans ' +
                        '(von einem anderen Admin oder Gerät gespeichert).\n\n' +
                        'OK = Cloud-Version laden (Ihre lokalen, nicht gespeicherten Änderungen gehen verloren)\n' +
                        'Abbrechen = lokale Version behalten (mit „Änderungen speichern" überschreiben Sie die Cloud-Version)'
                    );
                    if (!takeCloud) {
                        sessionStorage.removeItem(RELOAD_GUARD);
                        updateBadge();
                        return;
                    }
                }

                applySnapshot(res.data.data || {});
                localStorage.setItem(MARKER_KEY, res.data.updated_at);
                setDirty(false);

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

    // ---------- Cloud schreiben (nur über das Badge / manuell) ----------
    function pushToCloud() {
        if (!enabled || saving) return;
        saving = true;
        showBadge('☁ Speichert…', { muted: true });

        sb.from('plans')
            .upsert({
                organization_id: orgId,
                plan_type: PLAN_TYPE,
                data: collectSnapshot(),
                updated_by: userId
            }, { onConflict: 'organization_id,plan_type' })
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

    // saveDataToLocalStorage der Seite umhüllen: markiert nur als ungespeichert
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

    // Beim Verlassen mit ungespeicherten Änderungen warnen
    window.addEventListener('beforeunload', function (e) {
        if (enabled && isDirty()) {
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
            .select('organization_id, role, tier')
            .eq('id', userId)
            .single()
            .then(function (p) {
                if (p.error || !p.data) return null;
                return sb.from('tier_limits').select('can_cloud_save').eq('tier', p.data.tier).single()
                    .then(function (t) {
                        return {
                            organization_id: p.data.organization_id,
                            role: p.data.role,
                            can_cloud_save: !!(t.data && t.data.can_cloud_save)
                        };
                    });
            })
            .then(function (info) {
                if (!info || !info.organization_id) return;
                orgId = info.organization_id;

                if (!info.can_cloud_save) {
                    showBadge('☁ Nur lokal – Cloud-Speicherung ab Basic-Tarif', { muted: true });
                    return;
                }

                enabled = info.role === 'admin';
                if (!enabled) return;
                hookSave();
                return pullFromCloud();
            });
    }).catch(function (e) {
        console.warn('[cloud-plans] Initialisierung fehlgeschlagen:', e);
    });
})();
