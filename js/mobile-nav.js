(function () {
    'use strict';

    function initMobileNavigation() {
        document.querySelectorAll('nav .nav-container').forEach(function (container, index) {
            var links = container.querySelector('.nav-links');
            if (!links || container.querySelector('.os-mobile-menu-toggle')) return;

            var menuId = links.id || 'os-mobile-menu-' + index;
            links.id = menuId;

            var actions = container.querySelector('.nav-right, .nav-buttons');
            if (actions && !links.querySelector('.os-mobile-menu-actions')) {
                var actionItem = document.createElement('li');
                actionItem.className = 'os-mobile-menu-actions';
                var actionGroup = document.createElement('div');

                Array.from(actions.children).forEach(function (original) {
                    var copy = original.cloneNode(true);
                    copy.removeAttribute('id');

                    if (original.tagName === 'BUTTON') {
                        copy.removeAttribute('onclick');
                        copy.addEventListener('click', function () {
                            original.click();
                            copy.innerHTML = original.innerHTML;
                            copy.setAttribute('aria-pressed', original.getAttribute('aria-pressed') || 'false');
                        });
                    }

                    actionGroup.appendChild(copy);
                });

                actionItem.appendChild(actionGroup);
                links.appendChild(actionItem);
            }

            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'os-mobile-menu-toggle';
            button.setAttribute('aria-controls', menuId);
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-label', 'Menü öffnen');
            button.textContent = '☰';

            function closeMenu() {
                container.classList.remove('os-mobile-menu-open');
                button.setAttribute('aria-expanded', 'false');
                button.setAttribute('aria-label', 'Menü öffnen');
                button.textContent = '☰';
            }

            button.addEventListener('click', function () {
                var willOpen = !container.classList.contains('os-mobile-menu-open');
                container.classList.toggle('os-mobile-menu-open', willOpen);
                button.setAttribute('aria-expanded', String(willOpen));
                button.setAttribute('aria-label', willOpen ? 'Menü schließen' : 'Menü öffnen');
                button.textContent = willOpen ? '×' : '☰';
            });

            links.addEventListener('click', function (event) {
                if (event.target.closest('a')) closeMenu();
            });

            document.addEventListener('click', function (event) {
                if (!container.contains(event.target)) closeMenu();
            });

            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') {
                    closeMenu();
                    button.focus();
                }
            });

            window.addEventListener('resize', function () {
                if (window.innerWidth > 900) closeMenu();
            });

            container.insertBefore(button, links);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileNavigation);
    } else {
        initMobileNavigation();
    }
})();
