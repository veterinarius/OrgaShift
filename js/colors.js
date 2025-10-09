// js/colors.js - Zellfarben-Verwaltung

let currentCell = null;

function getCellKey(cell) {
    let tbody = cell.closest('tbody');
    const tbodyId = tbody && tbody.id ? tbody.id : '';
    const row = cell.parentElement ? Array.from(cell.parentElement.parentElement.children).indexOf(cell.parentElement) : 0;
    const col = Array.from(cell.parentElement.children).indexOf(cell);
    return `${tbodyId}_${row}_${col}`;
}

function showContextMenu(e, cell) {
    e.preventDefault();
    currentCell = cell;
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'none';
    currentCell = null;
}

function setCellColor(cell, color) {
    const isEmployeeCell = cell.cellIndex > 0;
    
    if (isEmployeeCell) {
        if (color !== '#ffffff') {
            const key = getCellKey(cell);
            let employeeColors = {};
            try {
                employeeColors = JSON.parse(localStorage.getItem(STORAGE_KEYS.employeeCellColors) || '{}');
            } catch (e) { employeeColors = {}; }
            employeeColors[key] = color;
            localStorage.setItem(STORAGE_KEYS.employeeCellColors, JSON.stringify(employeeColors));
            cell.style.backgroundColor = color;
        } else {
            const key = getCellKey(cell);
            let employeeColors = {};
            try {
                employeeColors = JSON.parse(localStorage.getItem(STORAGE_KEYS.employeeCellColors) || '{}');
            } catch (e) { employeeColors = {}; }
            delete employeeColors[key];
            localStorage.setItem(STORAGE_KEYS.employeeCellColors, JSON.stringify(employeeColors));
            cell.style.backgroundColor = '';
        }
    } else {
        if (color !== '#ffffff') {
            cell.style.backgroundColor = color;
            const key = getCellKey(cell);
            localStorage.setItem(STORAGE_KEYS.singleCellColor, JSON.stringify({ key, color }));
        } else {
            localStorage.removeItem(STORAGE_KEYS.singleCellColor);
        }
    }
}

function applyCellColors() {
    document.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.style.backgroundColor = '';
    });
    
    let employeeColors = {};
    try {
        employeeColors = JSON.parse(localStorage.getItem(STORAGE_KEYS.employeeCellColors) || '{}');
    } catch (e) { employeeColors = {}; }
    
    Object.keys(employeeColors).forEach(key => {
        document.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
            if (getCellKey(cell) === key && cell.cellIndex > 0) {
                cell.style.backgroundColor = employeeColors[key];
            }
        });
    });
    
    let data = null;
    try {
        data = JSON.parse(localStorage.getItem(STORAGE_KEYS.singleCellColor) || 'null');
    } catch (e) { data = null; }
    if (data && data.key && data.color) {
        document.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
            if (getCellKey(cell) === data.key && cell.cellIndex === 0) {
                cell.style.backgroundColor = data.color;
            }
        });
    }
}

function addCellColorListeners() {
    document.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('contextmenu', function(e) {
            showContextMenu(e, cell);
        });
    });
}

function initializeColorListeners() {
    document.getElementById('context-menu').addEventListener('click', function(e) {
        const swatch = e.target.closest('.color-swatch');
        if (swatch && currentCell) {
            setCellColor(currentCell, swatch.dataset.color);
            hideContextMenu();
        }
    });
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#context-menu')) {
            hideContextMenu();
        }
    });
    
    window.addEventListener('scroll', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') hideContextMenu();
    });
}