/* Camada de acesso à API (usa o modo demo quando marcado). */
const $ = s => document.querySelector(s);
const demoEl = $('#demo'), baseEl = $('#base');
const emDemo = () => demoEl.checked;

async function http(metodo, rota, corpo){
  const r = await fetch(baseEl.value.replace(/\/$/,'') + rota, {
    method: metodo, headers: {'Content-Type':'application/json'},
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  let dados = null; try { dados = await r.json(); } catch(e){}
  if(!r.ok) throw new Error((dados && (dados.erro || dados.mensagem || dados.error || dados.message)) || `Erro ${r.status}`);
  return dados;
}

const api = {
  listar:    () => emDemo() ? demo.listar()    : http('GET', ROTAS.listar()),
  cadastrar: b  => emDemo() ? demo.cadastrar(b) : http('POST', ROTAS.cadastrar(), b),
  emprestar: b  => emDemo() ? demo.emprestar(b) : http('POST', ROTAS.emprestar(), b),
  devolver:  b  => emDemo() ? demo.devolver(b)  : http('PATCH', ROTAS.devolver(b.id), {condicao:b.condicao, observacao:b.observacao}),
  liberar:   p  => emDemo() ? demo.liberar(p)   : http('PATCH', ROTAS.liberar(p)),
  excluir:   p  => emDemo() ? demo.excluir(p)   : http('DELETE', ROTAS.excluir(p)),
  atrasados: async () => emDemo() ? demo.atrasados() : ((await http('GET', ROTAS.atrasados())).atrasados || []),
  historico: () => emDemo() ? demo.historico() : http('GET', ROTAS.historico())
};
