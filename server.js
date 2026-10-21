import adminApiHandler from "./api/admin.js";
import { publicOrigin } from "./public/shared/public-links.js";
import dotenv from "dotenv";
import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import {
  createUser,
  deleteUserById,
  findUserByEmailOrCpf,
  findUserById,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
  saveRefreshToken,
  updateUser,
  verifyRefreshTokenHash
} from "./src/auth/repository.js";
import {
  createCatalogItem,
  createDriver,
  createTracking,
  createYard,
  deleteCatalogItem,
  ensureDefaultAdminUser,
  getCustomerTrackingDashboard,
  findPublicCatalogItemBySlug,
  findPublicTrackingByCode,
  getAdminDashboardData,
  listPublicCatalogItems,
  updateCatalogItem,
  updateDriver,
  updateTrackingStatus
} from "./src/admin/repository.js";
import {
  createInvoice,
  createInvoiceToken,
  countInvoices,
  findInvoiceById,
  findInvoiceByIronTransactionHash,
  findInvoiceByPublicToken,
  listInvoices,
  syncInvoiceWithIron,
} from "./src/invoices/repository.js";
import { createIronPixPayment, fetchIronTransaction } from "./src/payments/ironpay.js";
import {
  comparePassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "./src/auth/security.js";
import { getBearerToken } from "./src/auth/request.js";
import { onlyDigits, sanitizeUser } from "./src/auth/utils.js";
import { resolveIronCallbackUrl } from "./src/config/ironpay.js";
import { findActiveStaffById, listPublicStaffContacts } from "./src/admin/staff.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const appUrl = publicOrigin(process.env.APP_URL || `http://localhost:${port}`);
const appDomain = process.env.APP_DOMAIN || "localhost";
const allowedOrigins = (process.env.CORS_ORIGIN || appUrl)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ironCallbackUrl = resolveIronCallbackUrl({
  appUrl,
  appDomain,
  appEnv: process.env.APP_ENV
});

app.use(express.json({
  limit: "25mb",
  verify: (req, _res, buffer) => {
    req.rawBody = buffer.toString("utf8");
  }
}));
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Signature, X-Webhook-Token, X-NowBank-Token");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});
app.use(express.static(publicDir));

const sendAuthPayload = async (res, user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await saveRefreshToken(user.id, refreshToken);

  res.json({
    user: sanitizeUser(user),
    accessToken,
    refreshToken
  });
};

const resolveRequestUser = async (req) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return { error: { status: 401, message: "Token ausente." } };
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await findUserById(payload.sub);

    if (!user) {
      return { error: { status: 401, message: "Usuário não encontrado." } };
    }

    return { user };
  } catch (error) {
    return { error: { status: 401, message: "Token inválido." } };
  }
};

const authRequired = async (req, res, next) => {
  const { user, error } = await resolveRequestUser(req);

  if (error) {
    return res.status(error.status).json({ message: error.message });
  }

  req.user = user;
  return next();
};

const adminRequired = async (req, res, next) => {
  const { user, error } = await resolveRequestUser(req);

  if (error) {
    return res.status(error.status).json({ message: error.message });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ message: "Acesso restrito ao administrador." });
  }

  req.user = user;
  return next();
};

