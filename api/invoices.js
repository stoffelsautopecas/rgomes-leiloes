import { findInvoiceByPublicToken, syncInvoiceWithIron } from "../src/invoices/repository.js";
import { fetchIronTransaction } from "../src/payments/ironpay.js";
import { handleOptions, sendJson, getQueryParam } from "./_lib/http.js";

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

export default async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  const action = getQueryParam(req, "action");

  try {
    if (action === "public") {
      if (req.method !== "GET") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const token = getQueryParam(req, "token");
      const invoice = await findInvoiceByPublicToken(String(token || "").trim());

      if (!invoice) {
        return sendJson(req, res, 404, { message: "Fatura não encontrada." });
      }

      return sendJson(req, res, 200, { invoice: normalizeInvoicePayload(invoice) });
    }

    if (action === "public-sync") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const token = getQueryParam(req, "token");
      const invoice = await findInvoiceByPublicToken(String(token || "").trim());

      if (!invoice) {
        return sendJson(req, res, 404, { message: "Fatura não encontrada." });
      }

      if (!invoice.ironTransactionHash && !invoice.sigiloTransactionId && !invoice.publicToken) {
        return sendJson(req, res, 200, { invoice: normalizeInvoicePayload(invoice) });
      }

      const transaction = await fetchIronTransaction({
        id: invoice.ironTransactionHash || invoice.sigiloTransactionId,
        identifier: invoice.publicToken
      });

      const updatedInvoice = await syncInvoiceWithIron(invoice, transaction);
      return sendJson(req, res, 200, { invoice: normalizeInvoicePayload(updatedInvoice) });
    }

    return sendJson(req, res, 404, { message: "Rota de faturas não encontrada." });
  } catch (error) {
    console.error(error);

    if (action === "public-sync") {
      return sendJson(
        req,
        res,
        /NowBank|NowHubPay|IronPay|SyncPay/i.test(String(error.message || "")) ? 503 : 502,
        { message: error.message || "Erro ao sincronizar fatura." }
      );
    }

    return sendJson(req, res, 500, { message: "Erro ao carregar fatura pública." });
  }
}
