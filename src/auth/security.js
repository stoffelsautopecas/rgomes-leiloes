import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const accessSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET;
const accessExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "30d";
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);

if (!accessSecret || !refreshSecret) {
  throw new Error("JWT secrets não configurados.");
}

export const hashPassword = async (password) => bcrypt.hash(password, bcryptRounds);
export const comparePassword = async (password, passwordHash) => bcrypt.compare(password, passwordHash);

export const signAccessToken = (user) =>
  jwt.sign({ email: user.email, cpf: user.cpf }, accessSecret, {
    subject: user.id,
    expiresIn: accessExpiresIn
  });

export const signRefreshToken = (user) =>
  jwt.sign({ type: "refresh" }, refreshSecret, {
    subject: user.id,
    expiresIn: refreshExpiresIn
  });

export const verifyAccessToken = (token) => jwt.verify(token, accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret);