const normalizeInvoicePayload = (invoice) => {
  if (!invoice) {
    return null;
  }

  return {
    id: invoice.id,
    publicToken: invoice.publicToken,
    clientUserId: invoice.clientUserId,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    clientPhone: invoice.clientPhone,
    clientDocument: invoice.clientDocument,
    title: invoice.title,
    amount: Number(invoice.amount || 0),
    dueDate: invoice.dueDate,
    description: invoice.description,
    status: invoice.status,
    ironTransactionHash: invoice.ironTransactionHash || invoice.sigiloTransactionId,
    ironOfferHash: invoice.ironOfferHash || null,
    ironPaymentMethod: invoice.ironPaymentMethod || invoice.sigiloPaymentMethod,
    ironStatus: invoice.ironStatus || invoice.sigiloStatus,
    ironPixCode: invoice.ironPixCode || invoice.pixCode,
    ironPixImage: invoice.ironPixImage || invoice.pixImage,
    ironDetails: invoice.ironDetails || invoice.sigiloDetails,
    ironPayload: invoice.ironPayload || invoice.sigiloPayload,
    sigiloTransactionId: invoice.sigiloTransactionId,
    sigiloOrderId: invoice.sigiloOrderId,
    sigiloPaymentMethod: invoice.sigiloPaymentMethod,
    sigiloStatus: invoice.sigiloStatus,
    pixCode: invoice.pixCode,
    pixImage: invoice.pixImage,
    paymentUrl: invoice.paymentUrl,
    callbackUrl: invoice.callbackUrl,
    sigiloDetails: invoice.sigiloDetails,
    sigiloPayload: invoice.sigiloPayload,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt
  };
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      fullName,
      email,
      whatsapp,
      cpf,
      cep,
      address,
      number,
      district,
      complement,
      city,
      state,
      password,
      staffId
    } = req.body;

    if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district || !password) {
      return res.status(400).json({ message: "Preencha todos os campos obrigatórios." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCpf = onlyDigits(cpf);
    const existingUser = await findUserByEmailOrCpf(normalizedEmail, normalizedCpf);

    if (existingUser) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail ou CPF." });
    }

    const selectedStaff = staffId ? await findActiveStaffById(staffId) : null;
    if (staffId && !selectedStaff) {
      return res.status(400).json({ message: "O funcionário selecionado não está disponível. Escolha outro atendimento." });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      whatsapp: String(whatsapp).trim(),
      cpf: String(cpf).trim(),
      cep: String(cep).trim(),
      address: String(address).trim(),
      number: String(number).trim(),
      district: String(district).trim(),
      complement: complement ? String(complement).trim() : null,
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      passwordHash,
      ownerId: selectedStaff?.id || null
    });

    return sendAuthPayload(res, user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao criar conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Informe e-mail/CPF e senha." });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const user = await findUserByEmailOrCpf(normalizedIdentifier, onlyDigits(normalizedIdentifier));

    if (!user) {
      return res.status(401).json({ message: "Dados de acesso inválidos." });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Dados de acesso inválidos." });
    }

    return sendAuthPayload(res, user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao fazer login." });
  }
});

// Keep local and serverless staff permissions identical.
app.use("/api/admin", (req,res) => {
  const parts=req.path.split("/").filter(Boolean);
  const action=parts[0] === "invoices" && parts[2] === "sync" ? "invoices-sync" : parts[0];
  const query=new URLSearchParams(req.originalUrl.split("?")[1] || "");
  if(action) query.set("action",action);
  if(parts[1]) query.set("id",parts[1]);
  req.url="/api/admin?"+query.toString();
  // Express exposes query as a getter. Use a plain request facade for serverless helpers.
  return adminApiHandler({method:req.method,headers:req.headers,body:req.body,url:req.url,query:Object.fromEntries(query),socket:req.socket},res);
});

