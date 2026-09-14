import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteHandler } from '../functions/delete-auth-user/handler.js';
const callerId = '10000000-0000-4000-8000-000000000001';
const targetId = '10000000-0000-4000-8000-000000000002';
function setup(options = {}) {
  const deletions = [], queries = [];
  const responses = options.responses ?? [
    { data: { role: 'admin', organization_id: 'org-a' } },
    { data: { role: 'user', organization_id: 'org-a' } },
    { data: [] },
    { data: [{ id: 'employee', organization_id: 'org-a' }] },
  ];
  const handler = createDeleteHandler(
    authorization => { assert.equal(authorization, 'Bearer test'); return { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: callerId } }, error: options.authError }) } }; },
    () => ({
      from(table) {
        const query = { table, filters: [] }; queries.push(query);
        return {
          select(fields) { query.fields = fields; return this; },
          eq(key, value) { query.filters.push([key,value]); return this; },
          async maybeSingle() { return responses.shift(); },
          async limit(n) { query.limit = n; return responses.shift(); },
        };
      },
      auth: { admin: { async deleteUser(id) { deletions.push(id); return { error: options.deleteError }; } } },
    }),
  );
  const request = (body = { auth_id: targetId }, method = 'POST') => new Request('https://example.invalid/delete-auth-user', {
    method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  return { handler, request, deletions, queries };
}
test('same-org admin may delete a linked member, independently of employee creator', async () => {
  const s = setup(); assert.equal((await s.handler(s.request())).status, 200);
  assert.deepEqual(s.deletions,[targetId]);
  assert.deepEqual(s.queries.map(q=>[q.table,q.filters]), [
    ['profiles',[['id',callerId]]], ['profiles',[['id',targetId]]],
    ['organizations',[['created_by',targetId]]], ['employees',[['employee_auth_id',targetId]]],
  ]);
});
test('self deletion remains available', async () => {
  const s=setup(); assert.equal((await s.handler(s.request({auth_id:callerId}))).status,200);
  assert.deepEqual(s.deletions,[callerId]); assert.equal(s.queries.length,0);
});
const allowedCaller = {data:{role:'admin',organization_id:'org-a'}};
const allowedTarget = {data:{role:'user',organization_id:'org-a'}};
for (const [name,responses,status] of [
 ['member caller',[{data:{role:'user',organization_id:'org-a'}}],403],
 ['missing caller',[{data:null}],403],
 ['caller without org',[{data:{role:'admin',organization_id:null}}],403],
 ['foreign target',[allowedCaller,{data:{role:'user',organization_id:'org-b'}}],403],
 ['admin target',[allowedCaller,{data:{role:'admin',organization_id:'org-a'}}],403],
 ['missing target',[allowedCaller,{data:null}],403],
 ['owner with user role',[allowedCaller,allowedTarget,{data:[{id:'owned-org'}]}],403],
 ['unlinked target',[allowedCaller,allowedTarget,{data:[]},{data:[]}],403],
 ['forged cross-org link',[allowedCaller,allowedTarget,{data:[]},{data:[{organization_id:'org-b'}]}],403],
 ['ambiguous links',[allowedCaller,allowedTarget,{data:[]},{data:[{organization_id:'org-a'},{organization_id:'org-a'}]}],403],
 ['caller lookup error',[{error:{message:'db'}}],500],
 ['target lookup error',[allowedCaller,{error:{message:'db'}}],500],
 ['owner lookup error',[allowedCaller,allowedTarget,{error:{message:'db'}}],500],
 ['employee lookup error',[allowedCaller,allowedTarget,{data:[]},{error:{message:'db'}}],500],
]) test(name+' cannot delete',async()=>{
 const s=setup({responses:[...responses]}); assert.equal((await s.handler(s.request())).status,status);assert.deepEqual(s.deletions,[]);
});
test('signed out caller cannot delete',async()=>{ const s=setup({signedOut:true});assert.equal((await s.handler(s.request())).status,401);assert.deepEqual(s.deletions,[]); });
test('auth error cannot delete',async()=>{const s=setup({authError:{message:'bad jwt'}});assert.equal((await s.handler(s.request())).status,401);assert.deepEqual(s.deletions,[]);});
test('invalid body cannot delete',async()=>{for(const body of [null,{}, {auth_id:4},{auth_id:'bad-id'}]){const s=setup();assert.equal((await s.handler(s.request(body))).status,400);assert.deepEqual(s.deletions,[]);}});
test('delete failure is reported',async()=>{const s=setup({deleteError:{message:'internal detail'}});const r=await s.handler(s.request());assert.equal(r.status,500);assert.equal((await r.json()).error,'Account deletion failed');});
test('GET cannot delete and OPTIONS supports preflight',async()=>{const s=setup();assert.equal((await s.handler(s.request(null,'GET'))).status,405);assert.equal((await s.handler(s.request(null,'OPTIONS'))).status,200);assert.deepEqual(s.deletions,[]);});
