import { clientLink } from "../../public/shared/public-links.js";
import { randomUUID } from "crypto";

import { pool } from "../auth/db.js";

const normalizeStatus = (status) => {
  const value = String(status || "").trim().toUpperCase();

  if (["OK", "PENDING", "WAITING_PAYMENT"].includes(value)) {
    return "pending";
  }

  if (["COMPLETED", "PAID", "APPROVED", "AUTHORIZED", "SUCCESS"].includes(value)) {
    return "paid";
  }

  if (value === "REFUNDED") {
    return "refunded";
  }

  if (value === "CHARGED_BACK") {
    return "charged_back";
  }

  if (["FAILED", "REJECTED", "CANCELED"].includes(value)) {
    return "failed";
  }

  return value ? value.toLowerCase() : "pending";
};

const resolveInvoiceStatus = ({ status, payedAt, event } = {}) => {
  if (payedAt) {
    return "paid";
  }

  const normalizedEvent = String(event || "").trim().toUpperCase();
  if (["TRANSACTION_PAID", "TRANSACTION_COMPLETED"].includes(normalizedEvent)) {
    return "paid";
  }

  if (normalizedEvent === "TRANSACTION_REFUNDED") {
    return "refunded";
  }

  if (normalizedEvent === "TRANSACTION_CHARGED_BACK") {
    return "charged_back";
  }

  if (normalizedEvent === "TRANSACTION_CANCELED") {
    return "failed";
  }

  return normalizeStatus(status);
};

const serializeInvoice = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    publicToken: row.public_token,
    clientUserId: row.client_user_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    clientDocument: row.client_document,
    title: row.title,
    amount: Number(row.amount || 0),
    dueDate: row.due_date,
    description: row.description,
    status: row.paid_at ? "paid" : row.status,
    ironTransactionHash: row.iron_transaction_hash || row.sigilo_transaction_id || null,
    ironOfferHash: row.iron_offer_hash || null,
    ironPaymentMethod: row.iron_payment_method || row.sigilo_payment_method || null,
    ironStatus: row.iron_status || row.sigilo_status || null,
    ironPixCode: row.iron_pix_code || row.pix_code || null,
    ironPixImage: row.iron_pix_image || row.pix_image || null,
    ironDetails: row.iron_details || row.sigilo_details || null,
    ironPayload: row.iron_payload || row.sigilo_payload || null,
    sigiloTransactionId: row.sigilo_transaction_id,
    sigiloOrderId: row.sigilo_order_id,
    sigiloPaymentMethod: row.sigilo_payment_method,
    sigiloStatus: row.sigilo_status,
    pixCode: row.pix_code,
    pixImage: row.pix_image,
    paymentUrl: row.public_token ? clientLink("fatura", row.public_token, process.env.APP_URL) : row.payment_url,
    callbackUrl: row.callback_url,
    sigiloDetails: row.sigilo_details || null,
    sigiloPayload: row.sigilo_payload || null,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

let invoiceSchemaPromise;

