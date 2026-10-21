import { findContractByPublicToken, signContractByPublicToken } from "../src/contracts/repository.js";
import { renderAcquisitionContractHtml } from "../src/contracts/template.js";
import { handleOptions, readJsonBody, sendJson, getQueryParam } from "./_lib/http.js";

const normalizeContractPayload = (contract) => {
  if (!contract) {
    return null;
  }

  return {
    id: contract.id,
    contractType: contract.contractType,
    publicToken: contract.publicToken,
    clientUserId: contract.clientUserId,
    clientName: contract.clientName,
    clientEmail: contract.clientEmail,
    clientCpf: contract.clientCpf,
    clientAddress: contract.clientAddress,
    vehicleName: contract.vehicleName,
    vehicleModel: contract.vehicleModel,
    vehicleYear: contract.vehicleYear,
    vehicleDescription: contract.vehicleDescription,
    amountValue: Number(contract.amountValue || 0),
    amountText: contract.amountText,
    paymentMethod: contract.paymentMethod,
    paymentNotes: contract.paymentNotes,
    deliveryDate: contract.deliveryDate,
    deliveryAddress: contract.deliveryAddress,
    sellerName: contract.sellerName,
    sellerSignatureText: contract.sellerSignatureText,
    sellerSignatureStyle: contract.sellerSignatureStyle,
    sellerSignedAt: contract.sellerSignedAt,
    sellerSignatureHash: contract.sellerSignatureHash,
    clientSignatureText: contract.clientSignatureText,
    clientSignatureStyle: contract.clientSignatureStyle,
    clientSignedAt: contract.clientSignedAt,
    clientSignatureHash: contract.clientSignatureHash,
    status: contract.status,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    documentHtml: renderAcquisitionContractHtml(contract)
  };
};

const resolveClientSignature = (clientName, style) => {
  const name = String(clientName || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);

  if (style === "abbrev-cursive") {
    if (parts.length <= 1) {
      return name;
    }

    const [firstName, ...rest] = parts;
    const initials = rest.map((part) => `${part[0].toUpperCase()}.`).join(" ");
    return `${firstName} ${initials}`.trim();
  }

  return name;
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
      const contract = await findContractByPublicToken(String(token || "").trim());

      if (!contract) {
        return sendJson(req, res, 404, { message: "Contrato não encontrado." });
      }

      return sendJson(req, res, 200, { contract: normalizeContractPayload(contract) });
    }

    if (action === "sign") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const token = getQueryParam(req, "token");
      if (!token) {
        return sendJson(req, res, 400, { message: "Token do contrato não informado." });
      }

      const contract = await findContractByPublicToken(String(token).trim());
      if (!contract) {
        return sendJson(req, res, 404, { message: "Contrato não encontrado." });
      }

      if (contract.clientSignedAt) {
        return sendJson(req, res, 200, { contract: normalizeContractPayload(contract) });
      }

      const { signatureStyle } = await readJsonBody(req);
      const normalizedStyle = ["cursive", "hand", "abbrev-cursive"].includes(String(signatureStyle || ""))
        ? String(signatureStyle)
        : "cursive";

      const clientSignatureText = resolveClientSignature(contract.clientName, normalizedStyle);
      const updatedContract = await signContractByPublicToken(String(token).trim(), {
        clientSignatureStyle: normalizedStyle,
        clientSignatureText
      });

      return sendJson(req, res, 200, { contract: normalizeContractPayload(updatedContract) });
    }

    return sendJson(req, res, 404, { message: "Rota de contratos não encontrada." });
  } catch (error) {
    console.error(error);

    if (action === "sign") {
      return sendJson(req, res, 500, { message: "Erro ao assinar contrato." });
    }

    return sendJson(req, res, 500, { message: "Erro ao carregar contrato." });
  }
}