app.post("/api/admin/session", async (req, res) => {
  try {
    await ensureDefaultAdminUser();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Informe e-mail e senha do admin." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const admin = await findUserByEmailOrCpf(normalizedEmail, "");

    if (!admin || admin.role !== "admin") {
      return res.status(401).json({ message: "Credenciais administrativas inválidas." });
    }

    const passwordMatches = await comparePassword(password, admin.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Credenciais administrativas inválidas." });
    }

    return sendAuthPayload(res, admin);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao acessar o painel admin." });
  }
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

app.put("/api/auth/profile", authRequired, async (req, res) => {
  try {
    const {
      fullName,
      email,
      whatsapp,
      cpf,
      cep,
      address,
      number,
      district,
      complement,
      city,
      state,
      password,
      photoUrl
    } = req.body;

    if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district) {
      return res.status(400).json({ message: "Preencha todos os campos obrigatórios do perfil." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCpf = onlyDigits(cpf);
    const existingUser = await findUserByEmailOrCpf(normalizedEmail, normalizedCpf);

    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail ou CPF." });
    }

    const passwordHash = password ? await hashPassword(password) : null;
    const user = await updateUser(req.user.id, {
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      whatsapp: String(whatsapp).trim(),
      cpf: String(cpf).trim(),
      cep: String(cep).trim(),
      address: String(address).trim(),
      number: String(number).trim(),
      district: String(district).trim(),
      complement: complement ? String(complement).trim() : null,
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      photoUrl: photoUrl ? String(photoUrl).trim() : null,
      passwordHash
    });

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao atualizar perfil." });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token ausente." });
    }

    const payload = verifyRefreshToken(refreshToken);
    const tokenExists = await verifyRefreshTokenHash(payload.sub, refreshToken);

    if (!tokenExists) {
      return res.status(401).json({ message: "Refresh token inválido." });
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Usuário não encontrado." });
    }

    await revokeRefreshTokenByHash(payload.sub, refreshToken);
    return sendAuthPayload(res, user);
  } catch (error) {
    return res.status(401).json({ message: "Refresh token inválido." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao sair da conta." });
  }
});

app.get("/api/admin/dashboard", adminRequired, async (_req, res) => {
  try {
    const [data, invoicesTotal] = await Promise.all([getAdminDashboardData(), countInvoices()]);
    return res.json({ ...data, invoicesTotal });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar o painel admin." });
  }
});

app.get("/api/admin/invoices", adminRequired, async (_req, res) => {
  try {
    const invoices = await listInvoices();
    return res.json({ invoices });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar faturas." });
  }
});

app.post("/api/admin/invoices", adminRequired, async (req, res) => {
  try {
    const { clientUserId, title, amount, dueDate, description } = req.body;

    if (!clientUserId || !title || amount === undefined || amount === null) {
      return res.status(400).json({ message: "Selecione um cliente, informe o título e o valor da fatura." });
    }

    const client = await findUserById(String(clientUserId).trim());

    if (!client || (client.role || "customer") === "admin") {
      return res.status(404).json({ message: "Cliente não encontrado." });
    }

    if (!client.full_name || !client.email || !client.whatsapp || !client.cpf) {
      return res.status(400).json({
        message: "O cliente selecionado precisa ter nome, e-mail, WhatsApp e CPF cadastrados."
      });
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ message: "O valor da fatura deve ser maior que zero." });
    }

    const publicToken = createInvoiceToken();
    const callbackUrl = ironCallbackUrl;

    const ironResponse = await createIronPixPayment({
      identifier: publicToken,
      amount: amountNumber,
      client: {
        name: client.full_name,
        email: client.email,
        phone: client.whatsapp,
        document: client.cpf
      },
      dueDate: dueDate || undefined,
      metadata: {
        provider: "RGOMES LEILÕES",
        invoiceTitle: String(title).trim(),
        invoiceToken: publicToken
      },
      callbackUrl
    });

    const ironStatusValue = String(ironResponse.paymentStatus || ironResponse.status || "pending").toLowerCase();
    const normalizedInvoiceStatus = ironStatusValue === "ok" ? "pending" : ironStatusValue;

    const paymentUrl = `${appUrl.replace(/\/$/, "")}/fatura.html?token=${publicToken}`;
    const invoice = await createInvoice({
      publicToken,
      clientUserId: client.id,
      clientName: client.full_name,
      clientEmail: client.email,
      clientPhone: client.whatsapp,
      clientDocument: client.cpf,
      title: String(title).trim(),
      amount: amountNumber,
      dueDate: dueDate || null,
      description: description ? String(description).trim() : null,
      ironTransactionHash: ironResponse.hash || ironResponse.id || null,
      ironOfferHash: ironResponse.order?.offerHash || ironResponse.offerHash || null,
      ironPaymentMethod: ironResponse.paymentMethod || "pix",
      ironStatus: ironResponse.paymentStatus || ironResponse.status || "pending",
      ironPixCode: ironResponse.pix?.code || null,
      ironPixImage: ironResponse.pix?.image || null,
      pixCode: ironResponse.pix?.code || null,
      pixImage: ironResponse.pix?.image || null,
      paymentUrl,
      callbackUrl,
      ironDetails: ironResponse.details || null,
      ironPayload: ironResponse.raw || ironResponse,
      sigiloTransactionId: ironResponse.hash || null,
      sigiloOrderId: ironResponse.order?.id || null,
      sigiloPaymentMethod: (ironResponse.paymentMethod || "pix").toUpperCase(),
      sigiloStatus: normalizedInvoiceStatus,
      sigiloDetails: ironResponse.details || null,
      sigiloPayload: ironResponse.raw || ironResponse,
      status: normalizedInvoiceStatus
    });

    return res.status(201).json({ invoice: normalizeInvoicePayload(invoice) });
  } catch (error) {
    console.error(error);
    const gatewayUnavailable = /NowBank|NowHubPay|IronPay|SyncPay/i.test(String(error.message || ""));
    const status = gatewayUnavailable ? 503 : 502;
    return res.status(status).json({ message: error.message || "Erro ao gerar fatura." });
  }
});

