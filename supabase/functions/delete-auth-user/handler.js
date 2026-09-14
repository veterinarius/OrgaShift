const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Clients are supplied by the entrypoint so tests never delete real accounts.
export function createDeleteHandler(createUserClient, createAdminClient) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const body = await req.json().catch(() => null);
      const authId = body?.auth_id;
      if (typeof authId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId)) {
        return json({ error: 'Valid auth_id required' }, 400);
      }
      const targetId = authId.toLowerCase();
      const userClient = createUserClient(req.headers.get('Authorization') ?? '');
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: 'Not authenticated' }, 401);

      const admin = createAdminClient();
      if (targetId !== user.id) {
        // Do not trust user_id on an employee record as proof of authority.
        const { data: caller, error: callerError } = await admin.from('profiles')
          .select('role, organization_id').eq('id', user.id).maybeSingle();
        if (callerError) return json({ error: 'Authorization check failed' }, 500);
        if (caller?.role !== 'admin' || !caller.organization_id) {
          return json({ error: 'Not authorized to delete this user' }, 403);
        }
        const { data: target, error: targetError } = await admin.from('profiles')
          .select('role, organization_id').eq('id', targetId).maybeSingle();
        if (targetError) return json({ error: 'Authorization check failed' }, 500);
        if (target?.role !== 'user' || target.organization_id !== caller.organization_id) {
          return json({ error: 'Not authorized to delete this user' }, 403);
        }
        // Protect owners even if their profile role is inconsistent.
        const { data: ownedOrgs, error: ownerError } = await admin.from('organizations')
          .select('id').eq('created_by', targetId).limit(1);
        if (ownerError) return json({ error: 'Authorization check failed' }, 500);
        if (!ownedOrgs || ownedOrgs.length) return json({ error: 'Not authorized to delete this user' }, 403);

        // Reject ambiguous or cross-organization account links instead of
        // deleting an account shared by unexpected employee records.
        const { data: employees, error: employeeError } = await admin.from('employees')
          .select('id, organization_id').eq('employee_auth_id', targetId).limit(2);
        if (employeeError) return json({ error: 'Authorization check failed' }, 500);
        if (employees?.length !== 1 || employees[0].organization_id !== caller.organization_id) {
          return json({ error: 'Not authorized to delete this user' }, 403);
        }
      }

      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ error: 'Account deletion failed' }, 500);
      // The employees.employee_auth_id foreign key uses ON DELETE SET NULL.
      // No additional privileged UPDATE is needed after deletion.
      return json({ success: true });
    } catch (_) {
      return json({ error: 'Account deletion failed' }, 500);
    }
  };
}
