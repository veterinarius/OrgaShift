(function () {
    'use strict';

    var routesByRole = {
        admin: [
            'dashboardadmin.html',
            'analytics.html',
            'personal.html',
            'wochenplan.html',
            'monatsplan.html',
            'urlaubALLE.html',
            'urlaubMA.html',
            'standorte.html',
            'hilfeadmin.html'
        ],
        user: [
            'dashboarduser.html',
            'wochenplanuser.html',
            'monatsplanuser.html',
            'urlaubUSER.html',
            'hilfeuser.html'
        ]
    };

    function fallbackForRole(role) {
        return role === 'admin' ? 'dashboardadmin.html' : 'dashboarduser.html';
    }

    function forRole(role, requestedRoute) {
        var normalizedRole = role === 'admin' ? 'admin' : 'user';
        var allowedRoutes = routesByRole[normalizedRole];
        return allowedRoutes.indexOf(requestedRoute) !== -1
            ? requestedRoute
            : fallbackForRole(normalizedRole);
    }

    function fromSearch(role, search) {
        var requestedRoute = new URLSearchParams(search || '').get('redirect');
        return forRole(role, requestedRoute);
    }

    window.OrgaShiftRedirect = Object.freeze({
        forRole: forRole,
        fromSearch: fromSearch
    });
})();