app.get("/api/admin/invoices/:id", adminRequired, async (req, res) => {
  try {
    const invoice = await findInvoiceById(String(req.params.id || "").trim());

    if (!invoice) {
      return res.status(404).json({ message: "Fatura não encontrada." });
    }

    return res.json({ invoice: normalizeInvoicePayload(invoice) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar fatura." });
  }
});

app.post("/api/admin/invoices/:id/sync", adminRequired, async (req, res) => {
  try {
    const invoice = await findInvoiceById(String(req.params.id || "").trim());

    if (!invoice) {
      return res.status(404).json({ message: "Fatura não encontrada." });
    }

    const transaction = await fetchIronTransaction({
      id: invoice.ironTransactionHash || invoice.sigiloTransactionId,
      identifier: invoice.publicToken
    });

    const updatedInvoice = await syncInvoiceWithIron(invoice, transaction);
    return res.json({ invoice: normalizeInvoicePayload(updatedInvoice) });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ message: error.message || "Erro ao sincronizar fatura." });
  }
});

app.get("/api/invoices/public/:token", async (req, res) => {
  try {
    const invoice = await findInvoiceByPublicToken(String(req.params.token || "").trim());

    if (!invoice) {
      return res.status(404).json({ message: "Fatura não encontrada." });
    }

    return res.json({ invoice: normalizeInvoicePayload(invoice) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar fatura pública." });
  }
});

app.post("/api/invoices/public/:token/sync", async (req, res) => {
  try {
    const invoice = await findInvoiceByPublicToken(String(req.params.token || "").trim());

    if (!invoice) {
      return res.status(404).json({ message: "Fatura não encontrada." });
    }

    if (!invoice.ironTransactionHash && !invoice.sigiloTransactionId && !invoice.publicToken) {
      return res.json({ invoice: normalizeInvoicePayload(invoice) });
    }

    const transaction = await fetchIronTransaction({
      id: invoice.ironTransactionHash || invoice.sigiloTransactionId,
      identifier: invoice.publicToken
    });

    const updatedInvoice = await syncInvoiceWithIron(invoice, transaction);
    return res.json({ invoice: normalizeInvoicePayload(updatedInvoice) });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ message: error.message || "Erro ao sincronizar fatura." });
  }
});

const getWebhookToken = () => process.env.NOWBANK_WEBHOOK_TOKEN || process.env.NOWHUBPAY_WEBHOOK_TOKEN;
const getWebhookSecret = () => process.env.NOWBANK_WEBHOOK_SECRET || process.env.NOWHUBPAY_WEBHOOK_SECRET;

const signaturesMatch = (expected, received) => {
  const expectedValue = String(expected || "").trim();
  const receivedValue = String(received || "").trim().replace(/^sha256=/i, "");

  if (!expectedValue || !receivedValue || expectedValue.length !== receivedValue.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expectedValue), Buffer.from(receivedValue));
};

