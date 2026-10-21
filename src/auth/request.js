export const getBearerToken = (authorization = "") => {
  const [scheme, token] = String(authorization).split(" ");

  if (String(scheme).toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};
