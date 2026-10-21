import { TRACKING_ANIMATION_SCHEMA } from "./tracking-animation-schema.js";
import { pool } from "../auth/db.js";
import { comparePassword, hashPassword } from "../auth/security.js";
import { createUser, findUserByEmailOrCpf, updateUserPasswordAndRole } from "../auth/repository.js";
import { DEFAULT_CATALOG_ITEMS } from "./default-catalog.js";
import { countContracts, ensureContractSchema, listContracts } from "../contracts/repository.js";

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.invalid").trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

let adminSchemaPromise;
let defaultCatalogPromise;

export const ensureAdminSchema = async () => {
  if (!adminSchemaPromise) {
    adminSchemaPromise = pool.query(`
      alter table public.app_users
      add column if not exists role text not null default 'customer';

      alter table public.app_users
        add column if not exists is_active boolean not null default true,
        add column if not exists owner_id uuid references public.app_users(id);
      create index if not exists app_users_owner_idx on public.app_users(owner_id);
      alter table public.app_users
      add column if not exists photo_url text;

      create index if not exists app_users_role_idx on public.app_users (role);

      create table if not exists public.app_catalog_items (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        slug text not null unique,
        category text not null,
        sections text[] not null default '{}',
        price numeric(12, 2) not null default 0,
        location text,
        year_label text,
        image_url text,
        gallery_images jsonb not null default '[]'::jsonb,
        whatsapp text,
        badge text,
        gallery_count integer not null default 1,
        description text,
        is_published boolean not null default true,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );

      alter table public.app_catalog_items
      add column if not exists gallery_images jsonb not null default '[]'::jsonb;

      create table if not exists public.app_drivers (
        id uuid primary key default gen_random_uuid(),
        full_name text not null,
        cpf text,
        cnh text,
        phone text,
        email text,
        commercial_address text,
        photo_url text,
        status text not null default 'ativo',
        notes text,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );

      alter table public.app_drivers
      add column if not exists commercial_address text;

      alter table public.app_drivers
      add column if not exists photo_url text;

      create table if not exists public.app_yards (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        city text,
        state text,
        address text,
        contact_name text,
        contact_phone text,
        capacity_info text,
        notes text,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );

      create table if not exists public.app_client_tracking (
        id uuid primary key default gen_random_uuid(),
        client_user_id uuid references public.app_users(id) on delete set null,
        client_name text not null,
        client_email text,
        catalog_item_id uuid references public.app_catalog_items(id) on delete set null,
        item_name text not null,
        driver_id uuid references public.app_drivers(id) on delete set null,
        yard_id uuid references public.app_yards(id) on delete set null,
        tracking_code text not null unique,
        status text not null default 'em separacao',
        alert_message text,
        current_location text,
        expected_delivery_date date,
        notes text,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      );

      alter table public.app_client_tracking
      add column if not exists alert_message text;
      alter table public.app_client_tracking
        add column if not exists owner_id uuid references public.app_users(id),
        add column if not exists animation_paused boolean,
        add column if not exists manual_vehicle_year text,
        add column if not exists manual_vehicle_description text,
        add column if not exists manual_vehicle_image text;

      ${TRACKING_ANIMATION_SCHEMA}

      create index if not exists app_client_tracking_owner_idx on public.app_client_tracking(owner_id);
      create index if not exists app_catalog_items_category_idx on public.app_catalog_items (category);
      create index if not exists app_catalog_items_sections_idx on public.app_catalog_items using gin (sections);
      create index if not exists app_drivers_status_idx on public.app_drivers (status);
      create index if not exists app_yards_state_idx on public.app_yards (state);
      create index if not exists app_client_tracking_status_idx on public.app_client_tracking (status);
      create index if not exists app_client_tracking_client_user_id_idx on public.app_client_tracking (client_user_id);

      drop trigger if exists set_app_catalog_items_updated_at on public.app_catalog_items;
      create trigger set_app_catalog_items_updated_at
      before update on public.app_catalog_items
      for each row
      execute function public.set_updated_at();

      drop trigger if exists set_app_drivers_updated_at on public.app_drivers;
      create trigger set_app_drivers_updated_at
      before update on public.app_drivers
      for each row
      execute function public.set_updated_at();

      drop trigger if exists set_app_yards_updated_at on public.app_yards;
      create trigger set_app_yards_updated_at
      before update on public.app_yards
      for each row
      execute function public.set_updated_at();

      drop trigger if exists set_app_client_tracking_updated_at on public.app_client_tracking;
      create trigger set_app_client_tracking_updated_at
      before update on public.app_client_tracking
      for each row
      execute function public.set_updated_at();
    `);
  }

  return adminSchemaPromise;
};

