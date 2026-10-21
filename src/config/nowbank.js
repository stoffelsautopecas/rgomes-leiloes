const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const buildPublicWebhookUrl = (appDomain) => {
  if (!appDomain) {
    return null;
  }

  const normalizedDomain = String(appDomain).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  if (!normalizedDomain) {
    return null;
  }

  return `https://${normalizedDomain}/api/webhooks/nowbank`;
};

const buildWebhookUrlFromAppUrl = (appUrl) => {
  try {
    const parsed = new URL(appUrl);

    if (LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
      return null;
    }

    return new URL("/api/webhooks/nowbank", parsed).toString();
  } catch {
    return null;
  }
};

export const resolveNowBankCallbackUrl = ({
  appUrl = "http://localhost:3000",
  appDomain = "localhost",
  appEnv = "development",
  callbackUrl = process.env.NOWBANK_CALLBACK_URL || process.env.NOWHUBPAY_CALLBACK_URL
} = {}) => {
  const fallbackUrl = new URL("/api/webhooks/nowbank", appUrl).toString();
  const publicWebhookUrl = buildWebhookUrlFromAppUrl(appUrl) || buildPublicWebhookUrl(appDomain) || fallbackUrl;
  const normalizedCallbackUrl = String(callbackUrl || "").trim();

  if (!normalizedCallbackUrl) {
    return appEnv === "production" ? publicWebhookUrl : fallbackUrl;
  }

  try {
    const parsed = new URL(normalizedCallbackUrl);

    if (LOCALHOST_HOSTNAMES.has(parsed.hostname) && appEnv === "production") {
      return publicWebhookUrl;
    }

    return parsed.toString();
  } catch {
    return appEnv === "production" ? publicWebhookUrl : fallbackUrl;
  }
};

export const resolveSyncCallbackUrl = resolveNowBankCallbackUrl;
export const resolveIronCallbackUrl = resolveNowBankCallbackUrl;
