const DEFAULT_API_BASE_URL = "https://api.nowhubpay.com";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const normalizeApiBaseUrl = (value) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return DEFAULT_API_BASE_URL;
  }

  const markdownUrlMatch = rawValue.match(/\((https?:\/\/[^)]+)\)/i);
  const plainUrlMatch = rawValue.match(/https?:\/\/[^\s)\]]+/i);
  const normalizedValue = markdownUrlMatch?.[1] || plainUrlMatch?.[0] || rawValue;

  try {
    return new URL(normalizedValue).toString().replace(/\/+$/, "");
  } catch {
    return normalizedValue.replace(/\/+$/, "");
  }
};

const getApiBaseUrl = () => normalizeApiBaseUrl(process.env.NOWBANK_API_BASE_URL || DEFAULT_API_BASE_URL);
const getClientId = () => process.env.NOWBANK_CLIENT_ID || process.env.NOWHUBPAY_CLIENT_ID;
const getClientSecret = () => process.env.NOWBANK_CLIENT_SECRET || process.env.NOWHUBPAY_CLIENT_SECRET;

const toDigits = (value) => String(value || "").replace(/\D/g, "");

const normalizeAmount = (amount) => {
  const numericAmount = Number(amount || 0);

  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  return Math.round(numericAmount * 100) / 100;
};

const readJsonResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
};

const normalizeErrorMessage = (payload, fallback) => {
  const rawMessage = String(payload?.detail || payload?.message || payload?.title || payload?.error_description || "").trim();

  if (/max_cashin_without_fee|cashin exceeds/i.test(rawMessage)) {
    return "Valor acima do limite de cash-in configurado na NowBank. Reduza o valor da fatura ou solicite à NowBank o aumento do limite/liberação de taxa.";
  }

  if (payload?.detail) {
    return payload.detail;
  }

  if (payload?.message) {
    return payload.message;
  }

  if (payload?.title) {
    return payload.title;
  }

  if (payload?.error_description) {
    return payload.error_description;
  }

  if (payload?.errors && typeof payload.errors === "object") {
    const details = Object.values(payload.errors).flat().filter(Boolean).join(" ");
    return details || fallback;
  }

  return fallback;
};

const getAccessToken = async () => {
  const now = Date.now();

  if (cachedToken && cachedTokenExpiresAt - 30000 > now) {
    return cachedToken;
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais da NowBank não configuradas.");
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, "Não foi possível autenticar na NowBank."));
  }

  cachedToken = payload?.access_token || null;
  cachedTokenExpiresAt = now + Number(payload?.expires_in || 3600) * 1000;

  if (!cachedToken) {
    throw new Error("A NowBank não retornou access_token.");
  }

  return cachedToken;
};

const normalizePixImage = (value) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (/^data:image\//i.test(rawValue)) {
    return rawValue;
  }

  return `data:image/png;base64,${rawValue}`;
};

const normalizePixBlock = (payload) => ({
  code:
    payload?.pix_copy_paste ||
    payload?.pixCode ||
    payload?.pix_code ||
    payload?.pix?.copyPaste ||
    payload?.pix?.code ||
    null,
  image: normalizePixImage(payload?.pix_qr_code || payload?.pixImage || payload?.pix_image || payload?.pix?.qrCode),
  expiresAt: payload?.expires_at || payload?.expiresAt || null,
  base64: ""
});

const normalizeTransactionPayload = (payload, fallbackPaymentMethod = "pix") => {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const transactionId =
    data.transaction_id ||
    data.id ||
    payload?.transaction_id ||
    payload?.id ||
    payload?.reference_id ||
    null;
  const paymentStatus = String(data.status || payload?.status || "").trim();
  const paymentMethod = String(data.payment_method || payload?.payment_method || fallbackPaymentMethod || "pix").trim();
  const completedAt =
    String(paymentStatus).toUpperCase() === "COMPLETED"
      ? data.updated_at || payload?.updated_at || payload?.created_at || null
      : null;

  return {
    id: transactionId,
    hash: transactionId,
    status: paymentStatus || "PENDING",
    paymentStatus: paymentStatus || "PENDING",
    paymentMethod,
    amount: data.amount ?? payload?.amount ?? null,
    order: { id: data.external_id || payload?.external_id || transactionId },
    customer: data.payer || payload?.payer || null,
    details: {
      endToEnd: data.end_to_end_id || payload?.end_to_end_id || null,
      fee: data.fee ?? payload?.fee ?? null,
      netAmount: data.net_amount ?? payload?.net_amount ?? null,
      payerName: data.payer_name || data.payer?.name || null,
      payerDocument: data.payer_document || data.payer?.document || null,
      type: data.type || payload?.type || null
    },
    postbackUrl: payload?.clientCallbackUrl || null,
    pix: normalizePixBlock(data),
    payedAt: completedAt,
    event: payload?.type || null,
    raw: payload
  };
};

export const createNowBankPixPayment = async ({
  identifier,
  amount,
  client,
  metadata,
  callbackUrl,
  paymentMethod = "pix"
}) => {
  if (!client?.name || !client?.document) {
    throw new Error("Dados do cliente incompletos para gerar a cobrança na NowBank.");
  }

  const accessToken = await getAccessToken();
  const body = {
    amount: normalizeAmount(amount),
    external_id: String(identifier || metadata?.invoiceToken || "").trim(),
    payer: {
      name: String(client.name).trim(),
      document: toDigits(client.document)
    },
    clientCallbackUrl: callbackUrl || undefined
  };

  const response = await fetch(`${getApiBaseUrl()}/v1/payments/deposit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, "Não foi possível gerar a cobrança PIX na NowBank."));
  }

  return normalizeTransactionPayload(
    {
      ...payload,
      external_id: body.external_id,
      payment_method: paymentMethod,
      status: payload?.status || "PENDING"
    },
    paymentMethod
  );
};

export const fetchNowBankTransaction = async ({ id, identifier }) => {
  const transactionId = String(id || identifier || "").trim();

  if (!transactionId) {
    throw new Error("Identificador da transação NowBank não informado.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}/v1/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, "Não foi possível consultar a transação na NowBank."));
  }

  return normalizeTransactionPayload(payload);
};

export const createIronPixPayment = createNowBankPixPayment;
export const fetchIronTransaction = fetchNowBankTransaction;
export const createSyncPixPayment = createNowBankPixPayment;
export const fetchSyncTransaction = fetchNowBankTransaction;
