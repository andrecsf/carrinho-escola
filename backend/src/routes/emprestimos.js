const express = require('express');
const { AppError } = require('../services/emprestimos');

function createEmprestimosRouter(service) {
  const router = express.Router();

  function tratarErro(res, err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ erro: err.message });
    }
    console.error('Erro em /api/emprestimos:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao processar a requisição.' });
  }

  router.post('/', async (req, res) => {
    try {
      const emprestimo = await service.emprestar(req.body ?? {});
      res.status(201).json(emprestimo);
    } catch (err) {
      tratarErro(res, err);
    }
  });

  router.patch('/:id/devolver', async (req, res) => {
    try {
      const resultado = await service.devolver(req.params.id, req.body ?? {});
      res.json(resultado);
    } catch (err) {
      tratarErro(res, err);
    }
  });

  return router;
}

module.exports = createEmprestimosRouter;