// js/storage.js - LocalStorage Verwaltung

function saveDataToLocalStorage() {
    const data = window.dienstplan;
    localStorage.setItem(STORAGE_KEYS.employees, JSON.stringify(data.employees));
    localStorage.setItem(STORAGE_KEYS.constraints, JSON.stringify(data.constraints));
    localStorage.setItem(STORAGE_KEYS.schedule, JSON.stringify(data.schedule));
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(data.preferences));
    localStorage.setItem(STORAGE_KEYS.startDate, data.startDate ? data.startDate.toISOString() : '');
    localStorage.setItem(STORAGE_KEYS.endDate, data.endDate ? data.endDate.toISOString() : '');
    localStorage.setItem(STORAGE_KEYS.shiftNames, JSON.stringify(data.shiftNames));
    localStorage.setItem(STORAGE_KEYS.dayNames, JSON.stringify(data.dayNames));
    localStorage.setItem(STORAGE_KEYS.rowCounts, JSON.stringify(data.rowCounts));
    
    // Speichere Tabellendaten
    const tableData = {};
    data.shiftNames.forEach((shift, sIdx) => {
        const tbody = document.getElementById(`shiftBody_${sIdx}`);
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            tableData[shift] = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const rowData = [];
                cells.forEach(cell => {
                    rowData.push(cell.textContent || '');
                });
                tableData[shift].push(rowData);
            });
        }
    });
    localStorage.setItem(STORAGE_KEYS.tableData, JSON.stringify(tableData));
}

function loadDataFromLocalStorage() {
    const data = window.dienstplan;
    
    // Lade Basis-Konfiguration
    const savedShifts = localStorage.getItem(STORAGE_KEYS.shiftNames);
    const savedDays = localStorage.getItem(STORAGE_KEYS.dayNames);
    const savedRowCounts = localStorage.getItem(STORAGE_KEYS.rowCounts);
    
    if (savedShifts && savedDays) {
        data.shiftNames = JSON.parse(savedShifts);
        data.dayNames = JSON.parse(savedDays);
        data.rowCounts = savedRowCounts ? JSON.parse(savedRowCounts) : data.shiftNames.map(() => 7);
        
        if (data.rowCounts.length < data.shiftNames.length) {
            for (let i = data.rowCounts.length; i < data.shiftNames.length; i++) {
                data.rowCounts.push(7);
            }
        }
    } else {
        data.shiftNames = ['Schicht 1', 'Schicht 2'];
        data.dayNames = ['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5'];
        data.rowCounts = [7, 7];
    }
    
    // Lade andere Daten
    const savedEmployees = localStorage.getItem(STORAGE_KEYS.employees);
    if (savedEmployees) {
        data.employees = JSON.parse(savedEmployees);
    }
    
    const savedPreferences = localStorage.getItem(STORAGE_KEYS.preferences);
    if (savedPreferences) {
        data.preferences = JSON.parse(savedPreferences);
    }
    
    const savedSchedule = localStorage.getItem(STORAGE_KEYS.schedule);
    if (savedSchedule) {
        data.schedule = JSON.parse(savedSchedule);
    }
    
    const savedStartDate = localStorage.getItem(STORAGE_KEYS.startDate);
    if (savedStartDate) {
        data.startDate = new Date(savedStartDate);
        document.getElementById('startDate').value = data.startDate.toISOString().split('T')[0];
    }
    
    const savedEndDate = localStorage.getItem(STORAGE_KEYS.endDate);
    if (savedEndDate) {
        data.endDate = new Date(savedEndDate);
        document.getElementById('endDate').value = data.endDate.toISOString().split('T')[0];
    }
    
    const savedRemarks = localStorage.getItem(STORAGE_KEYS.remarks);
    const remarksInput = document.getElementById('remarks-input');
    if (savedRemarks && remarksInput) {
        remarksInput.value = savedRemarks;
    }
}

function loadTableData() {
    const savedTableData = localStorage.getItem(STORAGE_KEYS.tableData);
    if (savedTableData) {
        const tableData = JSON.parse(savedTableData);
        Object.keys(tableData).forEach((shift, sIdx) => {
            const tbody = document.getElementById(`shiftBody_${sIdx}`);
            if (tbody) {
                const rows = tbody.querySelectorAll('tr');
                const shiftData = tableData[shift];
                rows.forEach((row, rowIndex) => {
                    if (shiftData[rowIndex]) {
                        const cells = row.querySelectorAll('td');
                        cells.forEach((cell, cellIndex) => {
                            if (shiftData[rowIndex][cellIndex]) {
                                cell.textContent = shiftData[rowIndex][cellIndex];
                            }
                        });
                    }
                });
            }
        });
    }
}

function saveRemarks() {
    const remarksInput = document.getElementById('remarks-input');
    if (remarksInput) {
        localStorage.setItem(STORAGE_KEYS.remarks, remarksInput.value);
    }
}