export const ensureDefaultAdminUser = async () => {
  if (!DEFAULT_ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD não configurada.");
  }

  await ensureAdminSchema();

  const admin = await findUserByEmailOrCpf(DEFAULT_ADMIN_EMAIL, "");
  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

  if (!admin) {
    // Preserve the bootstrap administrator when its configured email changes.
    // Its reserved CPF is unique and cannot be inserted for a second account.
    const { rows: migratedAdmins } = await pool.query(
      `update public.app_users
       set email = $1, password_hash = $2
       where cpf = '000.000.000-00' and role = 'admin'
       returning *`,
      [DEFAULT_ADMIN_EMAIL, passwordHash]
    );
    if (migratedAdmins[0]) {
      return migratedAdmins[0];
    }

    return createUser({
      fullName: "Administrador RGOMES LEILÕES",
      email: DEFAULT_ADMIN_EMAIL,
      whatsapp: "",
      cpf: "000.000.000-00",
      cep: "86072-160",
      address: "Rua Figueira",
      number: "570",
      district: "Santa Rita I",
      complement: null,
      city: "Londrina",
      state: "PR",
      photoUrl: null,
      passwordHash,
      role: "admin"
    });
  }

  const passwordMatches = await comparePassword(DEFAULT_ADMIN_PASSWORD, admin.password_hash);
  if (admin.role !== "admin" || !passwordMatches) {
    return updateUserPasswordAndRole(admin.id, passwordHash, "admin");
  }

  return admin;
};