const isValidWebhookSignature = ({ secret, rawBody, signature }) => {
  if (!secret) {
    return true;
  }

  if (!rawBody || !signature) {
    return false;
  }

  const hexDigest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const base64Digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  return signaturesMatch(hexDigest, signature) || signaturesMatch(base64Digest, signature);
};

const normalizeNowBankWebhookTransaction = (payload, invoice) => {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const transactionId =
    data.transaction_id ||
    payload.transaction_id ||
    payload.id ||
    payload.reference_id ||
    payload.identifier ||
    invoice?.ironTransactionHash ||
    invoice?.sigiloTransactionId ||
    null;
  const paymentStatus = data.status || payload.status || invoice?.ironStatus || invoice?.sigiloStatus || "PENDING";
  const paidAt =
    String(paymentStatus).toUpperCase() === "COMPLETED"
      ? data.updated_at || payload.updated_at || payload.created_at || new Date().toISOString()
      : null;

  return {
    id: transactionId,
    hash: transactionId,
    status: paymentStatus,
    paymentStatus,
    paymentMethod: data.payment_method || payload.payment_method || invoice?.ironPaymentMethod || invoice?.sigiloPaymentMethod || "pix",
    payedAt: paidAt,
    pixInformation: {
      qrCode: data.pix_copy_paste || payload.pix_copy_paste || invoice?.ironPixCode || invoice?.pixCode || null,
      image: data.pix_qr_code || payload.pix_qr_code || invoice?.ironPixImage || invoice?.pixImage || null
    },
    details: {
      endToEnd: data.end_to_end_id || payload.end_to_end_id || null,
      payerName: data.payer_name || data.payer?.name || null,
      payerDocument: data.payer_document || data.payer?.document || null,
      amount: data.amount ?? payload.amount ?? null,
      eventId: payload.id || null,
      eventType: payload.type || null
    },
    event: payload.type || "deposit.updated"
  };
};

const handleIronWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const expectedToken = getWebhookToken();
    const expectedSecret = getWebhookSecret();
    if (!expectedToken && !expectedSecret) {
      return res.status(503).json({ message: "Webhook não configurado." });
    }
    const authorization = String(req.headers.authorization || "").trim();
    const authorizationToken = authorization.replace(/^Bearer\s+/i, "").trim();
    const incomingToken =
      authorizationToken ||
      req.query?.token ||
      req.headers["x-webhook-token"] ||
      req.headers["x-nowbank-token"] ||
      req.headers["x-syncpay-token"];

    if (expectedToken && incomingToken !== expectedToken) {
      return res.status(401).json({ message: "Token de webhook inválido." });
    }

    if (!isValidWebhookSignature({ secret: expectedSecret, rawBody: req.rawBody, signature: req.headers["x-signature"] })) {
      return res.status(401).json({ message: "Assinatura de webhook inválida." });
    }

    const transaction = payload.transaction && typeof payload.transaction === "object" ? payload.transaction : {};
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
    const transactionId =
      data.transaction_id ||
      payload.id ||
      payload.reference_id ||
      payload.identifier ||
      payload.transactionId ||
      transaction.hash ||
      transaction.id ||
      null;
    const clientIdentifier = data.external_id || payload.external_id || payload.identifier || payload.clientIdentifier || transaction.identifier || null;
    const invoice =
      (transactionId && (await findInvoiceByIronTransactionHash(String(transactionId).trim()))) ||
      (clientIdentifier && (await findInvoiceByPublicToken(String(clientIdentifier).trim()))) ||
      (transactionId && (await findInvoiceByPublicToken(String(transactionId).trim())));

    if (!invoice) {
      return res.json({ received: true, matched: false });
    }

    await syncInvoiceWithIron(invoice, normalizeNowBankWebhookTransaction(payload, invoice));
    return res.json({ received: true, matched: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao processar webhook da NowBank." });
  }
};

app.post("/api/webhooks/nowbank", handleIronWebhook);
app.post("/api/webhooks/syncpay", handleIronWebhook);
app.post("/api/webhooks/ironpay", handleIronWebhook);
app.post("/api/webhooks/sigilopay", handleIronWebhook);

