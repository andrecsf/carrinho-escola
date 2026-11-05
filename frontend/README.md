# Front-end — Carrinho de Notebooks

Interface simples em HTML, CSS e JavaScript puro (sem build, sem dependências).

## Estrutura

```
frontend/
├── index.html        # estrutura da página e abas
├── css/
│   └── style.css     # estilos
└── js/
    ├── config.js     # caminhos das rotas da API (edite aqui)
    ├── demo.js       # modo demo: dados no navegador, com as mesmas regras do banco
    ├── api.js        # chamadas à API (ou ao modo demo)
    └── ui.js         # telas, formulários, eventos
```

A ordem dos `<script>` no `index.html` importa: config → demo → api → ui.

## Como rodar

1. Suba o backend (`cd backend && npm start`), por padrão em `http://localhost:3000`.
2. Abra `frontend/index.html` no navegador (ou sirva a pasta com `npx serve frontend`).
3. Se a API não responder em `/health`, o front entra sozinho no **modo demo**.

Se o navegador bloquear as chamadas (CORS), habilite o pacote `cors` no backend.

## Rotas esperadas

| Ação | Rota |
|---|---|
| Listar equipamentos* | `GET /api/equipamentos` |
| Cadastrar | `POST /api/equipamentos` |
| Emprestar | `POST /api/emprestimos` |
| Devolver | `PATCH /api/emprestimos/:id/devolver` |
| Excluir equipamento | `DELETE /api/equipamentos/:patrimonio` |
| Liberar da manutenção | `PATCH /api/equipamentos/:patrimonio/liberar` |
| Atrasados | `GET /api/emprestimos/atrasados` |
| Histórico* | `GET /api/historico` |

\* já existem no backend.
