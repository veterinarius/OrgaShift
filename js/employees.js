// js/employees.js - Mitarbeiterverwaltung

function addEmployee() {
    const input = document.getElementById('employeeName');
    const name = input.value.trim();
    if (name) {
        window.dienstplan.employees.push(name);
        window.dienstplan.preferences[name] = {};
        input.value = '';
        updateEmployeeList();
        displaySchedule();
        saveDataToLocalStorage();
    }
}

function removeEmployee(employeeName) {
    const data = window.dienstplan;
    data.employees = data.employees.filter(emp => emp !== employeeName);
    delete data.preferences[employeeName];
    updateEmployeeList();
    displaySchedule();
    saveDataToLocalStorage();
}

function editEmployeeName(oldName) {
    const container = document.getElementById('employeeList');
    const tag = Array.from(container.children).find(div => div.dataset.employee === oldName);
    if (!tag) return;
    
    const span = tag.querySelector('.employee-name-span');
    if (!span) return;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.minWidth = '120px';
    input.style.fontSize = '14px';
    input.style.borderRadius = '8px';
    input.style.padding = '4px 8px';
    input.style.marginRight = '8px';
    
    span.replaceWith(input);
    input.focus();
    input.select();
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            input.blur();
        }
    });
    
    input.addEventListener('blur', function() {
        const newName = input.value.trim();
        if (!newName || newName === oldName) {
            updateEmployeeList();
            return;
        }
        
        const data = window.dienstplan;
        // Im employees-Array ersetzen
        const idx = data.employees.indexOf(oldName);
        if (idx !== -1) data.employees[idx] = newName;
        
        // In Präferenzen ersetzen
        if (data.preferences[oldName]) {
            data.preferences[newName] = data.preferences[oldName];
            delete data.preferences[oldName];
        }
        
        // In Zusatzpräferenzen ersetzen
        Object.keys(data.preferences).forEach(emp => {
            if (data.preferences[emp] && data.preferences[emp].extra) {
                data.preferences[emp].extra.forEach(e => {
                    if (e.employee === oldName) e.employee = newName;
                });
            }
        });
        
        // In der Tabelle ersetzen
        document.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
            if (cell.textContent.trim() === oldName) {
                cell.textContent = newName;
            }
        });
        
        saveDataToLocalStorage();
        updateEmployeeList();
    });
}

function updateEmployeeList() {
    const container = document.getElementById('employeeList');
    container.innerHTML = '';
    
    const data = window.dienstplan;
    const sortedEmployees = [...data.employees].sort((a, b) => {
        const aDr = a.toLowerCase().includes('dr.');
        const bDr = b.toLowerCase().includes('dr.');
        if (aDr && !bDr) return -1;
        if (!aDr && bDr) return 1;
        return 0;
    });
    
    sortedEmployees.forEach(employee => {
        const tag = document.createElement('div');
        tag.className = 'employee-tag';
        tag.draggable = true;
        tag.dataset.employee = employee;
        
        if (employee.includes('Dr.')) {
            tag.style.backgroundColor = '#e3f2fd';
            tag.style.borderColor = '#2196f3';
        } else {
            tag.style.backgroundColor = '#e8f5e8';
            tag.style.borderColor = '#4caf50';
        }
        
        const prefs = data.preferences[employee] || {};
        let prefCount = 0;
        Object.entries(prefs).forEach(([key, dayPrefs]) => {
            if (key !== 'extra' && Array.isArray(dayPrefs) && dayPrefs.length > 0 && data.dayNames.includes(key)) {
                prefCount += dayPrefs.length;
            }
        });
        
        const editButton = `<button onclick="editEmployeeName('${employee}')" title="Mitarbeitername bearbeiten">✏️</button>`;
        const prefButton = prefCount > 0 ? 
            `<button onclick="showPreferences('${employee}')" title="Präferenzen bearbeiten">⚙️ (${prefCount})</button>` :
            `<button onclick="showPreferences('${employee}')" title="Präferenzen bearbeiten">⚙️</button>`;
        
        tag.innerHTML = `
            <span class="employee-name-span">${employee}</span>
            ${editButton}
            ${prefButton}
            <button onclick="removeEmployee('${employee}')" title="Mitarbeiter entfernen">✕</button>
        `;
        
        // Drag & Drop Event Listeners
        tag.addEventListener('dragstart', handleDragStart);
        tag.addEventListener('dragend', handleDragEnd);
        tag.addEventListener('dragover', handleDragOver);
        tag.addEventListener('drop', handleDrop);
        tag.addEventListener('dragenter', handleDragEnter);
        tag.addEventListener('dragleave', handleDragLeave);
        
        container.appendChild(tag);
    });
    
    updateExtraPrefEmployeeSelect();
    displayExtraPreferences();
}

// Drag & Drop Funktionen
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.employee);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.employee-tag').forEach(tag => {
        tag.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const draggedEmployee = e.dataTransfer.getData('text/plain');
    const targetEmployee = e.target.closest('.employee-tag')?.dataset.employee;
    
    if (draggedEmployee && targetEmployee && draggedEmployee !== targetEmployee) {
        const data = window.dienstplan;
        const draggedIndex = data.employees.indexOf(draggedEmployee);
        const targetIndex = data.employees.indexOf(targetEmployee);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            [data.employees[draggedIndex], data.employees[targetIndex]] = [data.employees[targetIndex], data.employees[draggedIndex]];
            updateEmployeeList();
            saveDataToLocalStorage();
        }
    }
}

function handleDragEnter(e) {
    e.preventDefault();
    e.target.closest('.employee-tag')?.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.target.closest('.employee-tag')?.classList.remove('drag-over');
}