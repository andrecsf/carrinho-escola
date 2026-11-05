require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const pool = require('./db/pool');

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

// Importa e usa o arquivo de rotas
const equipamentosRouter = require('./equipamentos'); 
app.use('/api', equipamentosRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = app;