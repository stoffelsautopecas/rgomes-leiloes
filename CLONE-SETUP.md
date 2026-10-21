# Cópia independente da RGOMES LEILÕES

Este projeto usa repositório, banco Supabase e implantação separados da operação original.

- O catálogo de veículos, o motorista e o pátio da RGOMES estão no banco novo.
- Contratos e faturas emitidos da operação anterior não foram copiados.
- As informações da empresa, o endereço, o contrato e o logotipo da RGOMES estão configurados no site.
- As credenciais locais ficam no `.env`, que é ignorado pelo Git. Não publique esse arquivo.

## Implantação

Configure no provedor de hospedagem as variáveis de ambiente documentadas em `.env.example`, usando as credenciais do banco RGOMES. Configure `APP_URL`, `APP_DOMAIN`, `CORS_ORIGIN` e os callbacks de pagamento para o domínio publicado.

Os arquivos de `supabase/` servem como documentação do schema já inicializado; não execute `001_init.sql` sobre o banco existente.
