const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
export function createInviteHandler(createUserClient, createAdminClient) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', {headers});
    if (req.method !== 'POST') return json({error:'Method not allowed'},405);
    try {
      const {data:{user},error:authError} = await createUserClient(req.headers.get('Authorization') ?? '').auth.getUser();
      if (authError || !user) return json({error:'Not authenticated'},401);
      const body = await req.json().catch(()=>null);
      if (typeof body?.employee_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.employee_id)
          || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        return json({error:'Valid employee_id and email required'},400);
      }
      const admin = createAdminClient();
      const {data:actor,error:actorError} = await admin.from('profiles').select('role, organization_id').eq('id',user.id).maybeSingle();
      if (actorError) return json({error:'Authorization check failed'},500);
      if (actor?.role !== 'admin' || !actor.organization_id) return json({error:'Not authorized'},403);
      const {data:employee,error:employeeError} = await admin.from('employees')
        .select('id, organization_id, employee_auth_id, email').eq('id',body.employee_id).maybeSingle();
      if (employeeError) return json({error:'Authorization check failed'},500);
      if (!employee || employee.organization_id !== actor.organization_id) return json({error:'Not authorized'},403);
      if (employee.employee_auth_id) return json({error:'Employee already linked'},409);
      const email = employee.email?.trim();
      if (!email || email.toLowerCase() !== body.email.trim().toLowerCase()) return json({error:'Email does not match employee'},400);
      // Use the server-configured Auth redirect, never an arbitrary request URL.
      // No invitation code or caller-controlled role is passed to Auth triggers.
      const {data,error} = await admin.auth.admin.inviteUserByEmail(email, {data:{role:'user'}});
      if (error || !data?.user?.id) return json({error:'Invitation could not be sent'},400);
      const {error:linkError} = await admin.rpc('finalize_employee_invitation', {
        p_actor:user.id, p_employee:employee.id, p_user:data.user.id, p_email:email,
      });
      if (linkError) {
        // A concurrent registration may have won. Never overwrite it or delete
        // an Auth account here: an email may already have been delivered.
        return json({error:'Invitation sent, but account linking failed. Please check the employee before retrying.'},409);
      }
      return json({success:true});
    } catch (_) { return json({error:'Invitation failed'},500); }
  };
}
