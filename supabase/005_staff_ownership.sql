-- Existing records keep owner_id=NULL and remain visible to administrators only.
-- Run after the base schema (users, contracts, invoices and tracking) exists.
alter table public.app_users
  add column if not exists is_active boolean not null default true,
  add column if not exists owner_id uuid references public.app_users(id);
alter table public.app_client_tracking add column if not exists owner_id uuid references public.app_users(id);
alter table public.app_contracts add column if not exists owner_id uuid references public.app_users(id);
alter table public.app_invoices add column if not exists owner_id uuid references public.app_users(id);
create index if not exists app_users_owner_idx on public.app_users(owner_id);
create index if not exists app_client_tracking_owner_idx on public.app_client_tracking(owner_id);
create index if not exists app_contracts_owner_idx on public.app_contracts(owner_id);
create index if not exists app_invoices_owner_idx on public.app_invoices(owner_id);
