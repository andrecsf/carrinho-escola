// Regras de negócio do RF2 (emprestar) e RF3 (devolver).
// Recebe o pool existente (db/pool.js) por parâmetro, sem criar nova conexão.

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_DIAS = 7;
const CONDICOES = ['ok', 'avariado'];

// Data de "hoje" (YYYY-MM-DD) no fuso de Pernambuco.
function hoje(agora) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(agora);
}

function parseData(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [a, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}

function diasEntre(hojeStr, previsaoStr) {
  return Math.round((parseData(previsaoStr) - parseData(hojeStr)) / 86400000);
}

function createEmprestimosService(pool, { agora = () => new Date() } = {}) {
  async function emprestar({ patrimonio, pessoa, previsaoDevolucao } = {}) {
    // --- validações de entrada (antes de abrir transação) ---
    if (typeof patrimonio !== 'string' || !patrimonio.trim()) {
      throw new AppError(400, 'Patrimônio é obrigatório.');
    }
    if (typeof pessoa !== 'string' || !pessoa.trim() || pessoa.trim().length > 120) {
      throw new AppError(400, 'Pessoa é obrigatória (até 120 caracteres).');
    }
    if (parseData(previsaoDevolucao) === null) {
      throw new AppError(400, 'Previsão de devolução inválida. Use o formato AAAA-MM-DD.');
    }
    const dias = diasEntre(hoje(agora()), previsaoDevolucao);
    if (dias <= 0) {
      throw new AppError(400, 'A previsão de devolução deve ser uma data futura.');
    }
    if (dias > MAX_DIAS) {
      throw new AppError(400, `A previsão de devolução deve ser de no máximo ${MAX_DIAS} dias.`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const eq = await client.query(
        'SELECT id, estado FROM equipamentos WHERE patrimonio = $1',
        [patrimonio.trim()]
      );
      if (eq.rowCount === 0) throw new AppError(404, 'Equipamento não encontrado.');
      const equipamentoId = eq.rows[0].id;

      // Proteção contra empréstimo duplo: UPDATE condicional atômico.
      // A consulta acima serve só para distinguir 404; a decisão real é esta.
      const upd = await client.query(
        "UPDATE equipamentos SET estado = 'emprestado' WHERE id = $1 AND estado = 'disponivel' RETURNING id",
        [equipamentoId]
      );
      if (upd.rowCount === 0) {
        throw new AppError(409, 'Equipamento indisponível para empréstimo.');
      }

      const ins = await client.query(
        `INSERT INTO emprestimos (equipamento_id, pessoa, previsao_devolucao)
         VALUES ($1, $2, $3)
         RETURNING id, equipamento_id, pessoa, data_emprestimo,
                   to_char(previsao_devolucao, 'YYYY-MM-DD') AS previsao_devolucao, situacao`,
        [equipamentoId, pessoa.trim(), previsaoDevolucao]
      );

      await client.query('COMMIT');
      const r = ins.rows[0];
      return {
        id: r.id,
        patrimonio: patrimonio.trim(),
        pessoa: r.pessoa,
        dataEmprestimo: r.data_emprestimo,
        previsaoDevolucao: r.previsao_devolucao,
        situacao: r.situacao,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function devolver(idParam, { condicao, observacao } = {}) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'Id do empréstimo inválido.');
    }
    if (!CONDICOES.includes(condicao)) {
      throw new AppError(400, "Condição inválida. Use 'ok' ou 'avariado'.");
    }
    const obs = typeof observacao === 'string' ? observacao.trim() : '';
    if (condicao === 'avariado' && !obs) {
      throw new AppError(400, 'Observação sobre a avaria é obrigatória.');
    }
    const novoEstado = condicao === 'ok' ? 'disponivel' : 'manutencao';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Finaliza o empréstimo só se ainda estiver ativo (impede devolução dupla).
      const fin = await client.query(
        `UPDATE emprestimos
            SET situacao = 'finalizado', data_devolucao = now(),
                condicao_devolucao = $2, observacao_avaria = $3
          WHERE id = $1 AND situacao = 'ativo'
          RETURNING equipamento_id`,
        [id, condicao, condicao === 'avariado' ? obs : null]
      );
      if (fin.rowCount === 0) {
        const ex = await client.query('SELECT id FROM emprestimos WHERE id = $1', [id]);
        if (ex.rowCount === 0) throw new AppError(404, 'Empréstimo não encontrado.');
        throw new AppError(409, 'Empréstimo já foi finalizado.');
      }
      const equipamentoId = fin.rows[0].equipamento_id;

      // Atualiza somente o equipamento vinculado a este empréstimo.
      const upd = await client.query(
        "UPDATE equipamentos SET estado = $2 WHERE id = $1 AND estado = 'emprestado' RETURNING id",
        [equipamentoId, novoEstado]
      );
      if (upd.rowCount === 0) {
        throw new AppError(409, 'Estado do equipamento inconsistente com o empréstimo.');
      }

      await client.query('COMMIT');
      return { id, situacao: 'finalizado', condicao, equipamentoEstado: novoEstado };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return { emprestar, devolver };
}

module.exports = { createEmprestimosService, AppError };