export const ensureInvoiceSchema = async () => {
  if (!invoiceSchemaPromise) {
    invoiceSchemaPromise = pool.query(`
      create table if not exists public.app_invoices (
        id uuid primary key default gen_random_uuid(),
        public_token text not null unique,
        client_user_id uuid references public.app_users(id) on delete set null,
        client_name text not null,
        client_email text,
        client_phone text,
        client_document text,
        title text not null,
        amount numeric(12, 2) not null default 0,
        due_date date,
        description text,
        status text not null default 'pending',
        iron_transaction_hash text unique,
        iron_offer_hash text,
        iron_payment_method text not null default 'pix',
        iron_status text,
        iron_pix_code text,
        iron_pix_image text,
        iron_details jsonb not null default '{}'::jsonb,
        iron_payload jsonb not null default '{}'::jsonb,
        sigilo_transaction_id text unique,
        sigilo_order_id text,
        sigilo_payment_method text not null default 'PIX',
        sigilo_status text,
        pix_code text,
        pix_image text,
        payment_url text,
        callback_url text,
        sigilo_details jsonb not null default '{}'::jsonb,
        sigilo_payload jsonb not null default '{}'::jsonb,
        paid_at timestamptz,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );
      alter table public.app_invoices add column if not exists owner_id uuid references public.app_users(id);
      create index if not exists app_invoices_owner_idx on public.app_invoices(owner_id);

      alter table public.app_invoices
        add column if not exists iron_transaction_hash text;
      alter table public.app_invoices
        add column if not exists iron_offer_hash text;
      alter table public.app_invoices
        add column if not exists iron_payment_method text not null default 'pix';
      alter table public.app_invoices
        add column if not exists iron_status text;
      alter table public.app_invoices
        add column if not exists iron_pix_code text;
      alter table public.app_invoices
        add column if not exists iron_pix_image text;
      alter table public.app_invoices
        add column if not exists iron_details jsonb not null default '{}'::jsonb;
      alter table public.app_invoices
        add column if not exists iron_payload jsonb not null default '{}'::jsonb;

      create index if not exists app_invoices_public_token_idx on public.app_invoices (public_token);
      create index if not exists app_invoices_client_user_id_idx on public.app_invoices (client_user_id);
      create index if not exists app_invoices_status_idx on public.app_invoices (status);
      create index if not exists app_invoices_iron_transaction_hash_idx on public.app_invoices (iron_transaction_hash);
      create index if not exists app_invoices_sigilo_transaction_id_idx on public.app_invoices (sigilo_transaction_id);

      drop trigger if exists set_app_invoices_updated_at on public.app_invoices;
      create trigger set_app_invoices_updated_at
      before update on public.app_invoices
      for each row
      execute function public.set_updated_at();
    `);
  }

  return invoiceSchemaPromise;
};

export const createInvoiceToken = () => `inv_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

export const createInvoice = async ({
  ownerId = null,
  publicToken,
  clientUserId = null,
  clientName,
  clientEmail = null,
  clientPhone = null,
  clientDocument = null,
  title,
  amount,
  dueDate = null,
  description = null,
  ironTransactionHash = null,
  ironOfferHash = null,
  ironPaymentMethod = "pix",
  ironStatus = "pending",
  ironPixCode = null,
  ironPixImage = null,
  ironDetails = {},
  ironPayload = {},
  sigiloTransactionId = null,
  sigiloOrderId = null,
  sigiloPaymentMethod = "PIX",
  sigiloStatus = "pending",
  pixCode = null,
  pixImage = null,
  paymentUrl = null,
  callbackUrl = null,
  sigiloDetails = {},
  sigiloPayload = {},
  status = "pending",
  paidAt = null
}) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_invoices (
        public_token, client_user_id, client_name, client_email, client_phone, client_document,
        title, amount, due_date, description, status, iron_transaction_hash, iron_offer_hash,
        iron_payment_method, iron_status, iron_pix_code, iron_pix_image, iron_details, iron_payload,
        sigilo_transaction_id, sigilo_order_id, sigilo_payment_method, sigilo_status, pix_code, pix_image,
        payment_url, callback_url, sigilo_details, sigilo_payload, paid_at, owner_id
      )
      values (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18::jsonb,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,
        $27,$28::jsonb,$29::jsonb,$30,$31
      )
      returning *
    `,
    [
      publicToken,
      clientUserId,
      clientName,
      clientEmail,
      clientPhone,
      clientDocument,
      title,
      amount,
      dueDate || null,
      description,
      status,
      ironTransactionHash,
      ironOfferHash,
      ironPaymentMethod,
      ironStatus,
      ironPixCode,
      ironPixImage,
      JSON.stringify(ironDetails || {}),
      JSON.stringify(ironPayload || {}),
      sigiloTransactionId,
      sigiloOrderId,
      sigiloPaymentMethod,
      sigiloStatus,
      pixCode,
      pixImage,
      paymentUrl,
      callbackUrl,
      JSON.stringify(sigiloDetails || {}),
      JSON.stringify(sigiloPayload || {}),
      paidAt, ownerId
    ]
  );

  return serializeInvoice(rows[0]);
};

