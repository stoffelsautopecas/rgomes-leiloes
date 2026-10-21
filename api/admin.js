import { ownerScope, assertOwned, listStaff, saveStaff } from "../src/admin/staff.js";
import { pool } from "../src/auth/db.js";
import { publicOrigin } from "../public/shared/public-links.js";
import { parseBRL, fullAddress, amountWords } from "../public/shared/contract-utils.js";
import { createUser, deleteUserById, findUserByEmailOrCpf, findUserById, saveRefreshToken, updateUser } from "../src/auth/repository.js";
import { comparePassword, signAccessToken, signRefreshToken } from "../src/auth/security.js";
import {
  createCatalogItem,
  createDriver,
  createTracking,
  updateTrackingStatus,
  findTrackingById,
  getCustomerTrackingDashboard,
  createYard,
  updateYard,
  deleteCatalogItem,
  ensureDefaultAdminUser,
  getAdminDashboardData,
  updateCatalogItem,
  updateDriver
} from "../src/admin/repository.js";
import { ensureContractSchema, createContract, createContractToken, listContracts } from "../src/contracts/repository.js";
import { renderAcquisitionContractHtml } from "../src/contracts/template.js";
import { ensureInvoiceSchema, createInvoice, createInvoiceToken, findInvoiceById, listInvoices, syncInvoiceWithIron } from "../src/invoices/repository.js";
import { createIronPixPayment, fetchIronTransaction } from "../src/payments/ironpay.js";
import { requireAdmin } from "./_lib/admin.js";
import { handleOptions, readJsonBody, sendJson, getQueryParam } from "./_lib/http.js";
import { onlyDigits, sanitizeUser } from "../src/auth/utils.js";
import { hashPassword } from "../src/auth/security.js";
import { resolveIronCallbackUrl } from "../src/config/ironpay.js";

const appUrl = publicOrigin(process.env.APP_URL);
const ironCallbackUrl = resolveIronCallbackUrl({
  appUrl,
  appDomain: process.env.APP_DOMAIN || "localhost",
  appEnv: process.env.APP_ENV
});

const getTodayInSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const contractSellerName = "RICARDO FERREIRA GOMES LEILOEIRO OFICIAL - ME";