app.all("/api/admin/customers", adminRequired, async (req, res) => {
  try {
    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      return res.status(405).json({ message: "Método não permitido." });
    }

    const {
      id,
      fullName,
      email,
      whatsapp,
      cpf,
      cep,
      address,
      number,
      district,
      complement,
      city,
      state,
      password
    } = req.body;

    if (req.method === "DELETE") {
      if (!id) {
        return res.status(400).json({ message: "ID do cliente não informado." });
      }

      const deleted = await deleteUserById(String(id).trim());
      if (!deleted) {
        return res.status(404).json({ message: "Cliente não encontrado." });
      }

      return res.json({ success: true });
    }

    if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district || !password) {
      if (req.method === "POST") {
        return res.status(400).json({ message: "Preencha todos os campos obrigatórios do cliente." });
      }
    }

    if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district) {
      return res.status(400).json({ message: "Preencha todos os campos obrigatórios do cliente." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCpf = onlyDigits(cpf);
    const existingUser = await findUserByEmailOrCpf(normalizedEmail, normalizedCpf);

    if (req.method === "PUT") {
      if (!id) {
        return res.status(400).json({ message: "ID do cliente não informado." });
      }

      if (!existingUser || existingUser.id !== String(id).trim()) {
        if (existingUser) {
          return res.status(409).json({ message: "Já existe um cliente com este e-mail ou CPF." });
        }
      }

      const passwordHash = password ? await hashPassword(password) : null;
      const user = await updateUser(String(id).trim(), {
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        whatsapp: String(whatsapp).trim(),
        cpf: String(cpf).trim(),
        cep: String(cep).trim(),
        address: String(address).trim(),
        number: String(number).trim(),
        district: String(district).trim(),
        complement: complement ? String(complement).trim() : null,
        city: city ? String(city).trim() : null,
        state: state ? String(state).trim() : null,
        passwordHash
      });

      if (!user) {
        return res.status(404).json({ message: "Cliente não encontrado." });
      }

      return res.json({ user: sanitizeUser(user) });
    }

    if (existingUser) {
      return res.status(409).json({ message: "Já existe um cliente com este e-mail ou CPF." });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      whatsapp: String(whatsapp).trim(),
      cpf: String(cpf).trim(),
      cep: String(cep).trim(),
      address: String(address).trim(),
      number: String(number).trim(),
      district: String(district).trim(),
      complement: complement ? String(complement).trim() : null,
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      passwordHash,
      role: "customer"
    });

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao processar cliente." });
  }
});

app.all("/api/admin/catalog-items", adminRequired, async (req, res) => {
  try {
    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      return res.status(405).json({ message: "Método não permitido." });
    }

    const { id, title, slug, category, sections, price, location, yearLabel, imageUrl, galleryImages, whatsapp, badge, galleryCount, description } =
      req.body;

    if (req.method === "DELETE") {
      if (!id) {
        return res.status(400).json({ message: "ID do item não informado." });
      }

      const deleted = await deleteCatalogItem(String(id).trim());
      if (!deleted) {
        return res.status(404).json({ message: "Item não encontrado." });
      }

      return res.json({ success: true });
    }

    if (!title || !slug || !category) {
      return res.status(400).json({ message: "Título, slug e categoria são obrigatórios." });
    }

    const payload = {
      title: String(title).trim(),
      slug: String(slug).trim().toLowerCase(),
      category: String(category).trim(),
      sections: Array.isArray(sections) ? sections : [],
      price: Number(price || 0),
      location: location ? String(location).trim() : null,
      yearLabel: yearLabel ? String(yearLabel).trim() : null,
      imageUrl: imageUrl ? String(imageUrl).trim() : null,
      galleryImages: Array.isArray(galleryImages) ? galleryImages : [],
      whatsapp: whatsapp ? String(whatsapp).trim() : null,
      badge: badge ? String(badge).trim() : null,
      galleryCount: Number(galleryCount || 1),
      description: description ? String(description).trim() : null
    };

    if (req.method === "PUT") {
      if (!id) {
        return res.status(400).json({ message: "ID do item não informado." });
      }

      const item = await updateCatalogItem(String(id).trim(), payload);
      if (!item) {
        return res.status(404).json({ message: "Item não encontrado." });
      }

      return res.json({ item });
    }

    const item = await createCatalogItem(payload);

    return res.status(201).json({ item });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao processar item do catálogo." });
  }
});

