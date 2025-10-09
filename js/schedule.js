// js/schedule.js - Dienstplan-Generierung und Anzeige

function generateSchedule() {
    const data = window.dienstplan;
    
    if (!data.startDate || !data.endDate) {
        showCustomAlert('Bitte wählen Sie Start- und Enddatum aus.');
        return;
    }
    if (data.employees.length === 0) {
        showCustomAlert('Bitte fügen Sie mindestens einen Mitarbeiter hinzu.');
        return;
    }
    
    const sortedEmployees = [...data.employees].sort((a, b) => {
        const aDr = a.toLowerCase().includes('dr.');
        const bDr = b.toLowerCase().includes('dr.');
        if (aDr && !bDr) return -1;
        if (!aDr && bDr) return 1;
        return 0;
    });
    
    const generatedSchedule = {};
    data.shiftNames.forEach((shift, sIdx) => {
        generatedSchedule[shift] = [];
        for (let row = 0; row < (data.rowCounts[sIdx] || 7); row++) {
            const weekSchedule = [];
            data.dayNames.forEach(() => weekSchedule.push(''));
            generatedSchedule[shift].push(weekSchedule);
        }
    });
    
    sortedEmployees.forEach(employee => {
        const employeePrefs = data.preferences[employee] || {};
        const shiftPreferences = {};
        
        data.shiftNames.forEach(shift => shiftPreferences[shift] = []);
        
        Object.keys(employeePrefs).forEach(day => {
            const dayPrefs = employeePrefs[day] || [];
            dayPrefs.forEach(shift => {
                if (shiftPreferences[shift]) {
                    shiftPreferences[shift].push(day);
                }
            });
        });
        
        Object.keys(shiftPreferences).forEach(shift => {
            const preferredDays = shiftPreferences[shift];
            if (preferredDays.length > 0) {
                preferredDays.forEach(day => {
                    const dayIndex = data.dayNames.indexOf(day);
                    if (dayIndex !== -1) {
                        for (let i = 0; i < generatedSchedule[shift].length; i++) {
                            if (!generatedSchedule[shift][i][dayIndex]) {
                                generatedSchedule[shift][i][dayIndex] = employee;
                                break;
                            }
                        }
                    }
                });
            }
        });
    });
    
    displayGeneratedScheduleUniversal(generatedSchedule);
    data.schedule = generatedSchedule;
    saveDataToLocalStorage();
    
    setTimeout(() => {
        addCellColorListeners();
        applyCellColors();
    }, 100);
    
    showCustomAlert('Dienstplan wurde erfolgreich generiert!');
}

function displayGeneratedScheduleUniversal(generatedSchedule) {
    const container = document.getElementById('schedule-container');
    container.innerHTML = '';
    const data = window.dienstplan;
    
    Object.keys(generatedSchedule).forEach((shift, sIdx) => {
        const shiftTitle = document.createElement('div');
        shiftTitle.className = 'table-title';
        shiftTitle.textContent = shift;
        container.appendChild(shiftTitle);
        
        const table = document.createElement('table');
        let tableHTML = `
            <thead>
                <tr>
                    <th>lfd. Nr. / Zeit</th>
                    ${data.dayNames.map(day => `<th>${day}</th>`).join('')}
                </tr>
            </thead>
            <tbody id="shiftBody_${sIdx}">
        `;
        
        generatedSchedule[shift].forEach((rowArr, index) => {
            tableHTML += `
                <tr>
                    <td class="row-number" contenteditable="true">${index + 1}</td>
                    ${rowArr.map((employee, i) => `<td contenteditable="true" style="white-space: pre-wrap; word-wrap: break-word;">${employee}</td>`).join('')}
                </tr>
            `;
        });
        
        tableHTML += '</tbody>';
        table.innerHTML = tableHTML;
        container.appendChild(table);
    });
}

function displaySchedule() {
    const container = document.getElementById('schedule-container');
    container.innerHTML = '';
    const data = window.dienstplan;
    
    data.shiftNames.forEach((shift, sIdx) => {
        const shiftTitle = document.createElement('div');
        shiftTitle.className = 'table-title';
        shiftTitle.textContent = shift;
        container.appendChild(shiftTitle);
        
        const table = document.createElement('table');
        let tableHTML = `
            <thead>
                <tr>
                    <th>lfd. Nr. / Zeit</th>
                    ${data.dayNames.map(day => `<th>${day}</th>`).join('')}
                </tr>
            </thead>
            <tbody id="shiftBody_${sIdx}">
                ${Array(data.rowCounts[sIdx] || 7).fill('').map((_, index) => `
                    <tr>
                        <td class="row-number" contenteditable="true">${index + 1}</td>
                        ${data.dayNames.map(() => `<td contenteditable="true" style="white-space: pre-wrap; word-wrap: break-word;"></td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        `;
        
        table.innerHTML = tableHTML;
        container.appendChild(table);
    });
    
    setTimeout(() => {
        addCellColorListeners();
        applyCellColors();
    }, 100);
}

function getTableData(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return [];
    
    const rows = tableBody.querySelectorAll('tr');
    const data = [];
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const rowData = [];
        cells.forEach(cell => {
            rowData.push(cell.textContent || '');
        });
        data.push(rowData);
    });
    
    return data;
}