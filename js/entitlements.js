// Zentrale Tarifdefinition mit Rueckwaertskompatibilitaet fuer Basic/Premium.
(function () {
    'use strict';

    var PLANS = {
        free: {
            tier: 'free', label: 'Free', monthlyPrice: 0, yearlyPrice: 0,
            includedEmployees: 3, maxEmployees: 3,
            includedAdmins: 1, maxAdmins: 1,
            includedLocations: 1, maxLocations: 1,
            extraEmployeePrice: null, extraAdminPrice: null, extraLocationPrice: null
        },
        starter: {
            tier: 'starter', label: 'Starter', monthlyPrice: 9.90, yearlyPrice: 99,
            includedEmployees: 10, maxEmployees: 15,
            includedAdmins: 2, maxAdmins: 2,
            includedLocations: 1, maxLocations: 1,
            extraEmployeePrice: 1, extraAdminPrice: null, extraLocationPrice: null
        },
        team: {
            tier: 'team', label: 'Team', monthlyPrice: 19.90, yearlyPrice: 199,
            includedEmployees: 25, maxEmployees: 40,
            includedAdmins: 3, maxAdmins: 6,
            includedLocations: 2, maxLocations: 5,
            extraEmployeePrice: 0.80, extraAdminPrice: 2.90, extraLocationPrice: 4.90
        },
        business: {
            tier: 'business', label: 'Business', monthlyPrice: 34.90, yearlyPrice: 349,
            includedEmployees: 50, maxEmployees: 100,
            includedAdmins: 5, maxAdmins: 15,
            includedLocations: 4, maxLocations: 20,
            extraEmployeePrice: 0.60, extraAdminPrice: 2.90, extraLocationPrice: 3.90
        }
    };

    function normalizeTier(tier) {
        if (tier === 'basic') return 'team';
        if (tier === 'premium') return 'business';
        return PLANS[tier] ? tier : 'free';
    }

    function fallback(tier) {
        var normalized = normalizeTier(tier);
        return Object.assign({}, PLANS[normalized], {
            rawTier: tier || 'free',
            extraEmployees: 0,
            extraAdmins: 0,
            extraLocations: 0,
            employeeLimit: PLANS[normalized].includedEmployees,
            adminLimit: PLANS[normalized].includedAdmins,
            locationLimit: PLANS[normalized].includedLocations
        });
    }

    async function load(client, userId) {
        var profileResult = await client.from('profiles')
            .select('organization_id,tier,role').eq('id', userId).maybeSingle();
        var profile = profileResult.data;
        if (!profile) return fallback('free');

        var tier = profile.tier || 'free';
        var organizationId = profile.organization_id || null;
        if (organizationId) {
            var orgResult = await client.from('organizations')
                .select('tier,extra_employees,extra_admins,extra_locations')
                .eq('id', organizationId).maybeSingle();
            if (orgResult.data) tier = orgResult.data.tier || tier;

            // Nach Einspielen der Migration ist diese Funktion die verbindliche Quelle.
            var rpcResult = await client.rpc('get_org_entitlements', { p_org_id: organizationId });
            if (!rpcResult.error && rpcResult.data) {
                var row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
                if (row && row.tier) {
                    var merged = Object.assign(fallback(row.tier), row);
                    merged.includedEmployees = Number(row.included_employees);
                    merged.employeeLimit = Number(row.employee_limit);
                    merged.maxEmployees = Number(row.max_employees);
                    merged.includedAdmins = Number(row.included_admins);
                    merged.adminLimit = Number(row.admin_limit);
                    merged.maxAdmins = Number(row.max_admins);
                    merged.includedLocations = Number(row.included_locations);
                    merged.locationLimit = Number(row.location_limit);
                    merged.maxLocations = Number(row.max_locations);
                    merged.extraEmployees = Number(row.extra_employees) || 0;
                    merged.extraAdmins = Number(row.extra_admins) || 0;
                    merged.extraLocations = Number(row.extra_locations) || 0;
                    merged.organizationId = organizationId;
                    merged.role = profile.role;
                    return merged;
                }
            }

            var local = fallback(tier);
            if (orgResult.data) {
                local.extraEmployees = Number(orgResult.data.extra_employees) || 0;
                local.extraAdmins = Number(orgResult.data.extra_admins) || 0;
                local.extraLocations = Number(orgResult.data.extra_locations) || 0;
                local.employeeLimit = Math.min(local.maxEmployees, local.includedEmployees + local.extraEmployees);
                local.adminLimit = Math.min(local.maxAdmins, local.includedAdmins + local.extraAdmins);
                local.locationLimit = Math.min(local.maxLocations, local.includedLocations + local.extraLocations);
            }
            local.organizationId = organizationId;
            local.role = profile.role;
            return local;
        }

        var result = fallback(tier);
        result.organizationId = null;
        result.role = profile.role;
        return result;
    }

    window.OrgaShiftEntitlements = {
        plans: PLANS,
        normalizeTier: normalizeTier,
        label: function (tier) { return PLANS[normalizeTier(tier)].label; },
        fallback: fallback,
        load: load,
        allowsBranding: function (tier) {
            tier = normalizeTier(tier);
            return tier === 'team' || tier === 'business';
        }
    };
})();