app.all("/api/admin/drivers", adminRequired, async (req, res) => {
  try {
    if (!["POST", "PUT"].includes(req.method)) {
      return res.status(405).json({ message: "Método não permitido." });
    }

    const { id, fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes } = req.body;

    if (!fullName) {
      return res.status(400).json({ message: "Nome do motorista é obrigatório." });
    }

    if (req.method === "PUT") {
      if (!id) {
        return res.status(400).json({ message: "ID do motorista não informado." });
      }

      const driver = await updateDriver(String(id).trim(), {
        fullName: String(fullName).trim(),
        cpf: cpf ? String(cpf).trim() : null,
        cnh: cnh ? String(cnh).trim() : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim().toLowerCase() : null,
        commercialAddress: commercialAddress ? String(commercialAddress).trim() : null,
        photoUrl: photoUrl ? String(photoUrl).trim() : null,
        status: status ? String(status).trim() : "ativo",
        notes: notes ? String(notes).trim() : null
      });

      if (!driver) {
        return res.status(404).json({ message: "Motorista não encontrado." });
      }

      return res.json({ driver });
    }

    const driver = await createDriver({
      fullName: String(fullName).trim(),
      cpf: cpf ? String(cpf).trim() : null,
      cnh: cnh ? String(cnh).trim() : null,
      phone: phone ? String(phone).trim() : null,
      email: email ? String(email).trim().toLowerCase() : null,
      commercialAddress: commercialAddress ? String(commercialAddress).trim() : null,
      photoUrl: photoUrl ? String(photoUrl).trim() : null,
      status: status ? String(status).trim() : "ativo",
      notes: notes ? String(notes).trim() : null
    });

    return res.status(201).json({ driver });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao processar motorista." });
  }
});

app.post("/api/admin/yards", adminRequired, async (req, res) => {
  try {
    const { name, city, state, address, contactName, contactPhone, capacityInfo, notes } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Nome do pátio é obrigatório." });
    }

    const yard = await createYard({
      name: String(name).trim(),
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      address: address ? String(address).trim() : null,
      contactName: contactName ? String(contactName).trim() : null,
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      capacityInfo: capacityInfo ? String(capacityInfo).trim() : null,
      notes: notes ? String(notes).trim() : null
    });

    return res.status(201).json({ yard });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao cadastrar pátio." });
  }
});

app.put(["/api/admin", "/api/admin/trackings"], adminRequired, async (req, res) => {
  try {
    const {id, status: rawStatus, currentLocation, animationPaused, animationReset} = req.body;
    const status = typeof rawStatus === "string" ? rawStatus.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || "")) || !status || status.length > 120 || (animationPaused !== undefined && typeof animationPaused !== "boolean") || (animationReset !== undefined && typeof animationReset !== "boolean")) return res.status(400).json({message:"Informe um rastreio e status válidos."});
    const tracking = await updateTrackingStatus({id,status,animationPaused,animationReset,currentLocation:currentLocation === undefined ? undefined : String(currentLocation).trim().slice(0,500)});
    if(!tracking) return res.status(404).json({message:"Rastreio não encontrado."});
    res.json({tracking});
  } catch(error) { res.status(500).json({message:"Não foi possível atualizar o rastreio."}); }
});

