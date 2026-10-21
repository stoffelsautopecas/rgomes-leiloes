import fs from "fs";
import path from "path";

import { pool } from "../src/auth/db.js";
import { ensureAdminSchema } from "../src/admin/repository.js";

const SOURCE_ROOT = "/home/paulo-pereira/Veiculos agros";
const TARGET_ROOT = path.resolve("public/catalogo-assets");
const OUTPUT_FILE = path.resolve("src/admin/default-catalog.js");

const VEHICLES = [
  {
    folder: "1",
    title: "SAVEIRO CD CROSS 1.6 16V",
    slug: "saveiro-cd-cross-1-6-16v",
    category: "Picapes Pequenas",
    badge: "Carros",
    price: 60915,
    location: "São Paulo, SP",
    yearLabel: "2016/2017",
    sections: ["catalogo", "destaques", "relacionados"],
    description:
      "Marca: VOLKSWAGEN\nModelo: SAVEIRO CD\nCategoria: Picapes Pequenas\nVersão: SAVEIRO CD CROSS 1.6 16V\nAno de Fabricação: 2016\nAno Modelo: 2017\nFIPE: R$ 60.915,00"
  },
  {
    folder: "2",
    title: "COROLLA GLI CVT 1.8 16V",
    slug: "corolla-gli-cvt-1-8-16v",
    category: "Automóveis",
    badge: "Carros",
    price: 36000,
    location: "São Paulo, SP",
    yearLabel: "2016/2017",
    sections: ["catalogo", "relacionados"],
    description:
      "Marca: TOYOTA\nModelo: COROLLA\nTipo de veículo: Automóveis\nVersão: COROLLA GLI CVT 1.8 16V\nAno de fabricação: 2016\nModelo do Ano Lote: 2017\nPAV: R$ 69.622,00"
  },
  {
    folder: "3",
    title: "HB20S COMFORT",
    slug: "hb20s-comfort",
    category: "Automóveis",
    badge: "Carros",
    price: 23500,
    location: "São Paulo, SP",
    yearLabel: "2017",
    sections: ["catalogo", "destaques"],
    description:
      "Marca: HYUNDAI\nModelo: HB20S\nCategoria: Automóveis\nVersão: HB20S COMFORT\nAno de Fabricação: 2017\nAno Modelo: 2017\nFIPE: R$ 43.662,00"
  },
  {
    folder: "4",
    title: "CITY LX 1.5 16V I-VTEC",
    slug: "city-lx-1-5-16v-i-vtec",
    category: "Automóveis",
    badge: "Carros",
    price: 30900,
    location: "São Paulo, SP",
    yearLabel: "2016/2017",
    sections: ["catalogo", "relacionados"],
    description:
      "Marca: HONDA\nModelo: CITY\nCategoria: Automóveis\nVersão: CITY LX 1.5 16V I-VTEC\nAno de Fabricação: 2016\nAno Modelo: 2017\nFIPE: R$ 61.377,00"
  },
  {
    folder: "5",
    title: "HILUX SW4 SRX 2.8 D-4D",
    slug: "hilux-sw4-srx-2-8-d-4d",
    category: "SUV Grandes",
    badge: "Carros",
    price: 94000,
    location: "São Paulo, SP",
    yearLabel: "2016",
    sections: ["catalogo", "destaques", "relacionados"],
    description:
      "Marca: TOYOTA\nModelo: HILUX SW4\nCategoria: SUV Grandes\nVersão: HILUX SW4 SRX 2.8 D-4D\nAno de Fabricação: 2016\nAno Modelo: 2016"
  },
  {
    folder: "6",
    title: "CLIO EXPRESSION 1.0 16V",
    slug: "clio-expression-1-0-16v",
    category: "Automóveis",
    badge: "Carros",
    price: 24314,
    location: "São Paulo, SP",
    yearLabel: "2015/2016",
    sections: ["catalogo", "relacionados"],
    description:
      "Marca: RENAULT\nModelo: CLIO\nVersão: CLIO EXPRESSION 1.0 16V\nAno de Fabricação: 2015\nAno Modelo: 2016"
  },
  {
    folder: "7",
    title: "Mercedes GLA 200 1.6 16V",
    slug: "mercedes-gla-200-1-6-16v",
    category: "Automóveis",
    badge: "Carros",
    price: 128859,
    location: "São Paulo, SP",
    yearLabel: "2015/2016",
    sections: ["catalogo", "destaques"],
    description:
      "Marca: MERCEDES BENZ\nModelo: CLASSE GLA\nVersão: CLASSE GLA 200 1.6 16V TURBO\nAno de Fabricação: 2015\nAno Modelo: 2016\nFIPE: R$ 128.859,00"
  },
  {
    folder: "8",
    title: "CIVIC EXR 2.0 16V I-VTEC",
    slug: "civic-exr-2-0-16v-i-vtec",
    category: "Automóveis",
    badge: "Carros",
    price: 70809,
    location: "São Paulo, SP",
    yearLabel: "2015/2016",
    sections: ["catalogo", "relacionados"],
    description:
      "Marca: HONDA\nModelo: CIVIC\nCategoria: Automóveis\nVersão: CIVIC EXR 2.0 16V I-VTEC\nAno de Fabricação: 2015\nAno Modelo: 2016"
  },
  {
    folder: "9",
    title: "SONIC SEDAN LTZ AT 1.6 16V - 2014",
    slug: "sonic-sedan-ltz-at-1-6-16v-2014",
    category: "Automóveis",
    badge: "Carros",
    price: 35401,
    location: "São Paulo, SP",
    yearLabel: "2013/2014",
    sections: ["catalogo", "relacionados"],
    description:
      "Marca: CHEVROLET\nModelo: SONIC SEDAN\nCategoria: Automóveis\nAno de Fabricação: 2013\nAno Modelo: 2014\nTipo de Documento: Normal\nTipo de Chassi: Normal\nCondição: FINANCIAMENTO\nCondição Func.: Motor dá partida e funciona\nNúmero do Chassi: 3G1J85CD5E\nChave: Sim\nFinal de Placa: 5\nCombustível: FLEXÍVEL ÁLCOOL/GASOLINA"
  },
  {
    folder: "10",
    title: "STRADA CD ADVENTURE 1.8 16V",
    slug: "strada-cd-adventure-1-8-16v",
    category: "Picapes Pequenas",
    badge: "Carros",
    price: 45930,
    location: "São Paulo, SP",
    yearLabel: "2013/2014",
    sections: ["catalogo", "destaques", "relacionados"],
    description:
      "Marca: FIAT\nModelo: STRADA CD\nVersão: STRADA CD ADVENTURE 1.8 16V\nAno de Fabricação: 2013\nAno Modelo: 2014\nTipo de Documento: Normal\nTipo de Chassi: Normal\nChave: Sim\nFinal de Placa: 5\nCombustível: FLEXÍVEL ÁLCOOL/GASOLINA"
  }
];

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
};

