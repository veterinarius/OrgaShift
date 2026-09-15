(function () {
    'use strict';

    var currentPage = window.location.pathname.split('/').pop() || 'dashboardadmin.html';
    var navItems = [
        { label: 'Dashboard', href: 'dashboardadmin.html' },
        {
            label: 'Planung',
            children: [
                { label: 'Wochenplan', href: 'wochenplan.html' },
                { label: 'Monatsplan', href: 'monatsplan.html' },
                { label: 'Analytics', href: 'analytics.html' }
            ]
        },
        {
            label: 'Urlaub',
            children: [
                { label: 'Urlaub Übersicht', href: 'urlaubALLE.html' },
                { label: 'Urlaubsanträge', href: 'urlaubMA.html' }
            ]
        },
        { label: 'Personal', href: 'personal.html' },
        { label: 'Standorte', href: 'standorte.html' },
        {
            label: 'Mehr',
            children: [
                { label: 'Hilfe', href: 'hilfeadmin.html' },
                { label: 'Kontakt', href: 'kontakt.html' },
                { label: 'Tarife', href: 'pricing.html' }
            ]
        }
    ];

    function createLink(item) {
        var link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (item.href === currentPage) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        }
        return link;
    }

    function closeDropdowns(nav) {
        nav.querySelectorAll('.admin-nav-dropdown.open').forEach(function (item) {
            item.classList.remove('open');
            item.querySelector('button').setAttribute('aria-expanded', 'false');
        });
    }

    function initAdminNavigation() {
        var nav = document.querySelector('nav .nav-links');
        if (!nav || nav.dataset.adminNavReady === 'true') return;

        nav.textContent = '';
        nav.dataset.adminNavReady = 'true';

        navItems.forEach(function (item, index) {
            var listItem = document.createElement('li');

            if (!item.children) {
                listItem.appendChild(createLink(item));
                nav.appendChild(listItem);
                return;
            }

            listItem.className = 'admin-nav-dropdown';
            var menuId = 'admin-nav-menu-' + index;
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-nav-dropdown-toggle';
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', menuId);
            button.textContent = item.label;

            if (item.children.some(function (child) { return child.href === currentPage; })) {
                button.classList.add('active');
            }

            var submenu = document.createElement('ul');
            submenu.id = menuId;
            submenu.className = 'admin-nav-dropdown-menu';
            item.children.forEach(function (child) {
                var childItem = document.createElement('li');
                childItem.appendChild(createLink(child));
                submenu.appendChild(childItem);
            });

            button.addEventListener('click', function () {
                var willOpen = !listItem.classList.contains('open');
                closeDropdowns(nav);
                listItem.classList.toggle('open', willOpen);
                button.setAttribute('aria-expanded', String(willOpen));
            });

            listItem.appendChild(button);
            listItem.appendChild(submenu);
            nav.appendChild(listItem);
        });

        document.addEventListener('click', function (event) {
            if (!nav.contains(event.target)) closeDropdowns(nav);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeDropdowns(nav);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminNavigation);
    } else {
        initAdminNavigation();
    }
})();
