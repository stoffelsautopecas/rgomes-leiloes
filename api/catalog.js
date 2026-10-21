import { findPublicCatalogItemBySlug, listPublicCatalogItems } from "../src/admin/repository.js";
import { listPublicStaffContacts } from "../src/admin/staff.js";
import { getQueryParam, handleOptions, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(req, res, 405, { message: "Método não permitido." });
  }

  const action = getQueryParam(req, "action");
  try {
    if (action === "items") {
      const items = await listPublicCatalogItems({
        section: getQueryParam(req, "section"),
        category: getQueryParam(req, "category"),
        search: getQueryParam(req, "search"),
        excludeSlug: getQueryParam(req, "excludeSlug"),
        limit: getQueryParam(req, "limit") ? Number(getQueryParam(req, "limit")) : null
      });
      return sendJson(req, res, 200, { items });
    }

    if (action === "detail") {
      const slug = String(getQueryParam(req, "slug") || "").trim();
      if (!slug) return sendJson(req, res, 400, { message: "Slug do item não informado." });
      const item = await findPublicCatalogItemBySlug(slug);
      if (!item) return sendJson(req, res, 404, { message: "Item não encontrado." });
      return sendJson(req, res, 200, { item });
    }

    if (action === "contacts") {
      res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
      return sendJson(req, res, 200, { contacts: await listPublicStaffContacts() });
    }

    return sendJson(req, res, 404, { message: "Rota do catálogo não encontrada." });
  } catch (error) {
    console.error(error);
    return sendJson(req, res, 500, { message: "Erro ao carregar o catálogo." });
  }
}
