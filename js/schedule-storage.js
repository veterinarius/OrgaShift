// js/schedule-storage.js - Gemeinsame, rückwärtskompatible Planpersistenz
(function () {
    'use strict';
    function read(key, fallback) {
        var value = localStorage.getItem(key);
        return value === null ? fallback : value;
    }
    function write(key, value) { localStorage.setItem(key, value == null ? '' : String(value)); }
    function readJson(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value === null || value === '' ? fallback : JSON.parse(value);
        } catch (_) { return fallback; }
    }
    function writeJson(key, value) { write(key, JSON.stringify(value)); }
    window.orgaScheduleStorage = { read: read, write: write, readJson: readJson, writeJson: writeJson };
})();