export const listInvoices = async (ownerId = null) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(`
    select *
    from public.app_invoices
    where ($1::uuid is null or owner_id=$1)
    order by created_at desc
  `, [ownerId]);

  return rows.map(serializeInvoice);
};

export const countInvoices = async () => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(`select count(*)::int as total from public.app_invoices`);
  return rows[0]?.total || 0;
};

export const findInvoiceById = async (id) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(`select * from public.app_invoices where id = $1 limit 1`, [id]);
  return serializeInvoice(rows[0] || null);
};

export const findInvoiceByPublicToken = async (publicToken) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(`select * from public.app_invoices where public_token = $1 limit 1`, [
    publicToken
  ]);
  return serializeInvoice(rows[0] || null);
};

export const findInvoiceBySigiloTransactionId = async (transactionId) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(
    `select * from public.app_invoices where sigilo_transaction_id = $1 limit 1`,
    [transactionId]
  );

  return serializeInvoice(rows[0] || null);
};

export const findInvoiceByIronTransactionHash = async (transactionHash) => {
  await ensureInvoiceSchema();

  const { rows } = await pool.query(
    `select * from public.app_invoices where iron_transaction_hash = $1 limit 1`,
    [transactionHash]
  );

  return serializeInvoice(rows[0] || null);
};

