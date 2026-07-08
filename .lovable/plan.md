
## Diagnóstico

Confirmei o problema no caso da **Camila Araujo Oliveira Medicina LTDA** consultando o banco:

- A solicitação existe com `competencias = [02/2026, 03/2026, 04/2026, 05/2026]`, `types = [lancamentos, conciliacao_bancaria]` e `status = not_started` na tabela `demands`.
- Na tabela `demand_status_entries` (a que alimenta a aba **Competências / Fechamento**) as células de Lançamentos e Conciliação Bancária estão `completed` — mas para os meses **03, 04, 05 e 06/2026**, e não para 02/2026.

Isso explica os três sintomas reportados:

1. **Planejamento mostra "não iniciada"** — a página `Planejamento.tsx` mescla as solicitações de cliente vindas da tabela `demands`, mas usa o `status` cru do registro (que nunca foi atualizado) em vez de derivar o status a partir das células, como já faz com os cards de planejamento interno.
2. **Solicitação mostra "em andamento" e não conclui** — a página `Demands.tsx` já deriva o status localmente a partir das células, porém:
   - só grava de volta em `demands.status` quando o derivado vira `completed`; estados intermediários (`in_progress`, `waiting_info`) nunca são persistidos;
   - a Camila tem uma célula ausente (02/2026), então o derivado nunca chega a `completed` — o card fica preso em "em andamento".
3. **Fechamento mostra Lançamentos + Conc. Contábil concluídos** — está correto, porque a página Competências lê direto de `demand_status_entries`; o problema é só a não-propagação para as outras telas.

Há também um descasamento de dados no caso da Camila: a solicitação pede 02–05/2026 e a equipe marcou 03–06/2026. Isso é um erro de preenchimento, não de código — vou sinalizar para o usuário corrigir manualmente após o fix.

## O que vou construir

### 1. Planejamento: derivar status das solicitações a partir das células

Em `src/pages/Planejamento.tsx`, aplicar a mesma lógica de derivação hoje usada só para `dbPlannings` também para `dbClientDemands` (`origem === "solicitacao"`), considerando os tipos relevantes de cada solicitação (`lancamentos`, `conciliacao_bancaria`, `conciliacao_contabil` e, quando fizer sentido, `fechamento`/`revisao` com chave `closing/<ano>`, igual à lógica já existente em `Demands.tsx`).

Resultado: o card de solicitação no Planejamento passa a refletir "em andamento" / "concluída" conforme as células de competência.

### 2. Demandas: persistir todas as transições de status derivadas

Em `src/pages/Demands.tsx`, expandir o `useEffect` que hoje só sincroniza a transição para `completed`. Passar a gravar em `demands.status` qualquer mudança do derivado (`not_started` → `in_progress` → `waiting_info` → `blocked` → `completed`), para que:

- a listagem/kanban da própria página fique consistente com o painel de Competências;
- outras telas (Planejamento, relatórios) que leem `demands.status` cru também fiquem corretas mesmo sem passar pela aba de Solicitações.

### 3. Rede de segurança no backend: trigger de sincronização

Adicionar um trigger em `demand_status_entries` (AFTER INSERT/UPDATE/DELETE) que, para cada célula afetada, recalcule o status de todas as linhas de `demands` cuja `client = client_name`, que contenham a `competencia` (`MM/YYYY`) em `competencias` e o `demand_type` em `types`, e atualize `demands.status` com o valor derivado (mesma regra da UI: completed / waiting_info / blocked / in_progress / not_started, considerando também as células `closing/<ano>` quando o tipo for `fechamento`/`revisao`).

Assim, a sincronização deixa de depender de alguém ter a aba de Solicitações aberta — funciona mesmo quando o preenchimento vier da tela de Competências ou de outra automação.

### 4. Aviso ao usuário sobre o caso Camila

Depois do deploy, avisar que a demanda da Camila continua em "em andamento" porque a competência **02/2026** não foi marcada em nenhuma célula — a equipe marcou 03–06/2026. Para concluir a solicitação, ou completar a célula 02/2026, ou ajustar as competências da solicitação para 03–06/2026.

## Detalhes técnicos

- Arquivos alterados:
  - `src/pages/Planejamento.tsx` — estender `planningsWithDerivedStatus` para também derivar sobre `dbClientDemands`.
  - `src/pages/Demands.tsx` — remover o filtro `d.status === "completed"` do `useEffect` de sincronização; comparar `original.status !== derived.status` e persistir qualquer diferença.
  - Nova migration SQL: função `public.recompute_demand_status(p_demand_id uuid)` + função trigger `public.sync_demands_from_status_entries()` + trigger em `demand_status_entries` chamando essa função com os `client_name/month/year/demand_type` afetados.
- A função de recomputo replica exatamente a lógica de derivação da UI (inclui suporte a `closing/<ano>` para `fechamento`/`revisao`), para não introduzir divergência.
- Sem mudanças em RLS/grants; apenas triggers e funções `SECURITY DEFINER` com `search_path = public`.
