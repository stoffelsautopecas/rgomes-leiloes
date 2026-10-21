# Supabase Setup

Este projeto usa:

- Supabase apenas como banco Postgres
- autenticação própria com JWT
- senhas com hash via bcrypt

## Variáveis usadas

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`
- `BCRYPT_ROUNDS`
- `APP_ENV`
- `PORT`
- `APP_URL`
- `APP_DOMAIN`
- `CORS_ORIGIN`

Essas variáveis devem ficar no arquivo local `.env`, que nao sobe para o repositório.

## Arquivos de ambiente

- `/.env`
  arquivo real local, privado, usado pelo projeto
- `/.env.example`
  modelo público único para desenvolvimento e produção

Fluxo recomendado:

1. usar `/.env.example` como base no ambiente local
2. manter credenciais reais apenas em `/.env`
3. na Vercel, copiar os mesmos nomes de variáveis do `.env.example`

`CORS_ORIGIN` aceita uma ou mais origens separadas por vírgula.

## Estrutura criada

O arquivo `supabase/001_init.sql` cria:

- `public.app_users`
- `public.app_refresh_tokens`
- índices para login por e-mail e CPF
- trigger de `updated_at`

## Como aplicar

1. Abra o `SQL Editor` do Supabase
2. Cole o conteúdo de `supabase/001_init.sql`
3. Execute

## Backend

O backend local expõe:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
