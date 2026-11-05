require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db/pool');
const { createEmprestimosService } = require('./services/emprestimos');
const createEmprestimosRouter = require('./routes/emprestimos');
const equipamentosRouter = require('./routes/equipamentos');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', banco: 'conectado' });
  } catch (e) {
    res.status(500).json({ status: 'erro', banco: 'indisponivel' });
  }
});

app.use('/api/emprestimos', createEmprestimosRouter(createEmprestimosService(pool)));
app.use('/api', equipamentosRouter);

// Serve o front-end (pasta /frontend) na mesma origem da API.
app.use(express.static(path.join(__dirname, '../../frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});