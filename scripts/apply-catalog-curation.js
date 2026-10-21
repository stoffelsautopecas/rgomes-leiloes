import { pool } from "../src/auth/db.js";
import { ensureAdminSchema } from "../src/admin/repository.js";
import { CATEGORY_OVERRIDES, FEATURED_MIX_SLUGS } from "../src/admin/catalog-curation.js";

const MAIN_SECTIONS = ["catalogo", "destaques", "relacionados"];

const main = async () => {
  await ensureAdminSchema();

  await pool.query("begin");

  try {
    const overrideEntries = Object.entries(CATEGORY_OVERRIDES);

    if (overrideEntries.length) {
      const cases = overrideEntries.map(([slug, category], index) => `when $${index * 2 + 1} then $${index * 2 + 2}`).join(" ");
      const values = overrideEntries.flatMap(([slug, category]) => [slug, category]);

      await pool.query(
        `
          update public.app_catalog_items
          set category = case slug ${cases} else category end,
              updated_at = timezone('utc', now())
          where slug = any($${values.length + 1}::text[])
        `,
        [...values, overrideEntries.map(([slug]) => slug)]
      );
    }

    await pool.query(
      `
        update public.app_catalog_items
        set sections = array_remove(sections, 'destaques'),
            updated_at = timezone('utc', now())
        where 'destaques' = any(sections)
      `
    );

    await pool.query(
      `
        update public.app_catalog_items
        set sections = $2::text[],
            updated_at = timezone('utc', now())
        where slug = $1
      `,
      [FEATURED_MIX_SLUGS[0], MAIN_SECTIONS]
    );

    if (FEATURED_MIX_SLUGS.length > 1) {
      await pool.query(
        `
          update public.app_catalog_items
          set sections = $2::text[],
              updated_at = timezone('utc', now())
          where slug = any($1::text[])
        `,
        [FEATURED_MIX_SLUGS.slice(1), MAIN_SECTIONS]
      );
    }

    const { rows } = await pool.query(
      `
        select title, slug, category, sections
        from public.app_catalog_items
        where slug = any($1::text[])
        order by array_position($1::text[], slug)
      `,
      [FEATURED_MIX_SLUGS]
    );

    await pool.query("commit");
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    await pool.query("rollback");
    throw error;
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
