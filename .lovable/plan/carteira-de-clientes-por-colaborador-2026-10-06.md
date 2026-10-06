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

5. **Nova página "Minhas empresas" (no menu lateral, em OPERAÇÃO)**
   - Cada colaborador vê a lista das empresas da própria carteira: tributação, unidade, demandas abertas e andamento do ano.
   - Cada empresa tem um campo de **notas** com observações e particularidades sobre o fechamento. As notas ficam registradas com autor e data, em formato de histórico.
   - A coordenação e os administradores escolhem de qual colaborador querem ver a carteira e podem trocar o responsável ali mesmo.
   - As notas aparecem também para quem pegar uma demanda daquela empresa, dentro do detalhe da demanda.

6. **Autonomia do perfil gerencial**
   - A coordenação e os administradores podem atribuir e transferir carteiras, além de editar e excluir notas de qualquer pessoa.
   - Os colaboradores só criam e editam as próprias notas.

## Detalhes técnicos
- Nova coluna `clients.carteira_responsavel_id uuid` (pode ficar vazia). A alteração fica restrita a coordenação e admin, usando a política de edição de `clients` que já existe.
- Hook `useClientPortfolio` com o mapa de `razao_social` para o responsável, porque demandas e planejamentos guardam o cliente pelo nome.
- Novo componente `PortfolioSection.tsx` em `components/gerencial`, que usa o mesmo filtro de período do TeamPerformanceSection.
- Ajustes em `Clients.tsx`, `CreateDemandDialog.tsx`, `CreatePlanningDialog.tsx`, `PlanningCard.tsx` e `DemandDetailsDialog.tsx`.
- Nova tabela `client_notes` (client_id, texto, author_id), com GRANT para os usuários conectados e RLS. Quem é da equipe lê. O autor cria, edita e exclui as próprias notas. Coordenação e admin gerenciam todas.
- Nova página `MinhasEmpresas.tsx`, com rota e item no menu (AppLayout) e permissão de página para todos os perfis.
