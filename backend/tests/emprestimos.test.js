const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createEmprestimosService } = require('../src/services/emprestimos');
const createEmprestimosRouter = require('../src/routes/emprestimos');

// ---------- Banco falso em memória (transações com log de undo por client) ----------
function createFakePool(equipamentos) {
  const state = { equipamentos, emprestimos: [], nextId: 1, failOn: null };
  const tick = () => new Promise((r) => setImmediate(r)); // permite intercalar requisições

  function makeClient() {
    let undo = [];
    return {
      release() {},
      async query(sql, params = []) {
        await tick();
        const q = sql.replace(/\s+/g, ' ').trim();
        if (state.failOn && q.includes(state.failOn)) throw new Error('falha simulada do banco');
        if (q === 'BEGIN') { undo = []; return { rowCount: 0, rows: [] }; }
        if (q === 'COMMIT') { undo = []; return { rowCount: 0, rows: [] }; }
        if (q === 'ROLLBACK') { undo.reverse().forEach((f) => f()); undo = []; return { rowCount: 0, rows: [] }; }

        if (q.startsWith('SELECT id, estado FROM equipamentos WHERE patrimonio')) {
          const e = state.equipamentos.find((x) => x.patrimonio === params[0]);
          return { rowCount: e ? 1 : 0, rows: e ? [{ id: e.id, estado: e.estado }] : [] };
        }
        if (q.startsWith("UPDATE equipamentos SET estado = 'emprestado'")) {
          const e = state.equipamentos.find((x) => x.id === params[0] && x.estado === 'disponivel');
          if (!e) return { rowCount: 0, rows: [] };
          e.estado = 'emprestado'; undo.push(() => { e.estado = 'disponivel'; });
          return { rowCount: 1, rows: [{ id: e.id }] };
        }
        if (q.startsWith('INSERT INTO emprestimos')) {
          const row = { id: state.nextId++, equipamento_id: params[0], responsavel: params[1],
            setor: params[2], retirada_em: new Date(), previsto_para: params[3], devolvido_em: null };
          state.emprestimos.push(row);
          undo.push(() => { state.emprestimos.splice(state.emprestimos.indexOf(row), 1); });
          return { rowCount: 1, rows: [row] };
        }
        if (q.startsWith('UPDATE emprestimos SET devolvido_em')) {
          const e = state.emprestimos.find((x) => x.id === params[0] && x.devolvido_em === null);
          if (!e) return { rowCount: 0, rows: [] };
          const antes = { ...e };
          Object.assign(e, { devolvido_em: new Date(), condicao: params[1], observacao: params[2] });
          undo.push(() => { Object.keys(e).forEach((k) => delete e[k]); Object.assign(e, antes); });
          return { rowCount: 1, rows: [{ equipamento_id: e.equipamento_id }] };
        }
        if (q.startsWith('SELECT id FROM emprestimos WHERE id')) {
          const e = state.emprestimos.find((x) => x.id === params[0]);
          return { rowCount: e ? 1 : 0, rows: e ? [{ id: e.id }] : [] };
        }
        if (q.startsWith('UPDATE equipamentos SET estado = $2')) {
          const e = state.equipamentos.find((x) => x.id === params[0] && x.estado === 'emprestado');
          if (!e) return { rowCount: 0, rows: [] };
          e.estado = params[1]; undo.push(() => { e.estado = 'emprestado'; });
          return { rowCount: 1, rows: [{ id: e.id }] };
        }
        throw new Error('Query não prevista no fake: ' + q);
      },
    };
  }
  return { state, connect: async () => makeClient() };
}

// ---------- Setup HTTP ----------
const AGORA = new Date('2026-11-05T15:00:00Z'); // hoje = 2026-11-05, limite = 2026-11-12
let pool, server, base;

