import { pool } from "../../src/auth/db.js";
import { ensureAdminSchema } from "../../src/admin/repository.js";
import { verifyAccessToken } from "../../src/auth/security.js";
import { findUserById } from "../../src/auth/repository.js";
import { getBearerToken } from "../../src/auth/request.js";
import { sendJson } from "./http.js";

export const requireAdmin = async (req, res) => {
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

    if (!["admin", "employee"].includes(user.role)) {
      sendJson(req, res, 403, { message: "Acesso restrito ao administrador." });
      return null;
    }

    await ensureAdminSchema();
    const {rows} = await pool.query('select is_active from public.app_users where id=$1',[user.id]);
    if (!rows[0]?.is_active) { sendJson(req,res,403,{message:"Acesso desativado."}); return null; }
    return user;
  } catch (error) {
    sendJson(req, res, 401, { message: "Token inválido." });
    return null;
  }
};
