-- RF2/RF3: tabela de empréstimos.
-- Não destrutivo: só cria se não existir. Requer a tabela "equipamentos" (RF1).
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS emprestimos (
  id                  SERIAL PRIMARY KEY,
  equipamento_id      INTEGER      NOT NULL REFERENCES equipamentos(id),
  pessoa              VARCHAR(120) NOT NULL,
  data_emprestimo     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  previsao_devolucao  DATE         NOT NULL,
  data_devolucao      TIMESTAMPTZ,
  situacao            VARCHAR(20)  NOT NULL DEFAULT 'ativo'
                      CHECK (situacao IN ('ativo', 'finalizado')),
  condicao_devolucao  VARCHAR(20)
                      CHECK (condicao_devolucao IN ('ok', 'avariado')),
  observacao_avaria   TEXT,
  -- ativo: sem dados de devolução / finalizado: com data e condição
  CONSTRAINT emprestimos_coerencia CHECK (
    (situacao = 'ativo' AND data_devolucao IS NULL AND condicao_devolucao IS NULL)
    OR
    (situacao = 'finalizado' AND data_devolucao IS NOT NULL AND condicao_devolucao IS NOT NULL)
  ),
  -- avariado exige observação preenchida
  CONSTRAINT emprestimos_avaria_observacao CHECK (
    condicao_devolucao IS DISTINCT FROM 'avariado'
    OR length(btrim(coalesce(observacao_avaria, ''))) > 0
  )
);

-- Defesa extra contra empréstimo duplo: no máximo 1 empréstimo ativo por equipamento.
CREATE UNIQUE INDEX IF NOT EXISTS emprestimos_um_ativo_por_equipamento
  ON emprestimos (equipamento_id) WHERE situacao = 'ativo';

CREATE INDEX IF NOT EXISTS emprestimos_situacao_idx ON emprestimos (situacao);
