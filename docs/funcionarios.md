# Funcionários e separação de dados

O administrador principal gerencia funcionários em **Usuários**. Cada funcionário entra em `/admin` com e-mail e senha próprios. Apenas administradores podem criar funcionários, redefinir suas senhas ou ativar/desativar o acesso.

- Clientes, contratos, faturas e rastreios recebem `owner_id` no momento da criação. O servidor atribui esse ID a partir do usuário autenticado, ignorando qualquer responsável enviado pelo navegador.
- Funcionários recebem listas, contagens e prévias apenas dos próprios registros. Alterações por ID e vínculos com clientes também são validados no servidor.
- Veículos, motoristas e pátios continuam compartilhados e editáveis.
- Registros anteriores, com `owner_id` vazio, continuam disponíveis ao administrador principal. Não são distribuídos automaticamente aos funcionários.
- A desativação preserva os registros e impede novas requisições administrativas, inclusive com um token de acesso já emitido.
- Links públicos de contratos e faturas continuam destinados ao compartilhamento com clientes e funcionam por token, como antes.

Os inicializadores do schema aplicam as colunas necessárias. `supabase/005_staff_ownership.sql` documenta a migração equivalente (após a estrutura base). O banco utiliza autenticação própria; a autorização administrativa é aplicada pela API, sem expor conexão PostgreSQL ao navegador.

## Verificação

`tests/staff-isolation.mjs` deve ser executado **somente em banco local descartável**, com a estrutura existente restaurada. Recusa hosts remotos, cria funcionários/clientes temporários e remove os registros de teste ao terminar. Não aciona pagamentos reais.

```bash
DATABASE_URL='postgresql://USUARIO@127.0.0.1:PORTA/BANCO_TESTE' node tests/staff-isolation.mjs
```

O teste verifica login, responsáveis, listas e contagens, IDs de outros funcionários, prévia do cliente, bloqueio de cobranças cruzadas antes de chamar o provedor, compartilhamento de pátios, acesso do administrador e desativação.
