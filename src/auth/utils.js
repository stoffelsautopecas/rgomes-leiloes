export const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export const sanitizeUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  role: user.role || "customer",
  whatsapp: user.whatsapp,
  cpf: user.cpf,
  cep: user.cep,
  address: user.address,
  number: user.number,
  district: user.district,
  complement: user.complement,
  city: user.city,
  state: user.state,
  photoUrl: user.photo_url || null,
  createdAt: user.created_at
});
