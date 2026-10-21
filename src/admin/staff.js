import { pool } from '../auth/db.js';
import { hashPassword } from '../auth/security.js';

const tables = {customers:'app_users',trackings:'app_client_tracking',contracts:'app_contracts',invoices:'app_invoices'};
export const ownerScope = actor => actor.role === 'employee' ? actor.id : null;
export const assertOwned = async (actor, kind, id) => {
  if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) throw Object.assign(new Error('Registro não encontrado.'),{status:404});
  const table=tables[kind];
  if(!table) throw new Error('Tipo de registro inválido');
  const {rows}=await pool.query(`select id, owner_id ${kind==='customers'?', role':''} from public.${table} where id=$1`,[id]);
  const record=rows[0];
  if(!record || (kind==='customers' && record.role!=='customer') || (ownerScope(actor)&&record.owner_id!==actor.id)) throw Object.assign(new Error('Registro não encontrado ou sem permissão.'),{status:404});
  return record;
};
export const listStaff = async () => (await pool.query("select id,full_name,email,whatsapp,photo_url,is_active,created_at from public.app_users where role='employee' order by created_at desc")).rows;
export const listPublicStaffContacts = async () => (await pool.query(`
  select id, full_name, whatsapp, photo_url
  from public.app_users
  where role='employee' and is_active=true and nullif(trim(whatsapp),'') is not null
  order by full_name asc
`)).rows;
export const findActiveStaffById = async id => {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return null;
  return (await pool.query(`select id from public.app_users where id=$1 and role='employee' and is_active=true and nullif(trim(whatsapp),'') is not null`,[id])).rows[0] || null;
};
export const saveStaff = async ({id,fullName,email,whatsapp,password,photoUrl,isActive}) => {
  const normalizedWhatsapp = typeof whatsapp === 'string' ? whatsapp.trim().slice(0, 30) : null;
  const normalizedPhoto = typeof photoUrl === 'string' ? photoUrl.trim() : photoUrl === null ? '' : null;
  if(normalizedPhoto && (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(normalizedPhoto) || normalizedPhoto.length > 3000000)) throw Object.assign(new Error('Envie uma foto JPG, PNG ou WebP válida.'),{status:400});
  if(id){
    if(!/^[0-9a-f-]{36}$/i.test(String(id))) throw Object.assign(new Error('Usuário inválido.'),{status:400});
    if(typeof isActive!=='boolean' && !password && normalizedWhatsapp===null && normalizedPhoto===null) throw Object.assign(new Error('Informe os dados que deseja atualizar.'),{status:400});
    if(password && (typeof password!=='string'||password.length<8)) throw Object.assign(new Error('Use uma senha com pelo menos 8 caracteres.'),{status:400});
    const hash=password?await hashPassword(password):null;
    const {rows}=await pool.query(`update public.app_users set
      is_active=coalesce($2,is_active),password_hash=coalesce($3,password_hash),
      whatsapp=coalesce($4,whatsapp),photo_url=case when $5::text is null then photo_url else nullif($5,'') end
      where id=$1 and role='employee' returning id,full_name,email,whatsapp,photo_url,is_active`,[id,typeof isActive==='boolean'?isActive:null,hash,normalizedWhatsapp,normalizedPhoto]);
    if(!rows[0])throw Object.assign(new Error('Funcionário não encontrado.'),{status:404});
    return rows[0];
  }
  if(typeof fullName!=='string'||!fullName.trim()||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email.trim())||!normalizedWhatsapp||typeof password!=='string'||password.length<8)throw Object.assign(new Error('Informe nome, e-mail válido, WhatsApp e senha com pelo menos 8 caracteres.'),{status:400});
  const {rows}=await pool.query(`insert into public.app_users(full_name,email,whatsapp,cpf,cep,address,number,district,password_hash,photo_url,role)
    values($1,$2,$3,'employee-'||gen_random_uuid()::text,'','','','',$4,nullif($5,''),'employee') returning id,full_name,email,whatsapp,photo_url,is_active`,[fullName.trim(),email.trim().toLowerCase(),normalizedWhatsapp,await hashPassword(password),normalizedPhoto || '']);
  return rows[0];
};
