// js/employee-model.js - Rückwärtskompatible Mitarbeiter-ID-Registry
// Bestehende Plan-Snapshots bleiben namensbasiert; diese Registry ergänzt
// stabile IDs für eine spätere, kontrollierte Planmigration.
(function () {
    'use strict';
    var KEY = 'shared_employee_records';

    function read() {
        try {
            var value = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(value) ? value.filter(function (r) { return r && r.id && r.name; }) : [];
        } catch (_) { return []; }
    }

    function write(records) {
        localStorage.setItem(KEY, JSON.stringify(records));
        return records;
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return 'emp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function ensureNames(names) {
        var records = read(), changed = false;
        (Array.isArray(names) ? names : []).forEach(function (name) {
            if (!name || records.some(function (r) { return r.name === name; })) return;
            records.push({ id: createId(), name: String(name), source: 'local-plan' });
            changed = true;
        });
        return changed ? write(records) : records;
    }

    function syncRows(rows) {
        var records = read(), changed = false;
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
            if (!row || !row.name) return;
            var record = row.id && records.find(function (r) { return r.sourceId === row.id; });
            if (!record) record = records.find(function (r) { return r.name === row.name; });
            if (!record) {
                records.push({ id: row.id || createId(), name: String(row.name), source: 'supabase', sourceId: row.id || null });
                changed = true;
            } else if (record.name !== row.name || (row.id && record.sourceId !== row.id)) {
                record.name = String(row.name);
                record.source = 'supabase';
                record.sourceId = row.id || record.sourceId || null;
                changed = true;
            }
        });
        return changed ? write(records) : records;
    }

    function rename(oldName, newName) {
        var records = read(), changed = false;
        records.forEach(function (r) { if (r.name === oldName) { r.name = String(newName); changed = true; } });
        return changed ? write(records) : records;
    }

    function removeByName(name) {
        var records = read();
        var filtered = records.filter(function (r) { return r.name !== name; });
        return filtered.length !== records.length ? write(filtered) : records;
    }

    window.orgaEmployeeModel = { ensureNames, syncRows, rename, removeByName, getAll: read };
})();
