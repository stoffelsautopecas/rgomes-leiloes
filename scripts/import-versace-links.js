import fs from "fs";

import { ensureAdminSchema } from "../src/admin/repository.js";
import { pool } from "../src/auth/db.js";

const SOURCE_SUPABASE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_SUPABASE_KEY = process.env.SOURCE_SUPABASE_KEY;

const DEFAULT_WHATSAPP = process.env.DEFAULT_WHATSAPP || "5511948790154";
const DEFAULT_BADGE = process.env.DEFAULT_IMPORT_BADGE || "Máquinas";
const DEFAULT_SECTIONS = (process.env.DEFAULT_IMPORT_SECTIONS || "catalogo").split(",").map((value) => value.trim()).filter(Boolean);

const parseArgs = (argv) => {
  const options = {
    apply: false,
    reset: false,
    file: null,
    sections: DEFAULT_SECTIONS,
    badge: DEFAULT_BADGE,
    whatsapp: DEFAULT_WHATSAPP,
    category: null,
    yearLabel: null,
    location: "",
    urls: []
  };

  argv.forEach((arg) => {
    if (arg === "--apply") {
      options.apply = true;
      return;
    }

    if (arg === "--reset") {
      options.reset = true;
      return;
    }

    if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length).trim();
      return;
    }

    if (arg.startsWith("--sections=")) {
      options.sections = arg
        .slice("--sections=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      return;
    }

    if (arg.startsWith("--badge=")) {
      options.badge = arg.slice("--badge=".length).trim() || DEFAULT_BADGE;
      return;
    }

    if (arg.startsWith("--whatsapp=")) {
      options.whatsapp = arg.slice("--whatsapp=".length).trim() || DEFAULT_WHATSAPP;
      return;
    }

    if (arg.startsWith("--category=")) {
      options.category = arg.slice("--category=".length).trim() || null;
      return;
    }

    if (arg.startsWith("--year-label=")) {
      options.yearLabel = arg.slice("--year-label=".length).trim() || null;
      return;
    }

    if (arg.startsWith("--location=")) {
      options.location = arg.slice("--location=".length).trim();
      return;
    }

    options.urls.push(arg);
  });

  return options;
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const formatPrice = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

const parseSourceId = (value) => {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  const productIndex = parts.findIndex((part) => part === "produto" || part === "veiculo");
  if (productIndex === -1 || !parts[productIndex + 1]) {
    throw new Error(`Link não reconhecido: ${value}`);
  }
  return parts[productIndex + 1];
};

const getUrlsFromFile = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
};

const fetchSourceVehicle = async (sourceId) => {
  if (!SOURCE_SUPABASE_URL || !SOURCE_SUPABASE_KEY) {
    throw new Error("Configure SOURCE_SUPABASE_URL e SOURCE_SUPABASE_KEY para usar o importador.");
  }
  const query = new URL(`${SOURCE_SUPABASE_URL}/rest/v1/vehicles`);
  query.searchParams.set("id", `eq.${sourceId}`);
  query.searchParams.set("select", "*");

  const response = await fetch(query, {
    headers: {
      apikey: SOURCE_SUPABASE_KEY,
      Authorization: `Bearer ${SOURCE_SUPABASE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar anúncio ${sourceId}: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Anúncio não encontrado para o id ${sourceId}.`);
  }

  return rows[0];
};

const buildCatalogItem = (sourceRecord, options, sourceUrl) => {
  const title = String(sourceRecord.name || "").trim();
  const galleryImages = Array.isArray(sourceRecord.photos) ? sourceRecord.photos.filter(Boolean) : [];
  const imageUrl = galleryImages[0] || null;

  return {
    sourceUrl,
    sourceId: sourceRecord.id,
    title,
    slug: slugify(title),
    category: options.category || String(sourceRecord.category || "Máquinas").trim() || "Máquinas",
    sections: options.sections,
    price: Number(sourceRecord.price || 0),
    location: options.location,
    yearLabel: options.yearLabel,
    imageUrl,
    galleryImages,
    whatsapp: options.whatsapp,
    badge: options.badge,
    galleryCount: galleryImages.length || 1,
    description: String(sourceRecord.description || "").trim()
  };
};

const upsertCatalogItem = async (item) => {
  await pool.query(
    `
      insert into public.app_catalog_items (
        title, slug, category, sections, price, location, year_label, image_url,
        gallery_images, whatsapp, badge, gallery_count, description, is_published
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,true)
      on conflict (slug) do update set
        title = excluded.title,
        category = excluded.category,
        sections = excluded.sections,
        price = excluded.price,
        location = excluded.location,
        year_label = excluded.year_label,
        image_url = excluded.image_url,
        gallery_images = excluded.gallery_images,
        whatsapp = excluded.whatsapp,
        badge = excluded.badge,
        gallery_count = excluded.gallery_count,
        description = excluded.description,
        is_published = true,
        updated_at = timezone('utc', now())
    `,
    [
      item.title,
      item.slug,
      item.category,
      item.sections,
      item.price,
      item.location || null,
      item.yearLabel || null,
      item.imageUrl,
      JSON.stringify(item.galleryImages),
      item.whatsapp,
      item.badge,
      item.galleryCount,
      item.description
    ]
  );
};

const printPreview = (items) => {
  const preview = items.map((item) => ({
    titulo: item.title,
    slug: item.slug,
    preco: formatPrice(item.price),
    categoria: item.category,
    secoes: item.sections.join(", "),
    fotos: item.galleryImages.length,
    primeiraFoto: item.imageUrl,
    descricao: item.description,
    linkOrigem: item.sourceUrl
  }));

  console.log(JSON.stringify(preview, null, 2));
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const fileUrls = options.file ? getUrlsFromFile(options.file) : [];
  const urls = [...options.urls, ...fileUrls];

  if (urls.length === 0) {
    console.log("Uso:");
    console.log("  node scripts/import-versace-links.js <link1> <link2> ...");
    console.log("  node scripts/import-versace-links.js --file=./links.txt --apply");
    console.log("Opções:");
    console.log("  --apply                 grava no catálogo/admin");
    console.log("  --reset                 apaga o catálogo atual antes de importar");
    console.log("  --sections=catalogo,destaques,relacionados");
    console.log("  --badge=Máquinas");
    console.log("  --whatsapp=5511948790154");
    console.log("  --category=Colheitadeiras");
    console.log("  --year-label=2012");
    console.log("  --location=São Paulo, SP");
    return;
  }

  try {
    const items = [];

    for (const sourceUrl of urls) {
      const sourceId = parseSourceId(sourceUrl);
      const sourceRecord = await fetchSourceVehicle(sourceId);
      items.push(buildCatalogItem(sourceRecord, options, sourceUrl));
    }

    printPreview(items);

    if (!options.apply) {
      console.log("\nPreview gerado. Para gravar no catálogo, rode novamente com --apply.");
      return;
    }

    await ensureAdminSchema();

    if (options.reset) {
      await pool.query("delete from public.app_catalog_items");
    }

    for (const item of items) {
      await upsertCatalogItem(item);
    }

    console.log(`\nImportação concluída: ${items.length} item(ns) salvo(s) no catálogo.`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
