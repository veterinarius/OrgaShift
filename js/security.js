// js/security.js - Kleine, frameworkfreie Sicherheitshelfer
// Wird von Seiten eingebunden, die Benutzerdaten in HTML-Templates rendern.
(function () {
    'use strict';

    window.orgaEscapeHtml = function (value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char];
        });
    };

    // Für bestehende Inline-Handler: Der Wert wird URL-kodiert und ist damit
    // unabhängig von Anführungszeichen/Zeilenumbrüchen im Mitarbeiternamen.
    window.orgaEncodeHandlerArg = function (value) {
        return encodeURIComponent(String(value == null ? '' : value))
            .replace(/'/g, '%27');
    };
})();