app.post("/api/admin/trackings", adminRequired, async (req, res) => {
  try {
    const {
      clientUserId,
      clientName,
      clientEmail,
      catalogItemId,
      itemName,
      manualVehicleYear,
      manualVehicleDescription,
      manualVehicleImage,
      driverId,
      yardId,
      trackingCode,
      status,
      alertMessage,
      currentLocation,
      expectedDeliveryDate,
      notes
    } = req.body;

    if (!clientName || !itemName || !trackingCode) {
      return res
        .status(400)
        .json({ message: "Cliente, item e código de rastreio são obrigatórios." });
    }

    const tracking = await createTracking({
      clientUserId,
      clientName: String(clientName).trim(),
      clientEmail: clientEmail ? String(clientEmail).trim().toLowerCase() : null,
      catalogItemId,
      itemName: String(itemName).trim(),
        manualVehicleYear: String(manualVehicleYear || "").trim(),
        manualVehicleDescription: String(manualVehicleDescription || "").trim(),
        manualVehicleImage: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(manualVehicleImage || "") ? manualVehicleImage : null,
      driverId,
      yardId,
      trackingCode: String(trackingCode).trim().toUpperCase(),
      status: status ? String(status).trim() : "em separação",
      alertMessage: alertMessage ? String(alertMessage).trim() : null,
      currentLocation: currentLocation ? String(currentLocation).trim() : null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      notes: notes ? String(notes).trim() : null
    });

    return res.status(201).json({ tracking });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao cadastrar rastreio." });
  }
});

const handleCatalogItems = async (req, res) => {
  try {
    const items = await listPublicCatalogItems({
      section: req.query.section ? String(req.query.section).trim() : null,
      category: req.query.category ? String(req.query.category).trim() : null,
      search: req.query.search ? String(req.query.search).trim() : null,
      excludeSlug: req.query.excludeSlug ? String(req.query.excludeSlug).trim() : null,
      limit: req.query.limit ? Number(req.query.limit) : null
    });

    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar itens do catálogo." });
  }
};

const handleCatalogDetail = async (req, res) => {
  try {
    const slug = req.query.slug ? String(req.query.slug).trim() : "";

    if (!slug) {
      return res.status(400).json({ message: "Slug do item não informado." });
    }

    const item = await findPublicCatalogItemBySlug(slug);
    if (!item) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    return res.json({ item });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar detalhe do item." });
  }
};

const handleTrackingLookup = async (req, res) => {
  try {
    const trackingCode = req.query.code ? String(req.query.code).trim().toUpperCase() : "";

    if (!trackingCode) {
      return res.status(400).json({ message: "Código de rastreio não informado." });
    }

    const tracking = await findPublicTrackingByCode(trackingCode);
    if (!tracking) {
      return res.status(404).json({ message: "Rastreio não encontrado." });
    }

    return res.json({ tracking });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao consultar rastreio." });
  }
};

app.get("/api/catalog/items", handleCatalogItems);
app.get("/api/catalog/detail", handleCatalogDetail);
app.get("/api/catalog/contacts", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.json({contacts: await listPublicStaffContacts()});
  } catch(error) {
    console.error(error);
    return res.status(500).json({message:"Erro ao carregar contatos."});
  }
});
app.get("/api/tracking", handleTrackingLookup);
app.get("/api/customer/tracking-dashboard", authRequired, async (req, res) => {
  try {
    const trackings = await getCustomerTrackingDashboard({
      userId: req.user.id,
      email: req.user.email,
      motionOnly: req.query.motion === "1"
    });

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    if (req.query.motion === "1") return res.json({trackings});
    return res.json({
      user: sanitizeUser(req.user),
      trackings
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar dashboard de rastreio." });
  }
});
app.get("/catalog-api-items", handleCatalogItems);
app.get("/catalog-api-detail", handleCatalogDetail);

[
  ["/admin", "admin.html"],
  ["/catalogo", "catalogo.html"],
  ["/sobre", "sobre.html"],
  ["/login", "login.html"],
  ["/cadastro", "cadastro.html"],
  ["/rastreio", "rastreio.html"],
  ["/fatura", "fatura.html"],
  ["/detalhe", "detalhe.html"],
  ["/", "index.html"]
].forEach(([routePath, fileName]) => {
  app.get(routePath, (_req, res) => {
    res.sendFile(path.join(publicDir, fileName));
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando em ${appUrl}`);
  console.log(`Dominio configurado: ${appDomain}`);
  console.log(`CORS liberado para: ${allowedOrigins.join(", ")}`);
});
