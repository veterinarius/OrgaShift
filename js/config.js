// js/config.js - Globale Konfiguration und Konstanten

// Globale Variablen
window.dienstplan = {
    employees: [],
    constraints: {},
    schedule: {},
    preferences: {},
    startDate: null,
    endDate: null,
    shiftNames: [],
    dayNames: [],
    rowCounts: []
};

// Konstanten
const STORAGE_KEYS = {
    employees: 'dienstplan_employees',
    constraints: 'dienstplan_constraints',
    schedule: 'dienstplan_schedule',
    preferences: 'dienstplan_preferences',
    startDate: 'dienstplan_startDate',
    endDate: 'dienstplan_endDate',
    shiftNames: 'dienstplan_shiftNames',
    dayNames: 'dienstplan_dayNames',
    rowCounts: 'dienstplan_rowCounts',
    tableData: 'dienstplan_tableData',
    remarks: 'dienstplan_remarks',
    mainTitle: 'dienstplan_mainTitle',
    singleCellColor: 'dienstplan_single_cell_color',
    employeeCellColors: 'dienstplan_employee_cell_colors'
};

const ALL_WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const COLOR_MAP = {
    '#ffe082': 'FFFFD54F', // Gelb
    '#b2dfdb': 'FFB2DFDB', // Türkis
    '#c5e1a5': 'FFC5E1A5', // Grün
    '#ffab91': 'FFFFAB91', // Orange
    '#b39ddb': 'FFB39DDB', // Lila
    '#90caf9': 'FF90CAF9', // Blau
    '#ef9a9a': 'FFEF9A9A', // Rot
    '#e3f2fd': 'FFE3F2FD', // Hellblau
    '#e8f5e8': 'FFE8F5E8'  // Hellgrün
};