alter table public.app_users
add column if not exists role text not null default 'customer';

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
  whatsapp text,
  badge text,
  gallery_count integer not null default 1,
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cpf text,
  cnh text,
  phone text,
  email text,
  status text not null default 'ativo',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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
  current_location text,
  expected_delivery_date date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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