export const ensureDefaultCatalogItems = async () => {
  await ensureAdminSchema();

  if (!defaultCatalogPromise) {
    defaultCatalogPromise = (async () => {
      for (const item of DEFAULT_CATALOG_ITEMS) {
        await pool.query(
          `
            insert into public.app_catalog_items (
              title, slug, category, sections, price, location, year_label, image_url, gallery_images,
              whatsapp, badge, gallery_count, description, is_published
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,true)
            on conflict (slug) do nothing
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
            JSON.stringify(Array.isArray(item.galleryImages) && item.galleryImages.length ? item.galleryImages : [item.imageUrl]),
            item.whatsapp || null,
            item.badge || item.category,
            item.galleryCount || (Array.isArray(item.galleryImages) && item.galleryImages.length ? item.galleryImages.length : 1),
            item.description
          ]
        );
      }
    })();
  }

  return defaultCatalogPromise;
};

export const getAdminDashboardData = async (ownerId = null) => {
  await ensureAdminSchema();
  await ensureContractSchema();
  await ensureDefaultCatalogItems();

  const [users, catalogItems, drivers, yards, trackings, contracts, contractsTotal] = await Promise.all([
    pool.query(`
      select id, full_name, email, whatsapp, cpf, address, number, complement, district, cep, city, state, role, created_at, owner_id, (select full_name from public.app_users owner where owner.id=app_users.owner_id) as owner_name
      from public.app_users
      where role='customer' and ($1::uuid is null or owner_id=$1)
      order by created_at desc
    `, [ownerId]),
    pool.query(`
      select id, title, slug, category, sections, price, location, year_label, image_url, gallery_images, badge, gallery_count, description, is_published, created_at
      from public.app_catalog_items
      order by created_at desc
    `),
    pool.query(`
      select id, full_name, cpf, cnh, phone, email, commercial_address, photo_url, status, notes, created_at
      from public.app_drivers
      order by created_at desc
    `),
    pool.query(`
      select id, name, city, state, address, contact_name, contact_phone, capacity_info, notes, created_at
      from public.app_yards
      order by created_at desc
    `),
    pool.query(`
      select
        t.id,
        t.owner_id,
        (select full_name from public.app_users owner where owner.id=t.owner_id) as owner_name,
        t.client_name,
        t.client_email,
        t.item_name,
        t.tracking_code,
        t.status,
        t.animation_paused,
        t.animation_progress,
        t.animation_running_since,
        now() as animation_server_time,
        t.alert_message,
        t.current_location,
        t.expected_delivery_date,
        t.notes,
        t.created_at,
        d.full_name as driver_name,
        y.name as yard_name
      from public.app_client_tracking t
      left join public.app_drivers d on d.id = t.driver_id
      left join public.app_yards y on y.id = t.yard_id
      where ($1::uuid is null or t.owner_id=$1)
      order by t.created_at desc
    `, [ownerId]),
    listContracts({ limit: 5, ownerId }),
    countContracts(ownerId)
  ]);

  return {
    users: users.rows,
    catalogItems: catalogItems.rows,
    drivers: drivers.rows,
    yards: yards.rows,
    trackings: trackings.rows,
    contracts,
    contractsTotal
  };
};

export const createCatalogItem = async ({
  title,
  slug,
  category,
  sections,
  price,
  location,
  yearLabel,
  imageUrl,
  galleryImages,
  whatsapp,
  badge,
  galleryCount,
  description
}) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_catalog_items (
        title, slug, category, sections, price, location, year_label, image_url, gallery_images, whatsapp, badge, gallery_count, description
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
      returning *
    `,
    [
      title,
      slug,
      category,
      sections,
      price,
      location,
      yearLabel,
      imageUrl,
      JSON.stringify(Array.isArray(galleryImages) ? galleryImages : []),
      whatsapp,
      badge,
      galleryCount,
      description
    ]
  );

  return rows[0];
};

export const updateCatalogItem = async (
  id,
  {
    title,
    slug,
    category,
    sections,
    price,
    location,
    yearLabel,
    imageUrl,
    galleryImages,
    whatsapp,
    badge,
    galleryCount,
    description
  }
) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      update public.app_catalog_items
      set
        title = $2,
        slug = $3,
        category = $4,
        sections = $5,
        price = $6,
        location = $7,
        year_label = $8,
        image_url = $9,
        gallery_images = $10::jsonb,
        whatsapp = $11,
        badge = $12,
        gallery_count = $13,
        description = $14,
        updated_at = timezone('utc', now())
      where id = $1
      returning *
    `,
    [
      id,
      title,
      slug,
      category,
      sections,
      price,
      location,
      yearLabel,
      imageUrl,
      JSON.stringify(Array.isArray(galleryImages) ? galleryImages : []),
      whatsapp,
      badge,
      galleryCount,
      description
    ]
  );

  return rows[0] || null;
};

export const deleteCatalogItem = async (id) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      delete from public.app_catalog_items
      where id = $1
      returning id
    `,
    [id]
  );

  return rows[0] || null;
};

export const createDriver = async ({ fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes }) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_drivers (full_name, cpf, cnh, phone, email, commercial_address, photo_url, status, notes)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning *
    `,
    [fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes]
  );

  return rows[0];
};

export const updateDriver = async (id, { fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes }) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      update public.app_drivers
      set
        full_name = $2,
        cpf = $3,
        cnh = $4,
        phone = $5,
        email = $6,
        commercial_address = $7,
        photo_url = coalesce($8, photo_url),
        status = $9,
        notes = $10
      where id = $1
      returning *
    `,
    [id, fullName, cpf, cnh, phone, email, commercialAddress, photoUrl, status, notes]
  );

  return rows[0] || null;
};

