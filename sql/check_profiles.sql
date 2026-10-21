select
  id,
  full_name,
  email,
  whatsapp,
  cpf,
  cep,
  address,
  number,
  district,
  complement,
  city,
  state,
  created_at,
  updated_at
from public.app_users
order by created_at desc;
