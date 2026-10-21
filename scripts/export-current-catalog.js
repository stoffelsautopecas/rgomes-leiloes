import fs from "fs";
import path from "path";

import { pool } from "../src/auth/db.js";
import { ensureAdminSchema } from "../src/admin/repository.js";

const OUTPUT_FILE = path.resolve("src/admin/default-catalog.js");

const normalizeItem = (row) => ({
  title: row.title,
  slug: row.slug,
  category: row.category,
  sections: Array.isArray(row.sections) ? row.sections : [],
  price: Number(row.price || 0),
  location: row.location || "",
  yearLabel: row.year_label || null,
  imageUrl: row.image_url || null,
  galleryImages: Array.isArray(row.gallery_images) ? row.gallery_images : [],
  whatsapp: row.whatsapp || "5511948790154",
  badge: row.badge || "Máquinas",
  galleryCount: Number(row.gallery_count || 0),
  description: row.description || null
});

const buildSource = (items) => {
  const body = items
    .map((item) => `  ${JSON.stringify(item, null, 2).replace(/\n/g, "\n  ")}`)
    .join(",\n");

  return `export const DEFAULT_CATALOG_ITEMS = [\n${body}\n];\n`;
};

const main = async () => {
  try {
    await ensureAdminSchema();
    const { rows } = await pool.query(`
      select
        title,
        slug,
        category,
        sections,
        price,
        location,
        year_label,
        image_url,
        gallery_images,
        whatsapp,
        badge,
        gallery_count,
        description
      from public.app_catalog_items
      order by created_at asc, title asc
    `);

    const items = rows.map(normalizeItem);
    fs.writeFileSync(OUTPUT_FILE, buildSource(items), "utf8");

    console.log(`default-catalog.js atualizado com ${items.length} item(ns).`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
