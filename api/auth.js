import {
  createUser,
  findUserByEmailOrCpf,
  findUserById,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
  saveRefreshToken,
  verifyRefreshTokenHash
} from "../src/auth/repository.js";
import {
  comparePassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "../src/auth/security.js";
import { onlyDigits, sanitizeUser } from "../src/auth/utils.js";
import { handleOptions, readJsonBody, sendJson, getQueryParam } from "./_lib/http.js";
import { findActiveStaffById } from "../src/admin/staff.js";

const sendAuthPayload = async (req, res, user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await saveRefreshToken(user.id, refreshToken);

  return sendJson(req, res, 200, {
    user: sanitizeUser(user),
    accessToken,
    refreshToken
  });
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }

  const action = getQueryParam(req, "action");

  try {
    if (action === "register") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

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
      } = await readJsonBody(req);

      if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district || !password) {
        return sendJson(req, res, 400, { message: "Preencha todos os campos obrigatórios." });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedCpf = onlyDigits(cpf);
      const existingUser = await findUserByEmailOrCpf(normalizedEmail, normalizedCpf);

      if (existingUser) {
        return sendJson(req, res, 409, { message: "Já existe uma conta com este e-mail ou CPF." });
      }

      const selectedStaff = staffId ? await findActiveStaffById(staffId) : null;
      if (staffId && !selectedStaff) {
        return sendJson(req, res, 400, { message: "O funcionário selecionado não está disponível. Escolha outro atendimento." });
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

      return sendAuthPayload(req, res, user);
    }

    if (action === "login") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { identifier, password } = await readJsonBody(req);

      if (!identifier || !password) {
        return sendJson(req, res, 400, { message: "Informe e-mail/CPF e senha." });
      }

      const normalizedIdentifier = String(identifier).trim().toLowerCase();
      const user = await findUserByEmailOrCpf(normalizedIdentifier, onlyDigits(normalizedIdentifier));

      if (!user) {
        return sendJson(req, res, 401, { message: "Dados de acesso inválidos." });
      }

      const passwordMatches = await comparePassword(password, user.password_hash);
      if (!passwordMatches) {
        return sendJson(req, res, 401, { message: "Dados de acesso inválidos." });
      }

      return sendAuthPayload(req, res, user);
    }

    if (action === "me") {
      if (req.method !== "GET") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const authorization = req.headers.authorization || "";
      const [, token] = authorization.split(" ");

      if (!token) {
        return sendJson(req, res, 401, { message: "Token ausente." });
      }

      const payload = verifyAccessToken(token);
      const user = await findUserById(payload.sub);

      if (!user) {
        return sendJson(req, res, 401, { message: "Usuário não encontrado." });
      }

      return sendJson(req, res, 200, { user: sanitizeUser(user) });
    }

    if (action === "refresh") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { refreshToken } = await readJsonBody(req);

      if (!refreshToken) {
        return sendJson(req, res, 400, { message: "Refresh token ausente." });
      }

      const payload = verifyRefreshToken(refreshToken);
      const tokenExists = await verifyRefreshTokenHash(payload.sub, refreshToken);

      if (!tokenExists) {
        return sendJson(req, res, 401, { message: "Refresh token inválido." });
      }

      const user = await findUserById(payload.sub);
      if (!user) {
        return sendJson(req, res, 401, { message: "Usuário não encontrado." });
      }

      await revokeRefreshTokenByHash(payload.sub, refreshToken);

      const nextAccessToken = signAccessToken(user);
      const nextRefreshToken = signRefreshToken(user);
      await saveRefreshToken(user.id, nextRefreshToken);

      return sendJson(req, res, 200, {
        user: sanitizeUser(user),
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken
      });
    }

    if (action === "logout") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { refreshToken } = await readJsonBody(req);
      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      }

      return sendJson(req, res, 200, { success: true });
    }

    return sendJson(req, res, 404, { message: "Rota de autenticação não encontrada." });
  } catch (error) {
    console.error(error);

    if (action === "refresh") {
      return sendJson(req, res, 401, { message: "Refresh token inválido." });
    }

    if (action === "me") {
      return sendJson(req, res, 401, { message: "Token inválido." });
    }

    if (action === "login") {
      return sendJson(req, res, 500, { message: "Erro ao fazer login." });
    }

    if (action === "logout") {
      return sendJson(req, res, 500, { message: "Erro ao sair da conta." });
    }

    return sendJson(req, res, 500, { message: "Erro ao criar conta." });
  }
}
