import test from 'node:test';
import assert from 'node:assert/strict';
import {createInviteHandler} from '../functions/invite-employee/handler.js';
const id='10000000-0000-4000-8000-000000000001';
const actor={data:{role:'admin',organization_id:'org'}};
const employee={data:{id,organization_id:'org',employee_auth_id:null,email:'member@example.invalid'}};
function setup(o={}) {
 const sends=[],links=[];
 const responses=o.responses ?? [actor,employee];
 const handler=createInviteHandler(()=>({auth:{getUser:async()=>({data:{user:o.signedOut?null:{id:'actor'}},error:o.authError})}}),()=>({
 from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>responses.shift()}),
 auth:{admin:{inviteUserByEmail:async(...args)=>{sends.push(args);return o.inviteError?{error:{message:'failed'}}:{data:{user:{id:'invited'}}};}}},
 rpc:async(...args)=>{links.push(args);return {error:o.linkError};},
 }));
 const request=(body={employee_id:id,email:'member@example.invalid',redirect_to:'https://attacker.invalid'},method='POST')=>new Request('https://example.invalid',{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 return {handler,request,sends,links};
}
test('authorized invitation uses stored email, fixed user role and atomic finalization',async()=>{
 const s=setup();assert.equal((await s.handler(s.request())).status,200);
 assert.deepEqual(s.sends,[['member@example.invalid',{data:{role:'user'}}]]);
 assert.deepEqual(s.links,[['finalize_employee_invitation',{p_actor:'actor',p_employee:id,p_user:'invited',p_email:'member@example.invalid'}]]);
});
for(const [name,responses,status] of [
 ['member',[{data:{role:'user',organization_id:'org'}}],403],
 ['missing profile',[{data:null}],403],['missing org',[{data:{role:'admin'}}],403],
 ['actor database error',[{error:{}}],500],['employee database error',[actor,{error:{}}],500],
 ['foreign organization',[actor,{data:{...employee.data,organization_id:'other'}}],403],
 ['missing employee',[actor,{data:null}],403],
 ['already registered',[actor,{data:{...employee.data,employee_auth_id:'existing'}}],409],
 ['wrong email',[actor,{data:{...employee.data,email:'other@example.invalid'}}],400],
]) test(name+' blocked before email',async()=>{const s=setup({responses:[...responses]});assert.equal((await s.handler(s.request())).status,status);assert.equal(s.sends.length,0);assert.equal(s.links.length,0);});
test('unauthenticated blocked before email',async()=>{const s=setup({signedOut:true});assert.equal((await s.handler(s.request())).status,401);assert.equal(s.sends.length,0);});
test('invalid input blocked',async()=>{for(const b of [null,{}, {employee_id:id,email:4}]){const s=setup();assert.equal((await s.handler(s.request(b))).status,400);assert.equal(s.sends.length,0);}});
test('invite failure does not link',async()=>{const s=setup({inviteError:true});assert.equal((await s.handler(s.request())).status,400);assert.equal(s.links.length,0);});
test('concurrent registration or failed finalization is reported without success',async()=>{const s=setup({linkError:{}});const r=await s.handler(s.request());assert.equal(r.status,409);assert.equal((await r.json()).success,undefined);});
test('only POST can invite',async()=>{const s=setup();assert.equal((await s.handler(s.request(null,'GET'))).status,405);assert.equal((await s.handler(s.request(null,'OPTIONS'))).status,200);assert.equal(s.sends.length,0);});
