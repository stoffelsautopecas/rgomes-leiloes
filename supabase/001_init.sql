create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  whatsapp text not null,
  cpf text not null unique,
  cep text not null,
  address text not null,
  number text not null,
  district text not null,
  complement text,
  city text,
  state text,
  photo_url text,
  password_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_users_email_idx on public.app_users (lower(email));
create index if not exists app_users_cpf_digits_idx on public.app_users ((regexp_replace(cpf, '\D', '', 'g')));
create index if not exists app_refresh_tokens_user_id_idx on public.app_refresh_tokens (user_id);
create index if not exists app_refresh_tokens_expires_at_idx on public.app_refresh_tokens (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_app_users_updated_at on public.app_users;

create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();
