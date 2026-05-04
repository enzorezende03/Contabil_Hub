## Objetivo

Usar a planilha `Tarefas_2026-05-04-15-24-47.xlsx` (export do G-Click) para preencher em lote, na página **Competências → 2025**, o status mensal de **Lançamentos Contábeis** e **Conciliação Contábil** de cada cliente até o último mês com andamento registrado.

## O que a planilha contém

- 354 linhas, 191 CNPJs únicos.
- Duas categorias (coluna "Assunto"): `Lançamento Contábil Anual` (165) e `Conciliação Contábil Anual` (189).
- Coluna "Último Andamento" traz o último mês trabalhado, em formatos como `Atividade : 9 - ... - Setembro` ou só `Setembro`.
- Apenas 40 dos 191 CNPJs têm andamento detectável (mês > 0). Os demais não terão alteração.
- 31 clientes aparecem como "Desativado" — serão ignorados.

Match com a base: amostra de 11 CNPJs deu 10/11 encontrados em `clients`. Cobertura esperada alta.

## Regra de preenchimento

Para cada CNPJ da planilha encontrado em `clients` (ano = 2025):

1. `M_lanc` = último mês detectado em "Lançamento Contábil Anual" (1–12, ou 0).
2. `M_conc` = último mês detectado em "Conciliação Contábil Anual" (1–12, ou 0).
3. Para meses **01..M_lanc** → grava `demand_type = "lancamentos"`, `status = "completed"`.
4. Para meses **01..M_conc** → grava `demand_type = "conciliacao_contabil"`, `status = "completed"`.
5. Não toca em meses posteriores nem em outros tipos (fechamento, revisão, conciliação bancária etc.).
6. Clientes sem andamento detectável: nenhuma alteração.
7. Clientes "Desativado" na planilha: ignorados.

Gravação na tabela `demand_status_entries` via upsert (mesma chave que a UI já usa: `client_name,month,year,demand_type`), usando `client_name = clients.razao_social` para bater com o que `/competencias` lê.

## Como executar

Adicionar um botão **"Importar planilha G-Click"** em `src/pages/Competencias.tsx` (visível para coordenação/admin), que:

- Abre um diálogo para upload do `.xlsx`.
- Faz parse no cliente com `xlsx` (já comum em projetos Vite — adicionar dependência `xlsx`).
- Extrai CNPJ (últimos 14 dígitos da coluna "Cliente") + mês de "Último Andamento".
- Cruza com a lista de `clients` carregada na página para obter `razao_social`.
- Mostra **pré-visualização**: tabela com `Cliente | Lançamento até | Conciliação até | Status (encontrado/não encontrado/sem andamento)` e contador.
- Botão "Confirmar importação" → faz os upserts em lote em `demand_status_entries` (chunks de 500).
- Invalida o estado local (`setDemandStatuses`) e mostra toast com resumo (X clientes, Y meses preenchidos).

## Detalhes técnicos

- Regex CNPJ: `/(\d{14})\s*$/` no campo "Cliente".
- Detecção do mês:
  1. `/atividade\s*:\s*(\d{1,2})\s*-/i` → número direto.
  2. Fallback: nome do mês em PT (`janeiro..dezembro`, com `março/marco`).
- Filtrar `Status do Cliente !== "Desativado"`.
- Agrupamento por `(cnpj, Assunto)` pegando o **máx** do mês.
- Mapeamento de "Assunto" → `demand_type`:
  - `Lançamento Contábil Anual` → `lancamentos`
  - `Conciliação Contábil Anual` → `conciliacao_contabil`
- Permissão: reaproveitar o mesmo gate dos botões em massa existentes na página.

## Resultado esperado

Após confirmar, ~40 clientes terão automaticamente os meses até o último andamento marcados como **Concluído** nas colunas Lançamentos e Conciliação Contábil de 2025, sem mexer em nada além disso.