export const createYard = async ({
  name,
  city,
  state,
  address,
  contactName,
  contactPhone,
  capacityInfo,
  notes
}) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_yards (name, city, state, address, contact_name, contact_phone, capacity_info, notes)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      returning *
    `,
    [name, city, state, address, contactName, contactPhone, capacityInfo, notes]
  );

  return rows[0];
};

export const updateYard = async (id, {name,city,state,address,contactName,contactPhone,capacityInfo,notes}) => {
  await ensureAdminSchema();
  const {rows}=await pool.query(`update public.app_yards set name=$2,city=$3,state=$4,address=$5,contact_name=$6,contact_phone=$7,capacity_info=$8,notes=$9 where id=$1 returning *`,[id,name,city,state,address,contactName,contactPhone,capacityInfo,notes]);
  return rows[0] || null;
};

export const createTracking = async ({
  ownerId = null,
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
}) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      insert into public.app_client_tracking (
        client_user_id, client_name, client_email, catalog_item_id, item_name, driver_id, yard_id,
        tracking_code, status, alert_message, current_location, expected_delivery_date, notes,
        manual_vehicle_year, manual_vehicle_description, manual_vehicle_image, owner_id
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      returning *
    `,
    [
      clientUserId || null,
      clientName,
      clientEmail,
      catalogItemId || null,
      itemName,
      driverId || null,
      yardId || null,
      trackingCode,
      status,
      alertMessage,
      currentLocation,
      expectedDeliveryDate || null,
      notes,
      catalogItemId ? null : manualVehicleYear || null,
      catalogItemId ? null : manualVehicleDescription || null,
      catalogItemId ? null : manualVehicleImage || null,
      ownerId
    ]
  );

  return rows[0];
};

export const listPublicCatalogItems = async ({
  section = null,
  category = null,
  search = null,
  excludeSlug = null,
  limit = null
} = {}) => {
  await ensureAdminSchema();
  await ensureDefaultCatalogItems();

  const conditions = ["is_published = true"];
  const values = [];

  if (section) {
    values.push(section);
    conditions.push(`$${values.length} = any(sections)`);
  }

  if (category) {
    values.push(category);
    conditions.push(`category ilike $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(title ilike $${values.length} or category ilike $${values.length} or coalesce(location, '') ilike $${values.length})`);
  }

  if (excludeSlug) {
    values.push(excludeSlug);
    conditions.push(`slug <> $${values.length}`);
  }

  const limitClause = limit ? `limit ${Number(limit)}` : "";
  const query = `
    select
      id,
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
      description,
      is_published,
      created_at
    from public.app_catalog_items
    where ${conditions.join(" and ")}
    order by created_at desc
    ${limitClause}
  `;

  const { rows } = await pool.query(query, values);
  return rows;
};

export const findPublicCatalogItemBySlug = async (slug) => {
  await ensureAdminSchema();
  await ensureDefaultCatalogItems();

  const { rows } = await pool.query(
    `
      select
        id,
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
        description,
        is_published,
        created_at
      from public.app_catalog_items
      where slug = $1
        and is_published = true
      limit 1
    `,
    [slug]
  );

  return rows[0] || null;
};

export const findPublicTrackingByCode = async (trackingCode) => {
  await ensureAdminSchema();

  const { rows } = await pool.query(
    `
      select
        t.id,
        t.client_name,
        t.client_email,
        t.item_name,
        t.tracking_code,
        t.status,
        t.current_location,
        t.expected_delivery_date,
        t.notes,
        t.created_at,
        d.full_name as driver_name,
        y.name as yard_name,
        y.city as yard_city,
        y.state as yard_state,
        concat_ws(', ',
          nullif(u.address, ''),
          nullif(u.number, ''),
          nullif(u.district, ''),
          nullif(u.city, ''),
          nullif(u.state, ''),
          nullif(u.cep, '')
        ) as destination_address
      from public.app_client_tracking t
      left join public.app_drivers d on d.id = t.driver_id
      left join public.app_yards y on y.id = t.yard_id
      left join public.app_users u on u.id = t.client_user_id
      where upper(t.tracking_code) = upper($1)
      limit 1
    `,
    [trackingCode]
  );

  return rows[0] || null;
};

