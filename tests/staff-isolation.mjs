// Run only against a disposable local PostgreSQL database restored from the app schema.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(!process.env.DATABASE_URL || !['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Use a disposable local DATABASE_URL');
const {pool}=await import('../src/auth/db.js');pool.options.ssl=false;
const {ensureAdminSchema,createTracking}=await import('../src/admin/repository.js');
const {ensureInvoiceSchema,createInvoice}=await import('../src/invoices/repository.js');
const {ensureContractSchema}=await import('../src/contracts/repository.js');
const {hashPassword,signAccessToken}=await import('../src/auth/security.js');
const {default:handler}=await import('../api/admin.js');
const {default:catalogHandler}=await import('../api/catalog.js');
const {default:authHandler}=await import('../api/auth.js');
const prefix='staff-test-'+randomUUID();const users=[];const yards=[];
async function call(actor,action,method='GET',body={},query={}){
 const req={method,body,headers:actor?{authorization:'Bearer '+signAccessToken(actor)}:{},query:{action,...query},url:'/api/admin',socket:{remoteAddress:'127.0.0.1'}};
 const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s)}};
 await handler(req,res);return {status:res.statusCode,...res.body};
}
async function publicContacts(){const req={method:'GET',headers:{},query:{action:'contacts'},url:'/api/catalog?action=contacts'};const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s)}};await catalogHandler(req,res);return {status:res.statusCode,...res.body};}
async function register(body){const req={method:'POST',body,headers:{},query:{action:'register'},url:'/api/auth?action=register',socket:{remoteAddress:'127.0.0.1'}};const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s)}};await authHandler(req,res);return {status:res.statusCode,...res.body};}
try{
 await ensureAdminSchema();await Promise.all([ensureInvoiceSchema(),ensureContractSchema()]);
 const root=(await pool.query("select * from public.app_users where role='admin' limit 1")).rows[0];assert(root);
 let r=await call(root,'staff','POST',{fullName:'Employee A',email:prefix+'a@example.test',whatsapp:'11999990001',photoUrl:'data:image/png;base64,dGVzdGU=',password:'testpass123'});assert.equal(r.status,201,JSON.stringify(r));const a=r.staff;users.push(a.id);assert.equal(a.whatsapp,'11999990001');assert.match(a.photo_url,/^data:image\/png;base64,/);
 r=await call(root,'staff','POST',{fullName:'Employee B',email:prefix+'b@example.test',whatsapp:'11999990002',password:'testpass123'});assert.equal(r.status,201,JSON.stringify(r));const b=r.staff;users.push(b.id);
 const publicStaff=await publicContacts();assert.equal(publicStaff.status,200);assert.deepEqual(publicStaff.contacts.map(x=>x.id).sort(),[a.id,b.id].sort());assert.deepEqual(Object.keys(publicStaff.contacts[0]).sort(),['full_name','id','photo_url','whatsapp']);
 const publicRegistration=await register({fullName:'Public Client',email:prefix+'public@example.test',whatsapp:'11999998888',cpf:'418.194.610-42',cep:'06400-000',address:'Rua Teste',number:'2',district:'Centro',city:'Cidade Teste',state:'SP',password:'client123',staffId:a.id});assert.equal(publicRegistration.status,200,JSON.stringify(publicRegistration));users.push(publicRegistration.user.id);assert.equal((await pool.query('select owner_id from public.app_users where id=$1',[publicRegistration.user.id])).rows[0].owner_id,a.id);
 assert.equal((await call(a,'staff')).status,403);
 assert.equal((await call(a,'staff','POST',{fullName:'Escalation',email:'x@example.test',password:'testpass123'})).status,403);
 r=await call(null,'session','POST',{email:a.email,password:'testpass123'});assert.equal(r.status,200,JSON.stringify(r));
 const customerPayload=n=>({fullName:'Client '+n,email:prefix+n+'@example.test',whatsapp:'11999999999',cpf:String(Date.now())+n,cep:'04258000',address:'Rua Teste',number:'1',district:'Centro',city:'Cidade Teste',state:'SP',password:'client123',role:'admin',ownerId:b.id});
 const c1=await call(a,'customers','POST',customerPayload('1'));assert.equal(c1.status,201,JSON.stringify(c1));users.push(c1.user.id);
 const c2=await call(b,'customers','POST',customerPayload('2'));assert.equal(c2.status,201,JSON.stringify(c2));users.push(c2.user.id);
 const owner=(await pool.query('select owner_id,role from public.app_users where id=$1',[c1.user.id])).rows[0];assert.equal(owner.owner_id,a.id);assert.equal(owner.role,'customer');
 for(const method of ['PUT','DELETE'])assert.equal((await call(a,'customers',method,{id:c2.user.id,...customerPayload('2')})).status,404);
 assert.equal((await call(a,'customers','DELETE',{id:root.id})).status,404);
 const tr=await call(a,'trackings','POST',{clientUserId:c1.user.id,clientName:'Spoof',clientEmail:c2.user.email,itemName:'Manual',trackingCode:prefix,status:'Em andamento'});assert.equal(tr.status,201,JSON.stringify(tr));assert.equal(tr.tracking.client_email,c1.user.email);assert.equal(tr.tracking.owner_id,a.id);
 assert.equal((await call(b,'trackings','PUT',{id:tr.tracking.id,status:'Entregue'})).status,404);
 assert.equal((await call(b,'tracking-preview','GET',{}, {id:tr.tracking.id,motion:'1'})).status,404);
 assert.equal((await call(a,'tracking-preview','GET',{}, {id:tr.tracking.id,motion:'1'})).status,200);
 assert.equal((await call(a,'trackings','POST',{clientUserId:c2.user.id,clientName:'Other',itemName:'Manual',trackingCode:'forbidden'})).status,404);
 const contractPayload={clientUserId:c1.user.id,vehicleName:'Test',vehicleModel:'Test',vehicleYear:'2020',amountValue:1000,amountText:'Mil reais',paymentMethod:'Pix',paymentNotes:'À vista',deliveryDate:'2027-01-01',deliveryAddress:'Rua Teste'};
 r=await call(a,'contracts','POST',contractPayload);assert.equal(r.status,201,JSON.stringify(r));const contract=r.contract;assert.equal(contract.ownerId,a.id);
 assert.equal((await call(b,'contracts','POST',contractPayload)).status,404);
 assert.equal((await call(a,'invoices','POST',{clientUserId:c2.user.id,title:'Should not bill',amount:100})).status,404);
 const inv=await createInvoice({ownerId:a.id,clientUserId:c1.user.id,clientName:'Test',publicToken:prefix,title:'Fixture only - no gateway',amount:100});
 assert.equal((await call(b,'invoices-sync','POST',{}, {id:inv.id})).status,404);
 const da=await call(a,'dashboard'),db=await call(b,'dashboard');assert.equal(da.status,200,JSON.stringify(da));assert.deepEqual(da.users.map(x=>x.id).sort(),[c1.user.id,publicRegistration.user.id].sort());assert.deepEqual(db.users.map(x=>x.id),[c2.user.id]);assert.equal(da.trackings.length,1);assert.equal(db.trackings.length,0);assert.equal(da.contractsTotal,1);assert.equal(db.contractsTotal,0);assert.equal(da.catalogItems.length,db.catalogItems.length);assert(da.catalogItems.length>0);assert.deepEqual(da.drivers,db.drivers);
 assert.equal((await call(a,'invoices')).invoices.length,1);assert.equal((await call(b,'invoices')).invoices.length,0);
 assert.equal((await call(b,'contracts')).contracts.length,0);
 r=await call(a,'yards','POST',{name:prefix,city:'Cidade Teste',state:'SP',address:'Test'});assert.equal(r.status,201,JSON.stringify(r));yards.push(r.yard.id);assert((await call(b,'dashboard')).yards.some(x=>x.id===r.yard.id));
 const changedYard=await call(b,'yards','PUT',{id:r.yard.id,name:prefix+' edited',address:'New shared address'});assert.equal(changedYard.status,200);assert.equal((await call(a,'dashboard')).yards.find(x=>x.id===r.yard.id).address,'New shared address');
 assert((await call(root,'dashboard')).users.some(x=>x.id===c1.user.id));assert((await call(root,'contracts')).contracts.some(x=>x.id===contract.id));
 assert.equal((await call(c1.user,'dashboard')).status,403);
 r=await call(root,'staff','PUT',{id:a.id,isActive:false});assert.equal(r.status,200);assert.equal((await call(a,'dashboard')).status,403);assert.equal((await call(null,'session','POST',{email:a.email,password:'testpass123'})).status,403);assert(!(await publicContacts()).contacts.some(x=>x.id===a.id));assert.equal((await register({fullName:'Blocked Owner',email:prefix+'blocked@example.test',whatsapp:'11999997777',cpf:'539.052.750-07',cep:'06400-000',address:'Rua Teste',number:'3',district:'Centro',password:'client123',staffId:a.id})).status,400);
 console.log('PASS staff login, owner assignment, all lists, foreign IDs, preview, shared yards/catalog, admin visibility, disabled access and customer denial');
}finally{
 for(const table of ['app_contracts','app_invoices','app_client_tracking'])await pool.query(`delete from public.${table} where owner_id=any($1::uuid[])`,[users]);
 await pool.query('delete from public.app_yards where id=any($1::uuid[])',[yards]);
 await pool.query('delete from public.app_users where owner_id=any($1::uuid[])',[users]);await pool.query('delete from public.app_users where id=any($1::uuid[])',[users]);await pool.end();
}
