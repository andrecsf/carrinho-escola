/* ============ Modo demo (replica as regras do banco) ============ */
const DB_KEY = 'carrinho-demo';
function lerDemo(){
  try { const d = JSON.parse(localStorage.getItem(DB_KEY)); if(d) return d; } catch(e){}
  const iso = h => new Date(Date.now()+h*36e5).toISOString();
  return {
    equipamentos:[
      {patrimonio:'NB-001',tipo:'notebook',estado:'disponivel'},
      {patrimonio:'NB-002',tipo:'notebook',estado:'emprestado'},
      {patrimonio:'NB-003',tipo:'notebook',estado:'manutencao'},
      {patrimonio:'PJ-001',tipo:'projetor',estado:'disponivel'}],
    emprestimos:[{id:1,patrimonio:'NB-002',tipo:'notebook',responsavel:'Profa. Ana',setor:'2º ano B',
      retirada_em:iso(-30),previsto_para:iso(-2),devolvido_em:null,condicao:null,observacao:null}]
  };
}
function gravarDemo(d){ try{ localStorage.setItem(DB_KEY, JSON.stringify(d)); }catch(e){} }
const demo = {
  async listar(){
    const d = lerDemo();
    return d.equipamentos.map(e => {
      const emp = d.emprestimos.find(x => x.patrimonio===e.patrimonio && !x.devolvido_em);
      return {...e, emprestimo_id:emp?.id, responsavel:emp?.responsavel, setor:emp?.setor, previsto_para:emp?.previsto_para};
    });
  },
  async cadastrar(b){
    const d = lerDemo();
    if(d.equipamentos.some(e => e.patrimonio===b.patrimonio)) throw new Error('Patrimônio já cadastrado');
    d.equipamentos.push({patrimonio:b.patrimonio,tipo:b.tipo,estado:'disponivel'}); gravarDemo(d);
  },
  async emprestar(b){
    const d = lerDemo(), e = d.equipamentos.find(x => x.patrimonio===b.patrimonio && x.estado==='disponivel');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dias = Math.round((new Date(b.previsaoDevolucao+'T00:00:00') - hoje)/864e5);
    if(!(dias > 0) || dias > 7) throw new Error('Previsão deve ser futura e de até 7 dias');
    if(!e) throw new Error('Equipamento indisponível para empréstimo');
    e.estado = 'emprestado';
    d.emprestimos.push({id:Date.now(),patrimonio:e.patrimonio,tipo:e.tipo,responsavel:b.responsavel,setor:b.setor,
      retirada_em:new Date().toISOString(),previsto_para:new Date(b.previsaoDevolucao+'T23:59:59').toISOString(),
      devolvido_em:null,condicao:null,observacao:null});
    gravarDemo(d);
  },
  async devolver(b){
    const d = lerDemo(), emp = d.emprestimos.find(x => String(x.id)===String(b.id) && !x.devolvido_em);
    const e = emp && d.equipamentos.find(x => x.patrimonio===emp.patrimonio);
    if(b.condicao==='avariado' && !(b.observacao||'').trim()) throw new Error('Observação obrigatória para equipamento avariado');
    if(!e) throw new Error('Equipamento não possui empréstimo ativo');
    emp.devolvido_em = new Date().toISOString(); emp.condicao = b.condicao;
    emp.observacao = b.condicao==='avariado' ? b.observacao : null;
    e.estado = b.condicao==='ok' ? 'disponivel' : 'manutencao'; gravarDemo(d);
  },
  async liberar(p){
    const d = lerDemo(), e = d.equipamentos.find(x => x.patrimonio===p && x.estado==='manutencao');
    if(!e) throw new Error('Equipamento não encontrado ou não está em manutenção');
    e.estado = 'disponivel'; gravarDemo(d);
  },
  async excluir(p){
    const d = lerDemo(), e = d.equipamentos.find(x => x.patrimonio===p);
    if(!e) throw new Error('Equipamento não encontrado.');
    if(e.estado==='emprestado') throw new Error('Equipamento emprestado não pode ser excluído. Registre a devolução primeiro.');
    if(d.emprestimos.some(x => x.patrimonio===p)) throw new Error('Equipamento possui histórico de empréstimos e não pode ser excluído.');
    d.equipamentos = d.equipamentos.filter(x => x.patrimonio!==p); gravarDemo(d);
  },
  async atrasados(){ return lerDemo().emprestimos.filter(x => !x.devolvido_em && new Date(x.previsto_para) < new Date()); },
  async historico(){ return lerDemo().emprestimos.slice().reverse(); }
};
