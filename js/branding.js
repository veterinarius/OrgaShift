// js/branding.js - Eigenes Branding (ab Team) auf eingeloggte Seiten anwenden
// ===================================================================
// Lädt Tarif + Logo/Akzentfarbe der Organisation des eingeloggten Nutzers
// und ersetzt bei Team-/Business-Organisationen den "OrgaShift"-Schriftzug im
// Nav-Header durch das eigene Logo sowie die Akzentfarbe (--accent bzw.
// --color-accent, je nach Seite unterschiedlich benannt).
// Das Ergebnis wird zusätzlich unter window.__orgBranding abgelegt, damit
// der PDF-Druckkopf (printSchedule() in den Plan-Seiten) es ohne erneuten
// Fetch wiederverwenden kann.
// Setzt voraus, dass sbClient bereits im <head> der Seite initialisiert ist.
// ===================================================================

(function () {
    'use strict';

    function applyLogo(logoUrl, orgName) {
        document.querySelectorAll('.logo').forEach(function (el) {
            el.innerHTML = '';
            var img = document.createElement('img');
            img.src = logoUrl;
            img.alt = orgName || 'Logo';
            img.style.maxHeight = '32px';
            img.style.display = 'block';
            el.appendChild(img);
        });
    }

    function applyColor(brandColor) {
        var style = document.createElement('style');
        style.textContent = ':root{--accent:' + brandColor + ' !important;--color-accent:' + brandColor + ' !important;}';
        document.head.appendChild(style);
    }

    async function init() {
        if (typeof sbClient === 'undefined') return;

        window.__orgBranding = { logoUrl: null, brandColor: null };

        try {
            var sessionRes = await sbClient.auth.getSession();
            var session = sessionRes.data.session;
            if (!session) return;

            var profileRes = await sbClient
                .from('profiles').select('tier, organization_id')
                .eq('id', session.user.id).maybeSingle();
            var profile = profileRes.data;
            if (!profile) return;

            var tier = profile.tier || 'free';
            var org = null;
            if (profile.organization_id) {
                var orgRes = await sbClient
                    .from('organizations').select('name, tier, logo_url, brand_color')
                    .eq('id', profile.organization_id).maybeSingle();
                org = orgRes.data;
                if (org) tier = org.tier || tier;
            }

            if (tier === 'basic') tier = 'team';
            if (tier === 'premium') tier = 'business';
            if ((tier !== 'team' && tier !== 'business') || !org) return;

            if (org.logo_url) {
                applyLogo(org.logo_url, org.name);
                window.__orgBranding.logoUrl = org.logo_url;
            }
            if (org.brand_color) {
                applyColor(org.brand_color);
                window.__orgBranding.brandColor = org.brand_color;
            }
        } catch (e) {
            console.warn('[branding] Konnte Branding nicht laden:', e);
        }
    }

    init();
})();
