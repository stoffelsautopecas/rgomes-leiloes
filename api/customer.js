import { findUserById } from "../src/auth/repository.js";
import { verifyAccessToken } from "../src/auth/security.js";
import { getCustomerTrackingDashboard } from "../src/admin/repository.js";
import { getBearerToken } from "../src/auth/request.js";
import { sanitizeUser } from "../src/auth/utils.js";
import { handleOptions, sendJson, getQueryParam } from "./_lib/http.js";

const requireCustomer = async (req, res) => {
  try {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      sendJson(req, res, 401, { message: "Token ausente." });
      return null;
    }

    const payload = verifyAccessToken(token);
    const user = await findUserById(payload.sub);

    if (!user) {
      sendJson(req, res, 401, { message: "Usuário não encontrado." });
      return null;
    }

    return user;
  } catch (_error) {
    sendJson(req, res, 401, { message: "Token inválido." });
    return null;
  }
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  const action = getQueryParam(req, "action");

  if (action !== "tracking-dashboard") {
    return sendJson(req, res, 404, { message: "Rota do cliente não encontrada." });
  }

  if (req.method !== "GET") {
    return sendJson(req, res, 405, { message: "Método não permitido." });
  }

  const user = await requireCustomer(req, res);
  if (!user) {
    return;
  }

  try {
    const trackings = await getCustomerTrackingDashboard({
      userId: user.id,
      email: user.email,
      motionOnly: getQueryParam(req, "motion") === "1"
    });

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    if (getQueryParam(req, "motion") === "1") return sendJson(req, res, 200, {trackings});
    return sendJson(req, res, 200, {
      user: sanitizeUser(user),
      trackings
    });
  } catch (error) {
    console.error(error);
    return sendJson(req, res, 500, { message: "Erro ao carregar dashboard de rastreio." });
  }
}
