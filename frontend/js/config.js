/* Configuração da API: ajuste aqui os caminhos se o backend mudar. */
const ROTAS = {
  health:    () => '/health',
  listar:    () => '/api/equipamentos',                          // GET  (ver nota: precisa existir no backend)
  cadastrar: () => '/api/equipamentos',                          // POST {patrimonio, tipo}
  emprestar: () => '/api/emprestimos',                           // POST {patrimonio, responsavel, setor, previsaoDevolucao: 'AAAA-MM-DD'}
  devolver:  id => `/api/emprestimos/${encodeURIComponent(id)}/devolver`, // PATCH {condicao, observacao}
  liberar:   p  => `/api/equipamentos/${encodeURIComponent(p)}/liberar`,  // PATCH
  excluir:   p  => `/api/equipamentos/${encodeURIComponent(p)}`,            // DELETE
  atrasados: () => '/api/emprestimos/atrasados',                 // GET -> {total_atrasados, atrasados:[]}
  historico: () => '/api/historico'                              // GET  (ver nota: precisa existir no backend)
};
