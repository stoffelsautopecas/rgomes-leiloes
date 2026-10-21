import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(!process.env.DATABASE_URL || !['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Use a disposable local DATABASE_URL');
const {pool}=await import('../src/auth/db.js'); pool.options.ssl=false;
const {ensureAdminSchema,createTracking}=await import('../src/admin/repository.js');
const {createUser}=await import('../src/auth/repository.js');
const {saveStaff}=await import('../src/admin/staff.js');
const {hashPassword,signAccessToken}=await import('../src/auth/security.js');
const {default:adminHandler}=await import('../api/admin.js');
const {default:customerHandler}=await import('../api/customer.js');
const prefix='motion-test-'+randomUUID(); const ids=[];
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.body=JSON.parse(s)}});
async function adminCall(actor,body){const req={method:'PUT',body,headers:{authorization:'Bearer '+signAccessToken(actor)},query:{action:'trackings'},url:'/api/admin?action=trackings',socket:{remoteAddress:'127.0.0.1'}};const res=response();await adminHandler(req,res);return {status:res.statusCode,...res.body};}
async function browserCall(user){const req={method:'GET',headers:{authorization:'Bearer '+signAccessToken(user)},query:{action:'tracking-dashboard',motion:'1'},url:'/api/customer?action=tracking-dashboard&motion=1'};const res=response();await customerHandler(req,res);return {status:res.statusCode,...res.body};}
try{
 await ensureAdminSchema();
 const employee=await saveStaff({fullName:'Motion Employee',email:prefix+'@example.test',whatsapp:'11999990003',password:'testpass123'}); ids.push(employee.id);
 const customer=await createUser({fullName:'Motion Client',email:prefix+'-client@example.test',whatsapp:'11999999999',cpf:'motion-'+randomUUID(),cep:'06400000',address:'Rua Teste',number:'1',district:'Centro',city:'Cidade Teste',state:'SP',passwordHash:await hashPassword('client123'),role:'customer',ownerId:employee.id}); ids.push(customer.id);
 const base={ownerId:employee.id,clientUserId:customer.id,clientName:customer.full_name,clientEmail:customer.email,itemName:'Veículo demonstrativo',status:'Em andamento',currentLocation:'Cidade Teste - SP'};
 const first=await createTracking({...base,trackingCode:prefix+'-1'}),second=await createTracking({...base,trackingCode:prefix+'-2'});
 await pool.query("update public.app_client_tracking set animation_paused=false where id=any($1::uuid[])",[[first.id,second.id]]);
 await pool.query("update public.app_client_tracking set animation_progress=.72,animation_running_since=now() - interval '36 seconds' where id=any($1::uuid[])",[[first.id,second.id]]);
 let result=await adminCall(employee,{id:first.id,status:'Em andamento',animationPaused:true}); assert.equal(result.status,200,JSON.stringify(result)); assert.equal(result.tracking.animation_paused,true);
 const [browserA,browserB]=await Promise.all([browserCall(customer),browserCall(customer)]); for(const browser of [browserA,browserB]){assert.equal(browser.status,200);assert.equal(browser.trackings.find(x=>x.id===first.id).animation_paused,true);assert.equal(browser.trackings.find(x=>x.id===second.id).animation_paused,false);}
 const pausedProgress=Number(browserA.trackings.find(x=>x.id===first.id).animation_progress);
 assert(pausedProgress >= .7225 && pausedProgress < .73, 'Pausa preserva progresso além da metade');
 assert.equal(browserA.trackings.find(x=>x.id===first.id).animation_running_since,null);
 result=await adminCall(employee,{id:first.id,status:'Aguardando nota fiscal'});assert.equal(result.status,200);assert.equal(result.tracking.animation_paused,true);assert(Math.abs(Number(result.tracking.animation_progress)-pausedProgress)<.001);
 result=await adminCall(employee,{id:first.id,status:'Em inspeção',animationPaused:false});assert.equal(result.status,200);assert.equal(result.tracking.animation_paused,false);assert(result.tracking.animation_running_since);
 const [resumedA,resumedB]=await Promise.all([browserCall(customer),browserCall(customer)]);for(const browser of [resumedA,resumedB]) assert.equal(browser.trackings.find(x=>x.id===first.id).animation_paused,false);
 assert.equal(resumedA.trackings.find(x=>x.id===second.id).animation_paused,false);
 await pool.query("update public.app_client_tracking set animation_progress=.9,animation_running_since=now() - interval '8 hours' where id=$1",[first.id]);
 result=await adminCall(employee,{id:first.id,status:'Chegando ao destino'});assert.equal(result.status,200);assert.equal(Number(result.tracking.animation_progress),1);assert.equal(result.tracking.animation_running_since,null);
 result=await adminCall(employee,{id:first.id,status:'Conferência final'});assert.equal(Number(result.tracking.animation_progress),1,'Trocar status após chegada não reinicia');
 result=await adminCall(employee,{id:first.id,status:'Em inspeção',animationReset:true});assert.equal(result.status,200);assert.equal(result.tracking.animation_paused,true);assert.equal(Number(result.tracking.animation_progress),0);assert.equal(result.tracking.animation_running_since,null);assert.equal(result.tracking.alert_message,'Em inspeção');
 const resetBrowser=await browserCall(customer);const resetTracking=resetBrowser.trackings.find(x=>x.id===first.id);assert.equal(Number(resetTracking.animation_progress),0);assert.equal(resetTracking.animation_paused,true);assert.equal(resetTracking.animation_running_since,null);
 // Emulate the old halfway function to exercise the one-time upgrade.
 const paused=await createTracking({...base,trackingCode:prefix+'-paused'});
 await pool.query('update public.app_client_tracking set animation_paused=true where id=$1',[paused.id]);
 await pool.query('update public.app_client_tracking set animation_progress=.4,animation_running_since=null where id=$1',[paused.id]);
 await pool.query('update public.app_client_tracking set animation_progress=.5,animation_running_since=null where id=$1',[second.id]);
 await pool.query("create or replace function public.advance_tracking_animation() returns trigger language plpgsql as $$ begin return NEW; end; $$");
 const {TRACKING_ANIMATION_SCHEMA}=await import('../src/admin/tracking-animation-schema.js');
 await pool.query(TRACKING_ANIMATION_SCHEMA);
 const state=await pool.query('select id,animation_progress,animation_running_since,animation_paused from public.app_client_tracking where id=any($1::uuid[])',[[first.id,second.id,paused.id]]);
 const halfway=state.rows.find(x=>x.id===second.id),stillPaused=state.rows.find(x=>x.id===paused.id);
 assert.equal(Number(halfway.animation_progress),.5);assert(halfway.animation_running_since,'Continua a partir da metade');
 assert.equal(Number(stillPaused.animation_progress),.4);assert.equal(stillPaused.animation_running_since,null);
 const runningSince=halfway.animation_running_since.toISOString();
 await pool.query(TRACKING_ANIMATION_SCHEMA);
 const repeated=await pool.query('select animation_progress,animation_running_since from public.app_client_tracking where id=$1',[second.id]);
 assert.equal(repeated.rows[0].animation_running_since.toISOString(),runningSince,'Cold start não reinicia o relógio');
 assert.equal(Number(repeated.rows[0].animation_progress),.5);
 await pool.query("update public.app_client_tracking set animation_progress=.3,animation_running_since=now()-interval '30 minutes' where id=$1",[second.id]);
 await pool.query("create or replace function public.advance_tracking_animation() returns trigger language plpgsql as $$ begin /* tracking_animation_full_route_v2 */ return NEW; end; $$");
 await pool.query(TRACKING_ANIMATION_SCHEMA);
 const slower=await pool.query('select animation_progress,animation_running_since from public.app_client_tracking where id=$1',[second.id]);
 assert(Math.abs(Number(slower.rows[0].animation_progress)-.55)<.001,'Mudança de 2 para 4 horas preserva a posição já percorrida');
 assert(slower.rows[0].animation_running_since);
 await pool.query("update public.app_client_tracking set animation_progress=.3,animation_running_since=now()-interval '30 minutes' where id=$1",[second.id]);
 await pool.query("create or replace function public.advance_tracking_animation() returns trigger language plpgsql as $$ begin /* tracking_animation_full_route_v2 tracking_animation_duration_v3_8h */ return NEW; end; $$");
 await pool.query(TRACKING_ANIMATION_SCHEMA);
 const fourHours=await pool.query('select animation_progress from public.app_client_tracking where id=$1',[second.id]);
 assert(Math.abs(Number(fourHours.rows[0].animation_progress)-.3625)<.001,'Mudança de 8 para 4 horas preserva a posição');
 console.log('PASS mudança de velocidade sem recuo, percurso até 100%, pausa após a metade, retomada, status sem reinício, migração preserva posição e pausas, cold start idempotente, dois navegadores e rastreios independentes');
} finally {await pool.query('delete from public.app_client_tracking where owner_id=$1',[ids[0]]).catch(()=>{});await pool.query('delete from public.app_users where id=any($1::uuid[])',[ids]).catch(()=>{});await pool.end();}
