# Controle semanal de entregas + briefing

Objetivo: no painel **Controle Gerencial**, criar uma base semanal que mostre quantas demandas foram solicitadas, quantas foram entregues, quantas estão em atraso e qual o percentual de cumprimento do **prazo interno** — tanto para *Solicitações de clientes* quanto para *Planejamento*. Os mesmos indicadores passam a alimentar o briefing semanal.

## O que será medido (por semana ISO, segunda a domingo)

Para cada base (Solicitações de clientes / Planejamento):

- **Solicitadas na semana**: itens criados na semana.
- **Entregues na semana**: itens concluídos na semana.
- **Entregues no prazo**: concluídos até o prazo interno.
- **% cumprimento do prazo**: entregues no prazo ÷ entregues.
- **Em aberto hoje** e **em atraso hoje**: não concluídos com prazo interno já vencido.
- **Saldo da semana**: solicitadas − entregues (indica se o volume está crescendo).

## Novo bloco no Controle Gerencial

1. **Cabeçalho de semana**: seletor da semana (atual, anterior, últimas 12) respeitando os filtros de unidade/tributação já existentes.
2. **Cartões de KPI** em duas faixas: uma para Solicitações de clientes, outra para Planejamento — solicitadas, entregues, % no prazo, em atraso, com variação vs. semana anterior.
3. **Gráfico semanal** (últimas 12 semanas): barras de solicitadas vs. entregues e linha de % de cumprimento do prazo.
4. **Tabela “Em atraso agora”**: cliente, tipo, responsável, prazo interno, dias de atraso, com link para a página de origem (Solicitações ou Planejamento).
5. **Exportar Excel** do bloco semanal, no mesmo padrão já usado em Clientes.

## Briefing semanal

- A geração automática passa a incluir os novos indicadores: solicitadas, entregues, % no prazo e itens em atraso, com comparação vs. semana anterior.
- Novo slide **“Entregas da semana”** no PPTX, com a tabela de solicitações/planejamento e destaque dos atrasos.
- Regras de alerta automático adicionais: % de cumprimento do prazo abaixo de 80%, ou saldo da semana positivo por 3 semanas seguidas.
- Na tela de revisão do briefing, um bloco curto explicando a dinâmica (gerado automaticamente na segunda → em revisão → aprovado → enviado) e de onde vem cada número, para eliminar a dúvida sobre o que o relatório apresenta.

## Detalhes técnicos

- Nova função SQL `weekly_delivery_overview(p_weeks int, p_unidade text, p_tributacao text)` retornando um `jsonb` com a série por semana ISO para as duas origens, mais a lista de itens em atraso. Security definer, restrita a membros do time.
- Fonte de dados: `demands` (criação por `created_at`, conclusão por `completed_at`, prazo por `internal_deadline`) e `plannings` (conclusão derivada de `status = 'completed'` com a data de `updated_at`, já que a tabela não tem `completed_at`). Para tornar a métrica de planejamento confiável, será adicionada a coluna `completed_at` em `plannings` com trigger de preenchimento — mesmo padrão já existente em `demands`.
- Frontend: nova seção em `src/pages/ControleGerencial.tsx` (Recharts + tabela), sem alterar os blocos de backlog atuais.
- Edge function `generate-weekly-briefing`: passa a chamar a nova função SQL, grava os números em `auto_summary`/`auto_alerts` e adiciona o slide de entregas.
- `src/pages/BriefingReview.tsx`: bloco explicativo do fluxo e da origem dos números.

## Fora do escopo

- Não altera o cálculo de backlog/competências existente.
- Não altera prazos de cliente nem a lógica de status das demandas.
