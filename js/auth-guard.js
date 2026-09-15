// js/auth-guard.js - Einheitlicher Session-/Rollen-Guard für geschützte Seiten
// Muss nach supabase-js eingebunden werden. Die bestehende Seitenlogik bleibt
// bewusst erhalten; der Guard ergänzt nur die Zugriffskontrolle im Frontend.
(function () {
    'use strict';

    var SUPA_URL = 'https://porfotcajsrjlilliwnx.supabase.co';
    var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcmZvdGNhanNyamxpbGxpd254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzkyMDQsImV4cCI6MjA5Njc1NTIwNH0.XdzS6sfUAzk4BK89QNhgyW3dLDdWrJyxCzcod514fCo';
    var client = window.sbClient || (window.supabase && window.supabase.createClient(SUPA_URL, SUPA_KEY));
    if (!client) return;
    window.sbClient = client;

    var path = window.location.pathname.toLowerCase();
    var adminPage = /(?:dashboardadmin|analytics|personal|wochenplan|monatsplan|urlauballe|urlaubma|hilfeadmin)\.html$/.test(path);
    var loginUrl = 'login.html?redirect=' + encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');

    client.auth.getSession().then(function (result) {
        var session = result && result.data && result.data.session;
        if (!session) {
            window.location.replace(loginUrl);
            return;
        }
        if (!adminPage) return;

        return client.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    }).then(function (result) {
        if (!adminPage || !result) return;
        if (result.error || !result.data || result.data.role !== 'admin') {
            window.location.replace('dashboarduser.html');
        }
    }).catch(function (error) {
        console.warn('[auth-guard] Zugriff konnte nicht geprüft werden:', error);
        window.location.replace(loginUrl);
    });
})();