beforeEach(async () => {
  pool = createFakePool([
    { id: 1, patrimonio: 'PAT-001', tipo: 'notebook', estado: 'disponivel' },
    { id: 2, patrimonio: 'PAT-002', tipo: 'projetor', estado: 'emprestado' },
    { id: 3, patrimonio: 'PAT-003', tipo: 'camera', estado: 'manutencao' },
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/emprestimos', createEmprestimosRouter(createEmprestimosService(pool, { agora: () => AGORA })));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/emprestimos`;
});
afterEach(() => new Promise((r) => server.close(r)));

const post = (body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (id, body) => fetch(`${base}/${id}/devolver`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const eq = (id) => pool.state.equipamentos.find((e) => e.id === id);
const ok = { patrimonio: 'PAT-001', responsavel: 'Maria Silva', setor: 'Biblioteca', previsaoDevolucao: '2026-11-10' };

// ---------- RF2 ----------
test('RF2: empréstimo de equipamento disponível', async () => {
  const res = await post(ok);
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.responsavel, 'Maria Silva');
  assert.strictEqual(body.setor, 'Biblioteca');
  assert.strictEqual(eq(1).estado, 'emprestado');
  assert.strictEqual(pool.state.emprestimos.length, 1);
});

test('RF2: equipamento inexistente -> 404', async () => {
  const res = await post({ ...ok, patrimonio: 'PAT-999' });
  assert.strictEqual(res.status, 404);
});

test('RF2: equipamento emprestado -> 409', async () => {
  const res = await post({ ...ok, patrimonio: 'PAT-002' });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(pool.state.emprestimos.length, 0);
});

test('RF2: equipamento em manutenção -> 409', async () => {
  const res = await post({ ...ok, patrimonio: 'PAT-003' });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(eq(3).estado, 'manutencao');
});

test('RF2: previsão no passado ou hoje -> 400', async () => {
  assert.strictEqual((await post({ ...ok, previsaoDevolucao: '2026-11-01' })).status, 400);
  assert.strictEqual((await post({ ...ok, previsaoDevolucao: '2026-11-05' })).status, 400);
  assert.strictEqual(eq(1).estado, 'disponivel');
});

test('RF2: previsão superior a 7 dias -> 400', async () => {
  const res = await post({ ...ok, previsaoDevolucao: '2026-11-13' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(eq(1).estado, 'disponivel');
});

test('RF2: empréstimo dentro do prazo (limite de 7 dias) -> 201', async () => {
  assert.strictEqual((await post({ ...ok, previsaoDevolucao: '2026-11-12' })).status, 201);
});

test('RF2: data inválida ou campos ausentes -> 400', async () => {
  assert.strictEqual((await post({ ...ok, previsaoDevolucao: '2026-02-30' })).status, 400);
  assert.strictEqual((await post({ ...ok, previsaoDevolucao: undefined })).status, 400);
  assert.strictEqual((await post({ ...ok, responsavel: '  ' })).status, 400);
  assert.strictEqual((await post({ ...ok, setor: '' })).status, 400);
  assert.strictEqual((await post({ ...ok, setor: undefined })).status, 400);
  assert.strictEqual((await post({ ...ok, patrimonio: '' })).status, 400);
});

test('RF2: dois empréstimos simultâneos do mesmo equipamento -> só um vence', async () => {
  const [a, b] = await Promise.all([post(ok), post({ ...ok, responsavel: 'João' })]);
  const status = [a.status, b.status].sort();
  assert.deepStrictEqual(status, [201, 409]);
  assert.strictEqual(pool.state.emprestimos.length, 1);
});

test('RF2: falha ao registrar empréstimo faz rollback do equipamento', async () => {
  pool.state.failOn = 'INSERT INTO emprestimos';
  const res = await post(ok);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(eq(1).estado, 'disponivel');
  assert.strictEqual(pool.state.emprestimos.length, 0);
  assert.ok(!JSON.stringify(await res.json()).includes('falha simulada'));
});

// ---------- RF3 ----------
async function emprestarPAT1() { return (await (await post(ok)).json()).id; }

test('RF3: devolução em boas condições', async () => {
  const id = await emprestarPAT1();
  const res = await patch(id, { condicao: 'ok' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(eq(1).estado, 'disponivel');
  const e = pool.state.emprestimos[0];
  assert.ok(e.devolvido_em);
  assert.strictEqual(e.condicao, 'ok');
});

test('RF3: devolução avariado -> manutenção com observação', async () => {
  const id = await emprestarPAT1();
  const res = await patch(id, { condicao: 'avariado', observacao: '  Cabo danificado.  ' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(eq(1).estado, 'manutencao');
  assert.strictEqual(pool.state.emprestimos[0].observacao, 'Cabo danificado.');
});

test('RF3: avariado sem observação (vazia ou só espaços) -> 400 e nada muda', async () => {
  const id = await emprestarPAT1();
  assert.strictEqual((await patch(id, { condicao: 'avariado' })).status, 400);
  assert.strictEqual((await patch(id, { condicao: 'avariado', observacao: '   ' })).status, 400);
  assert.strictEqual(eq(1).estado, 'emprestado');
  assert.strictEqual(pool.state.emprestimos[0].devolvido_em, null);
});

test('RF3: condição inválida -> 400', async () => {
  const id = await emprestarPAT1();
  assert.strictEqual((await patch(id, { condicao: 'quebrado' })).status, 400);
  assert.strictEqual((await patch(id, {})).status, 400);
});

test('RF3: empréstimo inexistente -> 404; id inválido -> 400', async () => {
  assert.strictEqual((await patch(999, { condicao: 'ok' })).status, 404);
  assert.strictEqual((await patch('abc', { condicao: 'ok' })).status, 400);
});

test('RF3: empréstimo já finalizado -> 409 e não altera o equipamento', async () => {
  const id = await emprestarPAT1();
  assert.strictEqual((await patch(id, { condicao: 'avariado', observacao: 'Tela trincada' })).status, 200);
  assert.strictEqual((await patch(id, { condicao: 'ok' })).status, 409);
  assert.strictEqual(eq(1).estado, 'manutencao');
});

test('RF3: devolução só altera o equipamento do empréstimo', async () => {
  const id = await emprestarPAT1();
  await patch(id, { condicao: 'ok' });
  assert.strictEqual(eq(2).estado, 'emprestado');
  assert.strictEqual(eq(3).estado, 'manutencao');
});

test('RF3: falha durante a devolução faz rollback do empréstimo', async () => {
  const id = await emprestarPAT1();
  pool.state.failOn = 'UPDATE equipamentos SET estado = $2';
  const res = await patch(id, { condicao: 'ok' });
  assert.strictEqual(res.status, 500);
  assert.strictEqual(pool.state.emprestimos[0].devolvido_em, null);
  assert.strictEqual(pool.state.emprestimos[0].devolvido_em, null);
  assert.strictEqual(eq(1).estado, 'emprestado');
});