// js/account-scope.js - Lokale Plandaten pro Konto trennen
// ===================================================================
// Die Wochen-/Monatsplan-Daten und Mitarbeiterlisten liegen im
// localStorage und sind damit browserweit sichtbar – nicht kontoweit.
// Melden sich mehrere Konten (z. B. verschiedene Admins) im selben
// Browser an, würden sie gegenseitig ihre Daten sehen.
//
// Dieses Skript wird nach erfolgreicher Anmeldung aufgerufen
// (orgashiftScopeToUser(userId), VOR der Weiterleitung zum Dashboard):
//  - Wechselt das Konto, werden die kontogebundenen Schlüssel des
//    vorherigen Kontos unter "orgashift_stash:<userId>:…" geparkt.
//  - Geparkte Daten des neuen Kontos werden wiederhergestellt.
//  - Gehören vorhandene Daten keinem bekannten Konto (erster Login
//    nach diesem Update), werden sie entfernt, damit kein Konto
//    fremde Daten übernimmt.
// Browserweite Einstellungen wie das Theme bleiben unberührt.
// ===================================================================

(function () {
    'use strict';

    var ACTIVE_KEY = 'orgashift_active_user';
    var STASH_PREFIX = 'orgashift_stash:';

    var SCOPED_PREFIXES = ['dienstplan_', 'monatsplan_', 'shared_', 'cloud_'];
    var SCOPED_KEYS = ['jahresplaner_data', 'orgashift_employees'];

    function isScoped(key) {
        if (key.indexOf(STASH_PREFIX) === 0) return false;
        if (SCOPED_KEYS.indexOf(key) !== -1) return true;
        return SCOPED_PREFIXES.some(function (p) { return key.indexOf(p) === 0; });
    }

    function allKeys() {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        return keys;
    }

    window.orgashiftScopeToUser = function (userId) {
        if (!userId) return;
        try {
            var prev = localStorage.getItem(ACTIVE_KEY);
            if (prev === userId) return;

            allKeys().forEach(function (k) {
                if (!isScoped(k)) return;
                if (prev) {
                    localStorage.setItem(STASH_PREFIX + prev + ':' + k, localStorage.getItem(k));
                }
                localStorage.removeItem(k);
            });

            var restorePrefix = STASH_PREFIX + userId + ':';
            allKeys().forEach(function (k) {
                if (k.indexOf(restorePrefix) === 0) {
                    localStorage.setItem(k.slice(restorePrefix.length), localStorage.getItem(k));
                    localStorage.removeItem(k);
                }
            });

            localStorage.setItem(ACTIVE_KEY, userId);
        } catch (e) {
            console.warn('[account-scope] Kontowechsel-Bereinigung fehlgeschlagen:', e);
        }
    };
})();