export const getCustomerTrackingDashboard = async ({ userId, email, motionOnly = false }) => {
  await ensureAdminSchema();

  if (motionOnly) {
    const {rows} = await pool.query(`select id, animation_paused, animation_progress,
      animation_running_since, now() as animation_server_time, updated_at
      from public.app_client_tracking
      where ($1::uuid is not null and client_user_id = $1::uuid)
         or ($2::text is not null and lower(coalesce(client_email, '')) = lower($2::text))`, [userId || null, email || null]);
    return rows;
  }
  const values = [userId || null, email || null];
  const { rows } = await pool.query(
    `
      select
        t.id,
        t.client_user_id,
        t.client_name,
        t.client_email,
        coalesce(c.year_label, t.manual_vehicle_year) as item_year,
        c.category as item_category,
        coalesce(c.image_url, t.manual_vehicle_image) as item_image_url,
        coalesce(c.description, t.manual_vehicle_description) as item_description,
        c.gallery_images as item_gallery_images,
        t.item_name,
        t.tracking_code,
        t.status,
        t.animation_paused,
        t.animation_progress,
        t.animation_running_since,
        now() as animation_server_time,
        t.alert_message,
        t.current_location,
        t.expected_delivery_date,
        t.notes,
        t.created_at,
        t.updated_at,
        d.id as driver_id,
        d.full_name as driver_name,
        d.phone as driver_phone,
        d.email as driver_email,
        d.commercial_address as driver_commercial_address,
        d.photo_url as driver_photo_url,
        d.cnh as driver_cnh,
        d.status as driver_status,
        d.notes as driver_notes,
        y.id as yard_id,
        y.name as yard_name,
        y.city as yard_city,
        y.state as yard_state,
        y.address as yard_address,
        y.contact_name as yard_contact_name,
        y.contact_phone as yard_contact_phone,
        concat_ws(', ',
          nullif(u.address, ''),
          nullif(u.number, ''),
          nullif(u.complement, ''),
          nullif(u.district, ''),
          nullif(u.city, ''),
          nullif(u.state, ''),
          nullif(u.cep, '')
        ) as destination_address
      from public.app_client_tracking t
      left join public.app_catalog_items c on c.id = t.catalog_item_id
      left join public.app_drivers d on d.id = t.driver_id
      left join public.app_yards y on y.id = t.yard_id
      left join public.app_users u on u.id = t.client_user_id
      where (
        ($1::uuid is not null and t.client_user_id = $1::uuid)
        or ($2::text is not null and lower(coalesce(t.client_email, '')) = lower($2::text))
      )
      order by t.created_at desc
    `,
    values
  );

  return rows;
};

export const updateTrackingStatus = async ({ id, status, currentLocation, animationPaused, animationReset = false }) => {
  await ensureAdminSchema();
  const client = animationReset ? await pool.connect() : pool;
  try {
    if (animationReset) await client.query("begin");
    const { rows } = await client.query(`
      update public.app_client_tracking
      set status = $2,
          animation_paused = case when $5::boolean then true else coalesce($4::boolean, animation_paused) end,
          current_location = case when $3::text is null then current_location else nullif($3, '') end,
          alert_message = $2,
          updated_at = timezone('utc', now())
      where id = $1
      returning *
    `, [id, status, currentLocation ?? null, animationPaused ?? null, animationReset]);
    if (!rows[0]) {
      if (animationReset) await client.query("commit");
      return null;
    }
    if (!animationReset) return rows[0];

    // This second update deliberately omits status/animation_paused, so the
    // progress-preservation trigger does not override an explicit reset.
    const reset = await client.query(`
      update public.app_client_tracking
      set animation_progress = 0,
          animation_running_since = null,
          updated_at = timezone('utc', now())
      where id = $1
      returning *
    `, [id]);
    await client.query("commit");
    return reset.rows[0] || null;
  } catch (error) {
    if (animationReset) await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    if (animationReset) client.release();
  }
};

export const findTrackingById = async (id) => {
  const { rows } = await pool.query("select client_user_id, client_email from public.app_client_tracking where id = $1", [id]);
  return rows[0] || null;
};
