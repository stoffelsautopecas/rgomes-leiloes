import crypto from "crypto";

import { findInvoiceByIronTransactionHash, findInvoiceByPublicToken, syncInvoiceWithIron } from "../../src/invoices/repository.js";
import { handleOptions, readJsonBody, sendJson } from "../_lib/http.js";

const getBearerToken = (authorization) => {
  const value = String(authorization || "").trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : value;
};

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

const isValidSignature = ({ secret, rawBody, signature }) => {
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

export default async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendJson(req, res, 405, { message: "Método não permitido." });
  }

  try {
    const payload = await readJsonBody(req);
    const rawBody = req.rawBody || JSON.stringify(payload || {});
    const expectedToken = getWebhookToken();
    const expectedSecret = getWebhookSecret();
    if (!expectedToken && !expectedSecret) {
      return sendJson(req, res, 503, { message: "Webhook não configurado." });
    }
    const incomingToken =
      getBearerToken(req.headers.authorization) ||
      req.query?.token ||
      req.headers["x-webhook-token"] ||
      req.headers["x-nowbank-token"] ||
      req.headers["x-syncpay-token"];

    if (expectedToken && incomingToken !== expectedToken) {
      return sendJson(req, res, 401, { message: "Token de webhook inválido." });
    }

    if (!isValidSignature({ secret: expectedSecret, rawBody, signature: req.headers["x-signature"] })) {
      return sendJson(req, res, 401, { message: "Assinatura de webhook inválida." });
    }

    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
    const transactionId = data.transaction_id || payload.transaction_id || payload.id || payload.reference_id || payload.identifier || null;
    const externalId = data.external_id || payload.external_id || payload.identifier || null;
    const invoice =
      (transactionId && (await findInvoiceByIronTransactionHash(String(transactionId).trim()))) ||
      (externalId && (await findInvoiceByPublicToken(String(externalId).trim()))) ||
      (transactionId && (await findInvoiceByPublicToken(String(transactionId).trim())));

    if (!invoice) {
      return sendJson(req, res, 200, { received: true, matched: false });
    }

    await syncInvoiceWithIron(invoice, normalizeNowBankWebhookTransaction(payload, invoice));
    return sendJson(req, res, 200, { received: true, matched: true });
  } catch (error) {
    console.error(error);
    return sendJson(req, res, 500, { message: "Erro ao processar webhook da NowBank." });
  }
}
