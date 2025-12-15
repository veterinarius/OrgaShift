// ===================================================================
// MITARBEITER-SYNCHRONISIERUNG zwischen Wochenplan und Monatsplan
// ===================================================================
// Diese Datei sollte in beiden HTML-Dateien eingebunden werden,
// NACH dem Laden der Daten aus localStorage und VOR updateEmployeeList()

(function() {
    'use strict';
    
    // Gemeinsamer Schlüssel für synchronisierte Mitarbeiter
    const SHARED_EMPLOYEES_KEY = 'shared_employees';
    const SHARED_PREFERENCES_KEY = 'shared_preferences';
    
    // Erkenne, ob wir im Wochenplan oder Monatsplan sind
    const isWochenplan = window.location.pathname.includes('wochenplan');
    const isMonatsplan = window.location.pathname.includes('monatsplan');
    
    // Lokale Keys basierend auf dem Plan
    const LOCAL_EMPLOYEES_KEY = isWochenplan ? 'dienstplan_employees' : 'monatsplan_employees';
    const LOCAL_PREFERENCES_KEY = isWochenplan ? 'dienstplan_preferences' : 'monatsplan_preferences';
    
    /**
     * Synchronisiert Mitarbeiter aus dem lokalen Storage in den gemeinsamen Storage
     */
    function syncToShared() {
        try {
            // Hole lokale Daten
            const localEmployees = JSON.parse(localStorage.getItem(LOCAL_EMPLOYEES_KEY) || '[]');
            const localPreferences = JSON.parse(localStorage.getItem(LOCAL_PREFERENCES_KEY) || '{}');
            
            // Hole gemeinsame Daten
            let sharedEmployees = JSON.parse(localStorage.getItem(SHARED_EMPLOYEES_KEY) || '[]');
            let sharedPreferences = JSON.parse(localStorage.getItem(SHARED_PREFERENCES_KEY) || '{}');
            
            // Merge: Füge neue Mitarbeiter hinzu, die noch nicht im shared storage sind
            localEmployees.forEach(emp => {
                if (!sharedEmployees.includes(emp)) {
                    sharedEmployees.push(emp);
                }
            });
            
            // Merge Präferenzen (lokale Präferenzen haben Priorität)
            Object.keys(localPreferences).forEach(emp => {
                if (!sharedPreferences[emp]) {
                    sharedPreferences[emp] = localPreferences[emp];
                } else {
                    // Merge Präferenzen für existierende Mitarbeiter
                    sharedPreferences[emp] = {
                        ...sharedPreferences[emp],
                        ...localPreferences[emp]
                    };
                }
            });
            
            // Speichere gemeinsame Daten
            localStorage.setItem(SHARED_EMPLOYEES_KEY, JSON.stringify(sharedEmployees));
            localStorage.setItem(SHARED_PREFERENCES_KEY, JSON.stringify(sharedPreferences));
            
            console.log('✓ Mitarbeiter synchronisiert TO shared:', sharedEmployees.length);
        } catch (e) {
            console.error('Fehler beim Synchronisieren TO shared:', e);
        }
    }
    
    /**
     * Synchronisiert Mitarbeiter aus dem gemeinsamen Storage in den lokalen Storage
     */
    function syncFromShared() {
        try {
            // Hole gemeinsame Daten
            const sharedEmployees = JSON.parse(localStorage.getItem(SHARED_EMPLOYEES_KEY) || '[]');
            const sharedPreferences = JSON.parse(localStorage.getItem(SHARED_PREFERENCES_KEY) || '{}');
            
            // Hole lokale Daten
            let localEmployees = JSON.parse(localStorage.getItem(LOCAL_EMPLOYEES_KEY) || '[]');
            let localPreferences = JSON.parse(localStorage.getItem(LOCAL_PREFERENCES_KEY) || '{}');
            
            // Merge: Füge neue Mitarbeiter aus shared hinzu
            sharedEmployees.forEach(emp => {
                if (!localEmployees.includes(emp)) {
                    localEmployees.push(emp);
                }
            });
            
            // Merge Präferenzen (shared Präferenzen haben Priorität für neue Mitarbeiter)
            Object.keys(sharedPreferences).forEach(emp => {
                if (!localPreferences[emp]) {
                    localPreferences[emp] = sharedPreferences[emp];
                }
            });
            
            // Speichere lokale Daten
            localStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(localEmployees));
            localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(localPreferences));
            
            // Aktualisiere globale Variablen
            if (typeof window.employees !== 'undefined') {
                window.employees = localEmployees;
            }
            if (typeof window.preferences !== 'undefined') {
                window.preferences = localPreferences;
            }
            
            console.log('✓ Mitarbeiter synchronisiert FROM shared:', localEmployees.length);
        } catch (e) {
            console.error('Fehler beim Synchronisieren FROM shared:', e);
        }
    }
    
    /**
     * Überwacht Änderungen im localStorage (für Sync zwischen Tabs)
     */
    function setupStorageListener() {
        window.addEventListener('storage', function(e) {
            if (e.key === SHARED_EMPLOYEES_KEY || e.key === SHARED_PREFERENCES_KEY) {
                console.log('Storage-Änderung erkannt, synchronisiere...');
                syncFromShared();
                
                // Aktualisiere UI, wenn Funktion verfügbar
                if (typeof window.updateEmployeeList === 'function') {
                    window.updateEmployeeList();
                }
            }
        });
    }
    
    /**
     * Wrapper für addEmployee - synchronisiert nach dem Hinzufügen
     */
    function wrapAddEmployee() {
        const originalAddEmployee = window.addEmployee;
        if (originalAddEmployee) {
            window.addEmployee = function() {
                originalAddEmployee.apply(this, arguments);
                syncToShared();
            };
        }
    }
    
    /**
     * Wrapper für removeEmployee - synchronisiert nach dem Entfernen
     */
    function wrapRemoveEmployee() {
        const originalRemoveEmployee = window.removeEmployee;
        if (originalRemoveEmployee) {
            window.removeEmployee = function(employeeName) {
                originalRemoveEmployee.apply(this, arguments);
                
                // Entferne auch aus shared storage
                try {
                    let sharedEmployees = JSON.parse(localStorage.getItem(SHARED_EMPLOYEES_KEY) || '[]');
                    sharedEmployees = sharedEmployees.filter(emp => emp !== employeeName);
                    localStorage.setItem(SHARED_EMPLOYEES_KEY, JSON.stringify(sharedEmployees));
                    
                    let sharedPreferences = JSON.parse(localStorage.getItem(SHARED_PREFERENCES_KEY) || '{}');
                    delete sharedPreferences[employeeName];
                    localStorage.setItem(SHARED_PREFERENCES_KEY, JSON.stringify(sharedPreferences));
                } catch (e) {
                    console.error('Fehler beim Entfernen aus shared storage:', e);
                }
                
                syncToShared();
            };
        }
    }
    
    /**
     * Wrapper für saveDataToLocalStorage - synchronisiert nach dem Speichern
     */
    function wrapSaveData() {
        const originalSave = window.saveDataToLocalStorage;
        if (originalSave) {
            window.saveDataToLocalStorage = function() {
                originalSave.apply(this, arguments);
                syncToShared();
            };
        }
    }
    
    /**
     * Initialisierung der Synchronisierung
     */
    function initSync() {
        console.log('=== Mitarbeiter-Synchronisierung wird initialisiert ===');
        console.log('Plan-Typ:', isWochenplan ? 'Wochenplan' : (isMonatsplan ? 'Monatsplan' : 'Unbekannt'));
        
        // Erst FROM shared laden (um neue Mitarbeiter zu bekommen)
        syncFromShared();
        
        // Dann TO shared synchronisieren (um lokale Änderungen zu teilen)
        syncToShared();
        
        // Wrapper für Funktionen installieren
        wrapAddEmployee();
        wrapRemoveEmployee();
        wrapSaveData();
        
        // Storage-Listener einrichten
        setupStorageListener();
        
        console.log('✓ Synchronisierung aktiv');
    }
    
    // Initialisierung beim Laden der Seite
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSync);
    } else {
        initSync();
    }
    
    // Exportiere Funktionen für manuellen Aufruf
    window.employeeSync = {
        syncToShared: syncToShared,
        syncFromShared: syncFromShared,
        init: initSync
    };
    
})();

// ===================================================================
// INTEGRATION IN BESTEHENDE HTML-DATEIEN
// ===================================================================
// 
// Fügen Sie diese Zeile in BEIDE HTML-Dateien (wochenplan.html und monatsplan.html)
// direkt VOR dem schließenden </body>-Tag ein:
// 
// <script src="js/employee-sync.js"></script>
//
// ODER fügen Sie den obigen Code direkt in ein <script>-Tag ein,
// das VOR den bestehenden Skripten platziert wird.
// ===================================================================