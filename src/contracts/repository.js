import { randomBytes, randomUUID } from "crypto";

import { pool } from "../auth/db.js";

const normalizeContractStatus = (contract) => (contract?.client_signed_at ? "signed" : contract?.status || "pending_client_signature");

const createSignatureHash = () => `sig_${randomBytes(8).toString("hex")}`;

const serializeContract = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    contractType: row.contract_type,
    publicToken: row.public_token,
    clientUserId: row.client_user_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientCpf: row.client_cpf,
    clientAddress: row.client_address,
    vehicleName: row.vehicle_name,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    vehicleDescription: row.vehicle_description,
    amountValue: Number(row.amount_value || 0),
    amountText: row.amount_text,
    paymentMethod: row.payment_method,
    paymentNotes: row.payment_notes,
    deliveryDate: row.delivery_date,
    deliveryAddress: row.delivery_address,
    sellerName: row.seller_name,
    sellerSignatureText: row.seller_signature_text,
    sellerSignatureStyle: row.seller_signature_style,
    sellerSignedAt: row.seller_signed_at,
    sellerSignatureHash: row.seller_signature_hash,
    clientSignatureText: row.client_signature_text,
    clientSignatureStyle: row.client_signature_style,
    clientSignedAt: row.client_signed_at,
    clientSignatureHash: row.client_signature_hash,
    status: normalizeContractStatus({
      status: row.status,
      client_signed_at: row.client_signed_at
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

let contractSchemaPromise;

const persistContractChangesByPublicToken = async (publicToken, changes) => {
  const fields = [];
  const values = [publicToken];
  const pushField = (column, value) => {
    if (value === undefined) {
      return;
    }

    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  pushField("contract_type", changes.contractType);
  pushField("client_user_id", changes.clientUserId);
  pushField("client_name", changes.clientName);
  pushField("client_email", changes.clientEmail);
  pushField("client_cpf", changes.clientCpf);
  pushField("client_address", changes.clientAddress);
  pushField("vehicle_name", changes.vehicleName);
  pushField("vehicle_model", changes.vehicleModel);
  pushField("vehicle_year", changes.vehicleYear);
  pushField("vehicle_description", changes.vehicleDescription);
  pushField("amount_value", changes.amountValue);
  pushField("amount_text", changes.amountText);
  pushField("payment_method", changes.paymentMethod);
  pushField("payment_notes", changes.paymentNotes);
  pushField("delivery_date", changes.deliveryDate);
  pushField("delivery_address", changes.deliveryAddress);
  pushField("seller_name", changes.sellerName);
  pushField("seller_signature_text", changes.sellerSignatureText);
  pushField("seller_signature_style", changes.sellerSignatureStyle);
  pushField("seller_signed_at", changes.sellerSignedAt);
  pushField("seller_signature_hash", changes.sellerSignatureHash);
  pushField("client_signature_text", changes.clientSignatureText);
  pushField("client_signature_style", changes.clientSignatureStyle);
  pushField("client_signed_at", changes.clientSignedAt);
  pushField("client_signature_hash", changes.clientSignatureHash);
  pushField("status", changes.status);

  if (!fields.length) {
    const { rows } = await pool.query(`select * from public.app_contracts where public_token = $1 limit 1`, [publicToken]);
    return serializeContract(rows[0] || null);
  }

  const { rows } = await pool.query(
    `
      update public.app_contracts
      set ${fields.join(", ")}
      where public_token = $1
      returning *
    `,
    values
  );

  return serializeContract(rows[0] || null);
};

export const ensureContractSchema = async () => {
  if (!contractSchemaPromise) {
    contractSchemaPromise = pool.query(`
      create table if not exists public.app_contracts (
        id uuid primary key default gen_random_uuid(),
        contract_type text not null default 'acquisition',
        public_token text not null unique,
        client_user_id uuid references public.app_users(id) on delete set null,
        client_name text not null,
        client_email text,
        client_cpf text,
        client_address text,
        vehicle_name text,
        vehicle_model text,
        vehicle_year text,
        amount_value numeric(12, 2) not null default 0,
        amount_text text,
        payment_method text,
        payment_notes text,
        delivery_date date,
        delivery_address text,
        seller_name text not null,
        seller_signature_text text not null,
        seller_signature_style text not null default 'cursive',
        seller_signed_at timestamptz not null default timezone('utc', now()),
        seller_signature_hash text,
        client_signature_text text,
        client_signature_style text,
        client_signed_at timestamptz,
        client_signature_hash text,
        status text not null default 'pending_client_signature',
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );
      alter table public.app_contracts add column if not exists owner_id uuid references public.app_users(id);
      create index if not exists app_contracts_owner_idx on public.app_contracts(owner_id);

      alter table public.app_contracts add column if not exists vehicle_description text;
      alter table public.app_contracts add column if not exists seller_signature_hash text;
      alter table public.app_contracts add column if not exists client_signature_hash text;

      create index if not exists app_contracts_public_token_idx on public.app_contracts (public_token);
      create index if not exists app_contracts_client_user_id_idx on public.app_contracts (client_user_id);
      create index if not exists app_contracts_status_idx on public.app_contracts (status);
      create index if not exists app_contracts_contract_type_idx on public.app_contracts (contract_type);

      drop trigger if exists set_app_contracts_updated_at on public.app_contracts;
      create trigger set_app_contracts_updated_at
      before update on public.app_contracts
      for each row
      execute function public.set_updated_at();
    `);
  }

  await contractSchemaPromise;

  const { rows } = await pool.query(`
    select public_token, seller_signature_hash, client_signature_hash, client_signed_at
    from public.app_contracts
    where seller_signature_hash is null
       or (client_signed_at is not null and client_signature_hash is null)
  `);

  for (const row of rows) {
    const changes = {};

    if (!row.seller_signature_hash) {
      changes.sellerSignatureHash = createSignatureHash();
    }

    if (row.client_signed_at && !row.client_signature_hash) {
      changes.clientSignatureHash = createSignatureHash();
    }

    if (Object.keys(changes).length) {
      await persistContractChangesByPublicToken(row.public_token, changes);
    }
  }

  return contractSchemaPromise;
};

export const createContractToken = () => `con_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

export const createContract = async ({
  ownerId = null,
  contractType = "acquisition",
  publicToken,
  clientUserId = null,
  clientName,
  clientEmail = null,
  clientCpf = null,
  clientAddress = null,
  vehicleName = null,
  vehicleModel = null,
  vehicleYear = null,
  vehicleDescription = null,
  amountValue = 0,
  amountText = null,
  paymentMethod = null,
  paymentNotes = null,
  deliveryDate = null,
  deliveryAddress = null,
  sellerName,
  sellerSignatureText,
  sellerSignatureStyle = "cursive",
  sellerSignatureHash = createSignatureHash(),
  status = "pending_client_signature"
}) => {
  await ensureContractSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_contracts (
        contract_type, public_token, client_user_id, client_name, client_email, client_cpf, client_address,
        vehicle_name, vehicle_model, vehicle_year, amount_value, amount_text, payment_method, payment_notes,
        delivery_date, delivery_address, seller_name, seller_signature_text, seller_signature_style, seller_signed_at,
        seller_signature_hash, status, vehicle_description, owner_id
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,timezone('utc', now()),
        $20,$21,$22,$23
      )
      returning *
    `,
    [
      contractType,
      publicToken,
      clientUserId,
      clientName,
      clientEmail,
      clientCpf,
      clientAddress,
      vehicleName,
      vehicleModel,
      vehicleYear,
      amountValue,
      amountText,
      paymentMethod,
      paymentNotes,
      deliveryDate || null,
      deliveryAddress,
      sellerName,
      sellerSignatureText,
      sellerSignatureStyle,
      sellerSignatureHash,
      status,
      vehicleDescription, ownerId
    ]
  );

  return serializeContract(rows[0]);
};

export const listContracts = async ({ limit = null, ownerId = null } = {}) => {
  await ensureContractSchema();

  const limitClause = limit ? `limit ${Number(limit)}` : "";
  const { rows } = await pool.query(
    `
      select *
      from public.app_contracts
      where ($1::uuid is null or owner_id=$1)
      order by created_at desc
      ${limitClause}
    `, [ownerId]
  );

  return rows.map(serializeContract);
};

export const countContracts = async (ownerId = null) => {
  await ensureContractSchema();
  const { rows } = await pool.query(`select count(*)::int as total from public.app_contracts where ($1::uuid is null or owner_id=$1)`, [ownerId]);
  return rows[0]?.total || 0;
};

export const findContractById = async (id) => {
  await ensureContractSchema();
  const { rows } = await pool.query(`select * from public.app_contracts where id = $1 limit 1`, [id]);
  return serializeContract(rows[0] || null);
};

export const findContractByPublicToken = async (publicToken) => {
  await ensureContractSchema();
  const { rows } = await pool.query(`select * from public.app_contracts where public_token = $1 limit 1`, [publicToken]);
  return serializeContract(rows[0] || null);
};

export const updateContractByPublicToken = async (publicToken, changes) => {
  await ensureContractSchema();
  return persistContractChangesByPublicToken(publicToken, changes);
};

export const signContractByPublicToken = async (publicToken, { clientSignatureText, clientSignatureStyle }) =>
  updateContractByPublicToken(publicToken, {
    clientSignatureText,
    clientSignatureStyle,
    clientSignedAt: new Date().toISOString(),
    clientSignatureHash: createSignatureHash(),
    status: "signed"
  });