export const updateInvoiceByPublicToken = async (publicToken, changes) => {
  await ensureInvoiceSchema();

  const fields = [];
  const values = [publicToken];
  const pushField = (column, value) => {
    if (value === undefined) {
      return;
    }

    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  pushField("client_user_id", changes.clientUserId);
  pushField("client_name", changes.clientName);
  pushField("client_email", changes.clientEmail);
  pushField("client_phone", changes.clientPhone);
  pushField("client_document", changes.clientDocument);
  pushField("title", changes.title);
  pushField("amount", changes.amount);
  pushField("due_date", changes.dueDate);
  pushField("description", changes.description);
  pushField("status", changes.status);
  pushField("iron_transaction_hash", changes.ironTransactionHash);
  pushField("iron_offer_hash", changes.ironOfferHash);
  pushField("iron_payment_method", changes.ironPaymentMethod);
  pushField("iron_status", changes.ironStatus);
  pushField("iron_pix_code", changes.ironPixCode);
  pushField("iron_pix_image", changes.ironPixImage);
  pushField("iron_details", changes.ironDetails ? JSON.stringify(changes.ironDetails) : undefined);
  pushField("iron_payload", changes.ironPayload ? JSON.stringify(changes.ironPayload) : undefined);
  pushField("sigilo_transaction_id", changes.sigiloTransactionId);
  pushField("sigilo_order_id", changes.sigiloOrderId);
  pushField("sigilo_payment_method", changes.sigiloPaymentMethod);
  pushField("sigilo_status", changes.sigiloStatus);
  pushField("pix_code", changes.pixCode);
  pushField("pix_image", changes.pixImage);
  pushField("payment_url", changes.paymentUrl);
  pushField("callback_url", changes.callbackUrl);
  pushField("sigilo_details", changes.sigiloDetails ? JSON.stringify(changes.sigiloDetails) : undefined);
  pushField("sigilo_payload", changes.sigiloPayload ? JSON.stringify(changes.sigiloPayload) : undefined);
  pushField("paid_at", changes.paidAt);

  if (!fields.length) {
    return findInvoiceByPublicToken(publicToken);
  }

  const { rows } = await pool.query(
    `
      update public.app_invoices
      set ${fields.join(", ")}
      where public_token = $1
      returning *
    `,
    values
  );

  return serializeInvoice(rows[0] || null);
};

export const updateInvoiceFromIron = async (publicToken, ironPayload) => {
  const transaction = ironPayload?.transaction || ironPayload?.data || ironPayload || {};
  const pixInformation = ironPayload?.pix || ironPayload?.pixInformation || transaction.pix || {};
  const paymentStatus = String(
    transaction.payment_status || transaction.status || ironPayload?.payment_status || ironPayload?.status || ""
  ).trim();
  const paymentMethod = String(
    transaction.payment_method || ironPayload?.payment_method || "pix"
  ).trim();

  return updateInvoiceByPublicToken(publicToken, {
    ironTransactionHash: ironPayload?.transactionId || ironPayload?.hash || transaction.hash || transaction.id || null,
    ironOfferHash: transaction.offer_hash || ironPayload?.offer_hash || null,
    ironPaymentMethod: paymentMethod || "pix",
    ironStatus: paymentStatus || null,
    ironPixCode: pixInformation.code || pixInformation.qrCode || pixInformation.pix_copy_paste || null,
    ironPixImage: pixInformation.image || pixInformation.pix_image || null,
    pixCode: pixInformation.code || pixInformation.qrCode || pixInformation.pix_copy_paste || null,
    pixImage: pixInformation.image || pixInformation.pix_image || null,
    status: resolveInvoiceStatus({
      status: paymentStatus || "pending",
      payedAt: transaction.payedAt || ironPayload?.payedAt || null,
      event: ironPayload?.event || transaction.event
    }),
    paidAt: transaction.payedAt || ironPayload?.payedAt || null,
    ironDetails: ironPayload?.details || transaction.details || null,
    ironPayload,
    sigiloTransactionId: ironPayload?.transactionId || transaction.id || null,
    sigiloOrderId: ironPayload?.order?.id || ironPayload?.orderId || null,
    sigiloPaymentMethod: (paymentMethod || "pix").toUpperCase(),
    sigiloStatus: paymentStatus || null,
    sigiloDetails: ironPayload?.details || null,
    sigiloPayload: ironPayload
  });
};

export const syncInvoiceWithIron = async (invoice, ironTransaction) => {
  if (!invoice) {
    return null;
  }

  const transaction = ironTransaction || {};
  const pixInformation = transaction.pixInformation || transaction.pix || {};
  const paymentStatus = String(transaction.paymentStatus || transaction.status || "").trim();
  const paymentMethod = String(transaction.paymentMethod || "pix").trim();
  const status = resolveInvoiceStatus({
    status: paymentStatus || invoice.ironStatus || invoice.sigiloStatus || "pending",
    payedAt: transaction.payedAt || invoice.paidAt || null,
    event: transaction.event
  });

  return updateInvoiceByPublicToken(invoice.publicToken, {
    ironTransactionHash: transaction.hash || transaction.id || invoice.ironTransactionHash || invoice.sigiloTransactionId || null,
    ironOfferHash: transaction.offerHash || invoice.ironOfferHash || null,
    ironPaymentMethod: paymentMethod || invoice.ironPaymentMethod || "pix",
    ironStatus: paymentStatus || invoice.ironStatus || null,
    ironPixCode: pixInformation.code || pixInformation.qrCode || invoice.ironPixCode || invoice.pixCode || null,
    ironPixImage: pixInformation.image || invoice.ironPixImage || invoice.pixImage || null,
    pixCode: pixInformation.code || pixInformation.qrCode || invoice.pixCode || null,
    pixImage: pixInformation.image || invoice.pixImage || null,
    status,
    paidAt: transaction.payedAt || invoice.paidAt || null,
    ironDetails: transaction.details || invoice.ironDetails || null,
    ironPayload: transaction,
    sigiloTransactionId: transaction.id || invoice.sigiloTransactionId || null,
    sigiloOrderId: transaction.orderId || invoice.sigiloOrderId || null,
    sigiloPaymentMethod: (paymentMethod || invoice.sigiloPaymentMethod || "pix").toUpperCase(),
    sigiloStatus: paymentStatus || invoice.sigiloStatus || null,
    sigiloDetails: transaction.details || invoice.sigiloDetails || null,
    sigiloPayload: transaction
  });
};

export const updateInvoiceFromSigilo = updateInvoiceFromIron;
export const syncInvoiceWithSigilo = syncInvoiceWithIron;
