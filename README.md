# RGOMES LEILÕES

Site institucional com catálogo, página de detalhe, cadastro e login com autenticação JWT própria usando Supabase apenas como banco Postgres.

Esta é uma cópia independente da RGOMES LEILÕES, conectada ao projeto Supabase próprio. O arquivo `.env` contém as credenciais locais e não deve ser versionado.

## Stack

- HTML, CSS e JavaScript
- Node.js + Express
- JWT próprio
- Supabase Postgres
- Vercel para frontend + funções `api/`

## Rodando localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie seu arquivo local:

```bash
cp .env.example .env
```

3. Preencha o `.env`

4. Inicie:

```bash
npm start
```

5. Acesse:

- `http://localhost:3000`

## Banco no Supabase

O banco deste projeto está em um Supabase independente e foi inicializado com o catálogo de veículos, o motorista e o pátio da RGOMES. Contratos e faturas emitidos da operação anterior não foram migrados. Os arquivos em `supabase/` documentam o schema; não execute `001_init.sql` sobre o banco já inicializado.

Consulta rápida:

- [sql/check_profiles.sql](./sql/check_profiles.sql)

## Variáveis de ambiente

Base local:

- [`.env.example`](./.env.example)

Variáveis usadas:

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
- `NOWBANK_API_BASE_URL`
- `NOWBANK_CLIENT_ID`
- `NOWBANK_CLIENT_SECRET`
- `NOWBANK_CALLBACK_URL`
- `NOWBANK_WEBHOOK_TOKEN`

## Publicação

Configure no Vercel as variáveis de ambiente necessárias a partir de `.env.example`, com os valores do Supabase RGOMES e os URLs do domínio publicado. O arquivo `.env`, os backups e os documentos privados não são versionados.

Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente. Não existe senha administrativa padrão no código.

## APIs disponíveis

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
