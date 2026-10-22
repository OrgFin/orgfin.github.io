# OrgFin

App de organização financeira pessoal que instala no computador e no celular (PWA). Funciona sem internet e guarda os dados só no aparelho.

## Telas

- **Painel**: salário, gastos fixos, gastos avulsos, sobra do mês, maior gasto, para onde vai o dinheiro, parcelados, saldo dia a dia, contas do mês para marcar como pagas, vales e cartão.
- **Lançar**: lançamento manual de gasto ou entrada, e leitura de PDF de fatura ou extrato. O PDF é lido no próprio aparelho e os gastos aparecem para conferir antes de salvar.
- **Plano**: fase em que você está, lista de ações em ordem de prioridade calculada com os seus números e projeção dos próximos 12 meses.
- **Termômetro**: saldo projetado de cada dia, colorido por faixa, no mês ou no ano inteiro.
- **Contas**: entradas e saídas fixas, vales, assinaturas no cartão e dívidas separadas.
- **Economia**: quanto você guardou de verdade em cada mês, comparado com a sobra projetada.
- **Ajustes**: saldo atual, faixas de cor, instalar, exportar e importar backup.

## Publicar

É um site estático, sem etapa de build. Basta servir esta pasta por https (por exemplo, GitHub Pages). Ao mudar qualquer arquivo, aumente a versão em `sw.js` (`meu-caixa-vN`) para os aparelhos instalados pegarem a atualização.

## Dados

Nada é enviado para servidor. Para levar os dados do computador para o celular, use Exportar backup em um e Importar backup no outro.

A leitura de PDF usa o [PDF.js](https://mozilla.github.io/pdf.js/) (licença Apache 2.0, em `vendor/`).
