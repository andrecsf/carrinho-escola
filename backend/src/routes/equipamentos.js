const express = require('express');
const router = express.Router();
const pool = require('../db/pool'); // Ajuste o caminho se necessário

// ==========================================
// RF1: Cadastrar Equipamento (#4)
// ==========================================
router.post('/equipamentos', async (req, res) => {
  const { patrimonio, tipo } = req.body;

  // Validação básica
  if (!patrimonio || !tipo) {
    return res.status(400).json({ erro: 'Patrimônio e tipo são obrigatórios.' });
  }

  const tiposValidos = ['notebook', 'projetor', 'camera'];
  if (!tiposValidos.includes(tipo.toLowerCase())) {
    return res.status(400).json({ erro: 'Tipo inválido. Escolha entre: notebook, projetor ou camera.' });
  }

  try {
    // Insere com estado inicial 'disponivel' por padrão
    const result = await pool.query(
      `INSERT INTO equipamentos (patrimonio, tipo, estado) 
       VALUES ($1, $2, 'disponivel') 
       RETURNING *`,
      [patrimonio, tipo.toLowerCase()]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    // Tratamento para patrimônio duplicado (código SQL 23505 = unique_violation)
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Patrimônio já cadastrado.' });
    }
    console.error(err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});


// ==========================================
// RF4: Liberar da Manutenção (#7)
// ==========================================
router.patch('/equipamentos/:patrimonio/liberar', async (req, res) => {
  const { patrimonio } = req.params;

  try {
    // Atualiza apenas se o estado atual for 'manutencao'
    const result = await pool.query(
      `UPDATE equipamentos 
       SET estado = 'disponivel' 
       WHERE patrimonio = $1 AND estado = 'manutencao' 
       RETURNING *`,
      [patrimonio]
    );

    if (result.rowCount === 0) {
      // Verifica se o equipamento existe no banco
      const checkEquip = await pool.query('SELECT estado FROM equipamentos WHERE patrimonio = $1', [patrimonio]);
      
      if (checkEquip.rowCount === 0) {
        return res.status(404).json({ erro: 'Equipamento não encontrado.' });
      }
      
      return res.status(409).json({ 
        erro: `Não é possível liberar. O estado atual é '${checkEquip.rows[0].estado}', não 'manutencao'.` 
      });
    }

    return res.status(200).json({ 
      mensagem: 'Equipamento liberado para uso com sucesso.', 
      equipamento: result.rows[0] 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});


// ==========================================
// RF5: Consultar "com quem está" um patrimônio (#8)
// ==========================================
router.get('/equipamentos/:patrimonio/com-quem', async (req, res) => {
  const { patrimonio } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         e.patrimonio, 
         e.tipo, 
         e.estado,
         emp.responsavel, 
         emp.setor, 
         emp.retirada_em, 
         emp.previsto_para 
       FROM equipamentos e
       JOIN emprestimos emp ON e.id = emp.equipamento_id
       WHERE e.patrimonio = $1 AND emp.devolvido_em IS NULL`,
      [patrimonio]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ mensagem: 'Nenhum empréstimo ativo encontrado para este patrimônio.' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});


// ==========================================
// RF5: Listar empréstimos atrasados (#8)
// ==========================================
router.get('/emprestimos/atrasados', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         emp.id AS emprestimo_id,
         e.patrimonio, 
         e.tipo, 
         emp.responsavel, 
         emp.setor, 
         emp.retirada_em, 
         emp.previsto_para
       FROM emprestimos emp
       JOIN equipamentos e ON emp.equipamento_id = e.id
       WHERE emp.devolvido_em IS NULL 
         AND emp.previsto_para < CURRENT_DATE
       ORDER BY emp.previsto_para ASC`
    );

    return res.status(200).json({
      total_atrasados: result.rowCount,
      atrasados: result.rows
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

module.exports = router;