const escapeForJs = (value) => JSON.stringify(value, null, 2);

const buildDefaultCatalogSource = (items) => {
  const body = items
    .map((item) => `  ${JSON.stringify(item, null, 2).replace(/\n/g, "\n  ")}`)
    .join(",\n");

  return `export const DEFAULT_CATALOG_ITEMS = [\n${body}\n];\n`;
};

const copyGallery = (vehicle) => {
  const sourceDir = path.join(SOURCE_ROOT, vehicle.folder);
  const targetDir = path.join(TARGET_ROOT, vehicle.slug);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const galleryImages = files.map((file, index) => {
    const ext = path.extname(file).toLowerCase() || ".jpg";
    const targetName = `${String(index + 1).padStart(2, "0")}${ext}`;
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, targetName));
    return `/catalogo-assets/${vehicle.slug}/${targetName}`;
  });

  return galleryImages;
};

const prepareItems = () =>
  VEHICLES.map((vehicle) => {
    const galleryImages = copyGallery(vehicle);
    return {
      ...vehicle,
      imageUrl: galleryImages[0],
      galleryImages,
      galleryCount: galleryImages.length,
      whatsapp: "5511948790154"
    };
  });

const resetDatabaseCatalog = async (items) => {
  await ensureAdminSchema();
  await pool.query("delete from public.app_catalog_items");

  for (const item of items) {
    await pool.query(
      `
        insert into public.app_catalog_items (
          title, slug, category, sections, price, location, year_label, image_url,
          gallery_images, whatsapp, badge, gallery_count, description, is_published
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,true)
      `,
      [
        item.title,
        item.slug,
        item.category,
        item.sections,
        item.price,
        item.location,
        item.yearLabel,
        item.imageUrl,
        JSON.stringify(item.galleryImages),
        item.whatsapp,
        item.badge,
        item.galleryCount,
        item.description
      ]
    );
  }
};

const main = async () => {
  try {
    fs.rmSync(TARGET_ROOT, { recursive: true, force: true });
    fs.mkdirSync(TARGET_ROOT, { recursive: true });

    const items = prepareItems();
    fs.writeFileSync(OUTPUT_FILE, buildDefaultCatalogSource(items), "utf8");
    await resetDatabaseCatalog(items);

    console.log(`Catálogo importado com sucesso: ${items.length} veículos.`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
