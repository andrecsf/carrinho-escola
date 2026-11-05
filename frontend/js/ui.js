/* ============ Interface ============ */
const NOMES = {notebook:'Notebook',projetor:'Projetor',camera:'Câmera'};
const ESTADOS = {disponivel:'Disponível',emprestado:'Emprestado',manutencao:'Em manutenção'};
const fmt = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag = e => `<span class="tag ${esc(e)}">${ESTADOS[e]||esc(e)}</span>`;
const tabela = (cols, linhas, vazio) => linhas.length
  ? `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table>`
  : `<div class="empty">${vazio}</div>`;

let toastT;
function aviso(msg, erro){
  const t = $('#toast'); t.textContent = msg; t.className = erro ? 'err' : 'ok';
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3500);
}
async function acao(fn, okMsg){
  try { await fn(); aviso(okMsg); await atualizar(); }
  catch(e){ aviso(e.message || 'Não foi possível concluir a ação', true); }
}

async function atualizar(){
  let eqs = [];
  try { eqs = await api.listar(); }
  catch(e){ aviso('Não foi possível carregar os dados. Confira a URL da API ou use o modo demo.', true); }

  const cont = k => eqs.filter(e => e.estado===k).length;
  $('#sum').innerHTML = [['Total',eqs.length],['Disponíveis',cont('disponivel')],['Emprestados',cont('emprestado')],['Em manutenção',cont('manutencao')]]
    .map(([n,v]) => `<div><b>${v}</b>${n}</div>`).join('');

  $('#lista').innerHTML = tabela(['Patrimônio','Tipo','Estado','Com quem','Devolução prevista',''],
    eqs.map(e => `<tr><td>${esc(e.patrimonio)}</td><td>${NOMES[e.tipo]||esc(e.tipo)}</td><td>${tag(e.estado)}</td>
      <td>${e.responsavel ? esc(e.responsavel)+' ('+esc(e.setor)+')' : '—'}</td><td>${fmt(e.previsto_para)}</td>
      <td>${e.estado==='manutencao' ? `<button class="sec" data-lib="${esc(e.patrimonio)}">Liberar</button> ` : ''}${e.estado!=='emprestado' ? `<button class="sec" data-del="${esc(e.patrimonio)}">Excluir</button>` : ''}</td></tr>`),
    'Nenhum equipamento cadastrado. Use o formulário acima.');

  const opts = (lista, vazio) => lista.length ? lista.map(e => `<option value="${esc(e.patrimonio)}">${esc(e.patrimonio)} — ${NOMES[e.tipo]||esc(e.tipo)}</option>`).join('')
    : `<option value="">${vazio}</option>`;
  $('#e-pat').innerHTML = opts(eqs.filter(e => e.estado==='disponivel'), 'Nenhum disponível');
  $('#d-pat').innerHTML = eqs.filter(e => e.estado==='emprestado').map(e => `<option value="${esc(e.emprestimo_id)}">${esc(e.patrimonio)} — ${esc(e.responsavel||'')}</option>`).join('') || '<option value="">Nenhum emprestado</option>';
  carregarListas();
}

async function carregarListas(){
  try {
    const a = await api.atrasados();
    $('#l-atr').innerHTML = tabela(['Patrimônio','Tipo','Responsável','Setor','Retirada','Previsto'],
      a.map(x => `<tr><td>${esc(x.patrimonio)}</td><td>${NOMES[x.tipo]||esc(x.tipo)}</td><td>${esc(x.responsavel)}</td><td>${esc(x.setor)}</td>
        <td>${fmt(x.retirada_em)}</td><td class="late">${fmt(x.previsto_para)}</td></tr>`), 'Nenhum empréstimo atrasado.');
  } catch(e){ $('#l-atr').innerHTML = '<div class="empty">Não foi possível carregar os atrasados.</div>'; }
  try {
    const h = await api.historico();
    $('#l-hist').innerHTML = tabela(['Patrimônio','Responsável','Setor','Retirada','Devolvido','Condição','Observação'],
      h.map(x => `<tr><td>${esc(x.patrimonio)}</td><td>${esc(x.responsavel)}</td><td>${esc(x.setor)}</td><td>${fmt(x.retirada_em)}</td>
        <td>${x.devolvido_em ? fmt(x.devolvido_em) : 'Em uso'}</td><td>${x.condicao ? (x.condicao==='ok'?'Sem problemas':'<span class="late">Avariado</span>') : '—'}</td>
        <td>${esc(x.observacao)||'—'}</td></tr>`), 'Nenhum empréstimo registrado ainda.');
  } catch(e){ $('#l-hist').innerHTML = '<div class="empty">O histórico ainda não está disponível na API (rota GET /api/historico).</div>'; }
}

/* eventos */
$('#tabs').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if(!b) return;
  document.querySelectorAll('#tabs button').forEach(x => x.setAttribute('aria-selected', x===b));
  ['equip','emp','dev','atr','hist'].forEach(id => $('#'+id).classList.toggle('hide', id!==b.dataset.t));
});
$('#c-btn').onclick = () => {
  const pat = $('#c-pat').value.trim();
  if(!pat) return aviso('Informe o patrimônio', true);
  acao(async () => { await api.cadastrar({patrimonio:pat, tipo:$('#c-tipo').value}); $('#c-pat').value=''; }, 'Equipamento cadastrado');
};
$('#e-btn').onclick = () => {
  const b = {patrimonio:$('#e-pat').value, responsavel:$('#e-resp').value.trim(), setor:$('#e-setor').value.trim(), previsaoDevolucao:$('#e-prev').value};
  if(!b.patrimonio) return aviso('Nenhum equipamento disponível', true);
  if(!b.responsavel || !b.setor || !b.previsaoDevolucao) return aviso('Preencha responsável, setor e devolução prevista', true);
  acao(async () => { await api.emprestar(b); $('#e-resp').value=''; $('#e-setor').value=''; }, 'Empréstimo registrado');
};
$('#d-cond').onchange = () => $('#d-obs-w').classList.toggle('hide', $('#d-cond').value!=='avariado');
$('#d-btn').onclick = () => {
  const b = {id:$('#d-pat').value, condicao:$('#d-cond').value, observacao:$('#d-obs').value.trim()||null};
  if(!b.id) return aviso('Nenhum equipamento emprestado', true);
  if(b.condicao==='avariado' && !b.observacao) return aviso('Descreva o problema na observação', true);
  acao(async () => { await api.devolver(b); $('#d-obs').value=''; }, 'Devolução registrada');
};
$('#lista').addEventListener('click', ev => {
  const p = ev.target.dataset.lib; if(p) acao(() => api.liberar(p), 'Equipamento liberado');
  const d = ev.target.dataset.del;
  if(d && confirm(`Excluir o equipamento ${d}? Essa ação não pode ser desfeita.`)) acao(() => api.excluir(d), 'Equipamento excluído');
});
function modo(){ $('#aviso').classList.toggle('hide', !emDemo()); baseEl.disabled = emDemo(); atualizar(); }
demoEl.onchange = modo; baseEl.onchange = atualizar;

/* quando servido pela própria API, usa a mesma origem */
if(location.protocol.startsWith('http')) baseEl.value = location.origin;

/* início: usa a API se ela responder; senão, cai no modo demo */
(async () => {
  try { await http('GET', ROTAS.health()); demoEl.checked = false; }
  catch(e){ demoEl.checked = true; }
  modo();
})();