const normalizeInvoicePayload = (invoice) => {
  if (!invoice) {
    return null;
  }

  return {
    id: invoice.id,
    ownerId: invoice.ownerId,
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

const normalizeContractPayload = (contract) => {
  if (!contract) {
    return null;
  }

  return {
    id: contract.id,
    ownerId: contract.ownerId,
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
    if (action === "session") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      await ensureDefaultAdminUser();
      const { email, password } = await readJsonBody(req);

      if (!email || !password) {
        return sendJson(req, res, 400, { message: "Informe e-mail e senha do admin." });
      }

      const admin = await findUserByEmailOrCpf(String(email).trim().toLowerCase(), "");
      if (!admin || !["admin", "employee"].includes(admin.role)) {
        return sendJson(req, res, 401, { message: "Credenciais administrativas inválidas." });
      }

      const active = (await pool.query("select is_active from public.app_users where id=$1",[admin.id])).rows[0]?.is_active;
      if (!active) return sendJson(req,res,403,{message:"Acesso desativado."});
      const passwordMatches = await comparePassword(password, admin.password_hash);
      if (!passwordMatches) {
        return sendJson(req, res, 401, { message: "Credenciais administrativas inválidas." });
      }

      return sendAuthPayload(req, res, admin);
    }

    const admin = await requireAdmin(req, res);
    if (!admin) {
      return;
    }

    await Promise.all([ensureContractSchema(), ensureInvoiceSchema()]);
    const scope = ownerScope(admin);
    if (action === "staff") {
      if (admin.role !== "admin") return sendJson(req,res,403,{message:"Somente o administrador pode gerenciar funcionários."});
      if (req.method === "GET") return sendJson(req,res,200,{staff:await listStaff()});
      if (!["POST","PUT"].includes(req.method)) return sendJson(req,res,405,{message:"Método não permitido."});
      const payload=await readJsonBody(req);
      if (req.method === "POST" && payload.id || req.method === "PUT" && !payload.id) return sendJson(req,res,400,{message:"Operação inválida."});
      const staff=await saveStaff(payload);
      return sendJson(req,res,req.method === "POST"?201:200,{staff});
    }

    if (action === "tracking-preview") {
      if (req.method !== "GET") return sendJson(req, res, 405, {message: "Método não permitido."});
      const id = String(getQueryParam(req, "id") || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(req, res, 400, {message: "Rastreio inválido."});
      await assertOwned(admin,"trackings",id);
      const tracking = await findTrackingById(id);
      if (!tracking) return sendJson(req, res, 404, {message: "Rastreio não encontrado."});
      const client = tracking.client_user_id ? await findUserById(tracking.client_user_id) : tracking.client_email ? await findUserByEmailOrCpf(tracking.client_email, "") : null;
      if (!client) return sendJson(req, res, 404, {message: "Este rastreio não possui cliente cadastrado vinculado."});
      const trackings = await getCustomerTrackingDashboard({userId: client.id, email: client.email, motionOnly: getQueryParam(req, "motion") === "1"});
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      if (getQueryParam(req, "motion") === "1") return sendJson(req, res, 200, {trackings: trackings.filter(item => item.id === id)});
      return sendJson(req, res, 200, {user: sanitizeUser(client), trackings: trackings.filter(item => item.id === id)});
    }

    if (action === "dashboard") {
      if (req.method !== "GET") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const data = await getAdminDashboardData(scope);
      data.actor = sanitizeUser(admin);
      return sendJson(req, res, 200, data);
    }

    if (action === "customers") {
      if (!["POST", "PUT", "DELETE"].includes(req.method)) {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { id, fullName, email, whatsapp, cpf, cep, address, number, district, complement, city, state, password } =
        await readJsonBody(req);
      if (["PUT","DELETE"].includes(req.method)) await assertOwned(admin,"customers",id);


      if (req.method === "DELETE") {
        if (!id) {
          return sendJson(req, res, 400, { message: "ID do cliente não informado." });
        }

        const deleted = await deleteUserById(String(id).trim());
        if (!deleted) {
          return sendJson(req, res, 404, { message: "Cliente não encontrado." });
        }

        return sendJson(req, res, 200, { success: true });
      }

      if (!fullName || !email || !whatsapp || !cpf || !cep || !address || !number || !district || (!password && req.method === "POST")) {
        return sendJson(req, res, 400, { message: "Preencha todos os campos obrigatórios do cliente." });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedCpf = onlyDigits(cpf);
      const existingUser = await findUserByEmailOrCpf(normalizedEmail, normalizedCpf);

      if (req.method === "PUT") {
        if (!id) {
          return sendJson(req, res, 400, { message: "ID do cliente não informado." });
        }

        if (existingUser && existingUser.id !== String(id).trim()) {
          return sendJson(req, res, 409, { message: "Já existe um cliente com este e-mail ou CPF." });
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
          return sendJson(req, res, 404, { message: "Cliente não encontrado." });
        }

        return sendJson(req, res, 200, { user: sanitizeUser(user) });
      }

      if (existingUser) {
        return sendJson(req, res, 409, { message: "Já existe um cliente com este e-mail ou CPF." });
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
        role: "customer",
        ownerId: admin.id
      });

      return sendJson(req, res, 201, { user: sanitizeUser(user) });
    }

    if (action === "catalog-items") {
      if (!["POST", "PUT", "DELETE"].includes(req.method)) {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { id, title, slug, category, sections, price, location, yearLabel, imageUrl, galleryImages, whatsapp, badge, galleryCount, description } =
        await readJsonBody(req);

      if (req.method === "DELETE") {
        if (!id) {
          return sendJson(req, res, 400, { message: "ID do item não informado." });
        }

        const deleted = await deleteCatalogItem(String(id).trim());
        if (!deleted) {
          return sendJson(req, res, 404, { message: "Item não encontrado." });
        }

        return sendJson(req, res, 200, { success: true });
      }

      if (!title || !slug || !category) {
        return sendJson(req, res, 400, { message: "Título, slug e categoria são obrigatórios." });
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
          return sendJson(req, res, 400, { message: "ID do item não informado." });
        }

        const item = await updateCatalogItem(String(id).trim(), payload);
        if (!item) {
          return sendJson(req, res, 404, { message: "Item não encontrado." });
        }

        return sendJson(req, res, 200, { item });
      }

      const item = await createCatalogItem(payload);
      return sendJson(req, res, 201, { item });
    }

    if (action === "drivers") {
      if (!["POST", "PUT"].includes(req.method)) {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { id, fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes } = await readJsonBody(req);

      if (!fullName) {
        return sendJson(req, res, 400, { message: "Nome do motorista é obrigatório." });
      }

      if (req.method === "PUT") {
        if (!id) {
          return sendJson(req, res, 400, { message: "ID do motorista não informado." });
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
          return sendJson(req, res, 404, { message: "Motorista não encontrado." });
        }

        return sendJson(req, res, 200, { driver });
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

      return sendJson(req, res, 201, { driver });
    }

    if (action === "yards") {
      if (!["POST", "PUT"].includes(req.method)) {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const { id, name, city, state, address, contactName, contactPhone, capacityInfo, notes } = await readJsonBody(req);

      if (!name) {
        return sendJson(req, res, 400, { message: "Nome do pátio é obrigatório." });
      }

      if (req.method === "PUT" && !/^[0-9a-f-]{36}$/i.test(String(id || ""))) return sendJson(req,res,400,{message:"Pátio inválido."});
      const save = req.method === "PUT" ? payload => updateYard(id,payload) : createYard;
      const yard = await save({
        name: String(name).trim(),
        city: city ? String(city).trim() : null,
        state: state ? String(state).trim() : null,
        address: address ? String(address).trim() : null,
        contactName: contactName ? String(contactName).trim() : null,
        contactPhone: contactPhone ? String(contactPhone).trim() : null,
        capacityInfo: capacityInfo ? String(capacityInfo).trim() : null,
        notes: notes ? String(notes).trim() : null
      });

      if(!yard) return sendJson(req,res,404,{message:"Pátio não encontrado."});
      return sendJson(req, res, req.method === "POST" ? 201 : 200, { yard });
    }

    if (action === "trackings") {
      if (req.method === "PUT") {
        const { id, status: rawStatus, currentLocation, animationPaused, animationReset } = await readJsonBody(req);
        const status = typeof rawStatus === "string" ? rawStatus.trim() : "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || "")) || !status || status.length > 120 || (animationPaused !== undefined && typeof animationPaused !== "boolean") || (animationReset !== undefined && typeof animationReset !== "boolean")) {
          return sendJson(req, res, 400, { message: "Informe um rastreio e status válidos." });
        }
        await assertOwned(admin,"trackings",id);
        const tracking = await updateTrackingStatus({ id, status, animationPaused, animationReset, currentLocation: currentLocation === undefined ? undefined : String(currentLocation).trim().slice(0, 500) });
        if (!tracking) return sendJson(req, res, 404, { message: "Rastreio não encontrado." });
        return sendJson(req, res, 200, { tracking });
      }
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

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
      } = await readJsonBody(req);

      if (!clientName || !itemName || !trackingCode) {
        return sendJson(req, res, 400, { message: "Cliente, item e código de rastreio são obrigatórios." });
      }

      await assertOwned(admin,"customers",clientUserId);
      const trackingClient = await findUserById(clientUserId);
      const tracking = await createTracking({
        ownerId: admin.id,
        clientUserId,
        clientName: trackingClient.full_name,
        clientEmail: trackingClient.email,
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

      return sendJson(req, res, 201, { tracking });
    }

    if (action === "contracts") {
      if (req.method === "GET") {
        const contracts = await listContracts({ownerId:scope});
        return sendJson(req, res, 200, { contracts: contracts.map(normalizeContractPayload) });
      }

      if (req.method === "POST") {
        const {
          contractType,
          clientUserId,
          clientName,
          clientCpf,
          clientAddress,
          clientEmail,
          vehicleName,
          vehicleModel,
          vehicleYear,
          vehicleDescription,
          amountValue,
          amountText,
          paymentMethod,
          paymentNotes,
          deliveryDate,
          deliveryAddress
        } = await readJsonBody(req);

        const resolvedClientUserId = clientUserId ? String(clientUserId).trim() : null;
        if (resolvedClientUserId) await assertOwned(admin,"customers",resolvedClientUserId);
        const client = resolvedClientUserId ? await findUserById(resolvedClientUserId) : null;
        const finalClientName = String(clientName || client?.full_name || "").trim();
        const finalClientCpf = String(clientCpf || client?.cpf || "").trim();
        const finalClientAddress = String(clientAddress || fullAddress(client) || "").trim() || null;
        const finalClientEmail = String(clientEmail || client?.email || "").trim() || null;
        const finalVehicleName = String(vehicleName || "").trim() || null;
        const finalVehicleModel = String(vehicleModel || "").trim() || null;
        const finalVehicleYear = String(vehicleYear || "").trim() || null;
        const finalAmountValue = parseBRL(amountValue);
        const finalAmountText = String(amountText || amountWords(finalAmountValue)).trim() || null;
        const finalPaymentMethod = String(paymentMethod || "").trim() || null;
        const finalPaymentNotes = String(paymentNotes || "").trim() || null;
        const finalDeliveryAddress = String(deliveryAddress || "").trim() || finalClientAddress;

        if (!finalClientName || !finalClientCpf || !finalClientAddress) {
          return sendJson(req, res, 400, {
            message: "Selecione ou informe cliente, CPF e endereço antes de gerar o contrato."
          });
        }

        if (!finalVehicleName || !finalVehicleModel || !finalVehicleYear) {
          return sendJson(req, res, 400, {
            message: "Informe nome, marca/modelo e ano do veículo/maquinário."
          });
        }

        if (!Number.isFinite(finalAmountValue) || finalAmountValue <= 0) {
          return sendJson(req, res, 400, { message: "Informe um valor válido para o contrato." });
        }

        if (!finalAmountText || !finalPaymentMethod || !finalPaymentNotes || !deliveryDate || !finalDeliveryAddress) {
          return sendJson(req, res, 400, {
            message: "Preencha valor por extenso, forma de pagamento, observação, data de entrega e endereço de entrega."
          });
        }

        const publicToken = createContractToken();
        const contract = await createContract({
          ownerId: admin.id,
          contractType: String(contractType || "acquisition").trim().toLowerCase(),
          publicToken,
          clientUserId: client?.id || resolvedClientUserId,
          clientName: finalClientName,
          clientEmail: finalClientEmail,
          clientCpf: finalClientCpf,
          clientAddress: finalClientAddress,
          vehicleName: finalVehicleName,
          vehicleModel: finalVehicleModel,
          vehicleYear: finalVehicleYear,
          vehicleDescription: String(vehicleDescription || "").trim() || null,
          amountValue: finalAmountValue,
          amountText: finalAmountText,
          paymentMethod: finalPaymentMethod,
          paymentNotes: finalPaymentNotes,
          deliveryDate,
          deliveryAddress: finalDeliveryAddress,
          sellerName: contractSellerName,
          sellerSignatureText: contractSellerName,
          sellerSignatureStyle: "cursive",
          status: "pending_client_signature"
        });

        return sendJson(req, res, 201, { contract: normalizeContractPayload(contract) });
      }

      return sendJson(req, res, 405, { message: "Método não permitido." });
    }

    if (action === "invoices") {
      if (req.method === "GET") {
        const invoices = await listInvoices(scope);
        return sendJson(req, res, 200, { invoices });
      }

      if (req.method === "POST") {
        const { clientUserId, title, amount, dueDate, description } = await readJsonBody(req);

        if (!clientUserId || !title || amount === undefined || amount === null) {
          return sendJson(req, res, 400, { message: "Selecione um cliente, informe o título e o valor da fatura." });
        }

        await assertOwned(admin,"customers",clientUserId);
        const client = await findUserById(String(clientUserId).trim());

        if (!client || (client.role || "customer") === "admin") {
          return sendJson(req, res, 404, { message: "Cliente não encontrado." });
        }

        if (!client.full_name || !client.email || !client.whatsapp || !client.cpf) {
          return sendJson(req, res, 400, {
            message: "O cliente selecionado precisa ter nome, e-mail, WhatsApp e CPF cadastrados."
          });
        }

        const amountNumber = Number(amount);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          return sendJson(req, res, 400, { message: "O valor da fatura deve ser maior que zero." });
        }

        if (dueDate) {
          const normalizedDueDate = String(dueDate).trim().slice(0, 10);
          const today = getTodayInSaoPaulo();

          if (!normalizedDueDate || normalizedDueDate <= today) {
            return sendJson(req, res, 400, {
              message: "Escolha um vencimento a partir de amanhã para gerar a fatura."
            });
          }
        }

        const publicToken = createInvoiceToken();
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
          callbackUrl: ironCallbackUrl
        });

        const ironStatusValue = String(ironResponse.paymentStatus || ironResponse.status || "pending").toLowerCase();
        const normalizedInvoiceStatus = ironStatusValue === "ok" ? "pending" : ironStatusValue;

        const paymentUrl = `${appUrl.replace(/\/$/, "")}/fatura?token=${publicToken}`;
        const invoice = await createInvoice({
          ownerId: admin.id,
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
          ironStatus: normalizedInvoiceStatus,
          ironPixCode: ironResponse.pix?.code || null,
          ironPixImage: ironResponse.pix?.image || null,
          pixCode: ironResponse.pix?.code || null,
          pixImage: ironResponse.pix?.image || null,
          paymentUrl,
          callbackUrl: ironCallbackUrl,
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

        return sendJson(req, res, 201, { invoice: normalizeInvoicePayload(invoice) });
      }

      return sendJson(req, res, 405, { message: "Método não permitido." });
    }

    if (action === "invoices-sync") {
      if (req.method !== "POST") {
        return sendJson(req, res, 405, { message: "Método não permitido." });
      }

      const id = getQueryParam(req, "id");
      if (!id) {
        return sendJson(req, res, 400, { message: "ID da fatura não informado." });
      }

      await assertOwned(admin,"invoices",id);
      const invoice = await findInvoiceById(String(id).trim());
      if (!invoice) {
        return sendJson(req, res, 404, { message: "Fatura não encontrada." });
      }

      const transaction = await fetchIronTransaction({
        id: invoice.ironTransactionHash || invoice.sigiloTransactionId,
        identifier: invoice.publicToken
      });

      const updatedInvoice = await syncInvoiceWithIron(invoice, transaction);
      return sendJson(req, res, 200, { invoice: normalizeInvoicePayload(updatedInvoice) });
    }

    return sendJson(req, res, 404, { message: "Rota administrativa não encontrada." });
  } catch (error) {
    if (error.status) return sendJson(req,res,error.status,{message:error.message});
    console.error(error);
    if (error.code === "23505") return sendJson(req,res,409,{message:"Já existe um cadastro com estes dados."});

    if (action === "session") {
      return sendJson(req, res, 500, { message: "Erro ao acessar o painel admin." });
    }

    if (action === "dashboard") {
      return sendJson(req, res, 500, { message: "Erro ao carregar o painel admin." });
    }

    if (action === "customers") {
      return sendJson(req, res, 500, { message: "Erro ao processar cliente." });
    }

    if (action === "catalog-items") {
      return sendJson(req, res, 500, { message: "Erro ao processar item do catálogo." });
    }

    if (action === "contracts") {
      return sendJson(req, res, 500, { message: "Erro ao gerar contrato." });
    }

    if (action === "drivers") {
      return sendJson(req, res, 500, { message: "Erro ao processar motorista." });
    }

    if (action === "yards") {
      return sendJson(req, res, 500, { message: "Erro ao cadastrar pátio." });
    }

    if (action === "invoices") {
      return sendJson(
        req,
        res,
        /NowBank|NowHubPay|IronPay|SyncPay/i.test(String(error.message || "")) ? 503 : 500,
        { message: error.message || "Erro ao gerar fatura." }
      );
    }

    if (action === "invoices-sync") {
      return sendJson(req, res, 502, { message: "Erro ao sincronizar fatura." });
    }

    return sendJson(req, res, 500, { message: "Erro ao cadastrar rastreio." });
  }
}
