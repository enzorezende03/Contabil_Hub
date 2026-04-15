

# Planejamento Estratégico — 3 funcionalidades

## O que será construído

### 1. Painel de Carga por Membro da Equipe
Um painel acima do kanban/lista mostrando cards para cada membro da equipe com:
- Quantidade de planejamentos atribuídos (abertos vs concluídos)
- Barra de progresso visual indicando carga (leve / moderada / sobrecarregado)
- Ícone de alerta quando a carga exceder um limite (ex: 10+ planejamentos ativos)
- Filtragem rápida: clicar no card do membro filtra o kanban/lista

### 2. Sugestão Automática de Responsável
No diálogo de criação de planejamento (`CreatePlanningDialog`):
- Ao lado do campo "Responsável", exibir um botão "Sugerir"
- A lógica analisa a carga atual de cada membro (planejamentos com status diferente de `completed`) e o perfil (role)
- Sugere o membro com menor carga atual, priorizando analistas/assistentes sobre coordenação e estagiários
- Exibe tooltip com a justificativa: "Carlos Oliveira — 3 planejamentos ativos (menor carga)"

### 3. Timeline / Cronograma Visual
Uma terceira opção de visualização (além de kanban e lista):
- Eixo X: dias do mês atual (ou mês selecionável)
- Eixo Y: cada planejamento como uma barra horizontal do `createdAt` até o `internalDeadline`
- Cores por prioridade (urgente = vermelho, alta = laranja, média = azul, baixa = cinza)
- Indicador visual de prazo vencido (barra com borda vermelha)
- Agrupamento opcional por responsável

## Alterações técnicas

**Arquivos modificados:**
- `src/pages/Planejamento.tsx` — Adicionar painel de carga no topo, novo modo de view `timeline`, toggle no header
- `src/components/CreatePlanningDialog.tsx` — Botão de sugestão automática no campo de responsável
- Novo componente: `src/components/PlanningTimeline.tsx` — Renderização do cronograma com barras horizontais usando CSS puro (sem lib externa)
- Novo componente: `src/components/WorkloadPanel.tsx` — Cards de carga por membro

**Sem alterações no banco de dados** — todas as informações já existem na tabela `plannings`.

