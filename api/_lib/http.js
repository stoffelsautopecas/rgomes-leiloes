const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const setCors = (req, res) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Signature, X-Webhook-Token, X-NowBank-Token");
  res.setHeader("Access-Control-Allow-Credentials", "true");
};

export const handleOptions = (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
};

export const sendJson = (req, res, statusCode, payload) => {
  setCors(req, res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    req.rawBody = req.rawBody || JSON.stringify(req.body);
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  req.rawBody = raw;
  return raw ? JSON.parse(raw) : {};
};

export const getQueryParam = (req, key) => {
  if (req.query && typeof req.query === "object" && key in req.query) {
    return req.query[key];
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    return url.searchParams.get(key);
  } catch (error) {
    return null;
  }
};
