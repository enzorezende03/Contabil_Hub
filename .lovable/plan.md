# Carteira de clientes por colaborador

## Objetivo
Cada empresa passa a ter um **responsável pela carteira**. As demandas da semana continuam podendo ser atribuídas a qualquer pessoa, mas a liderança sempre vê de quem é a carteira.

## O que muda para o usuário

1. **Cadastro de Clientes**
   - Novo campo "Responsável pela carteira" no cadastro e na edição. Mostra só os colaboradores ativos do time operacional.
   - Nova coluna na tabela, com filtro por responsável.
   - A importação e a exportação em Excel passam a incluir essa coluna.
   - Ação em massa: selecionar várias empresas e definir o responsável de uma vez.
   - Só a coordenação e os administradores podem alterar a carteira.

2. **Controle Gerencial: novo bloco "Carteiras"**
   - Um card por colaborador com: quantidade de empresas, demandas abertas e atrasadas da carteira, e % concluído no período escolhido.
   - Indicador "Executado por outra pessoa": quantas demandas da carteira foram feitas por outro colaborador.
   - Ao clicar no card, abre a lista das empresas da carteira, com o status e o executor de cada demanda.
   - Alerta de "Empresas sem responsável".

3. **Cards de demandas (Solicitações e Planejamento)**
   - Quando quem executa a demanda não é o dono da carteira, aparece a etiqueta "Carteira: Nome".
   - O detalhe da demanda mostra "Responsável pela carteira" ao lado de "Responsável".

4. **Ao criar uma demanda**
   - O campo Responsável já vem preenchido com o dono da carteira da empresa escolhida, e pode ser trocado livremente.

## Detalhes técnicos
- Nova coluna `clients.carteira_responsavel_id uuid` (pode ficar vazia). A alteração fica restrita a coordenação e admin, usando a política de edição de `clients` que já existe.
- Hook `useClientPortfolio` com o mapa de `razao_social` para o responsável, porque demandas e planejamentos guardam o cliente pelo nome.
- Novo componente `PortfolioSection.tsx` em `components/gerencial`, que usa o mesmo filtro de período do TeamPerformanceSection.
- Ajustes em `Clients.tsx`, `CreateDemandDialog.tsx`, `CreatePlanningDialog.tsx`, `PlanningCard.tsx` e `DemandDetailsDialog.tsx`.
