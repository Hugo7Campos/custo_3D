# Custo3D

Aplicação estática para simular custos e precificar peças de impressão 3D. Interface em português, temas claro e escuro, sem contas, banco de dados ou dependências externas.

## Executar

Requer Node.js 20 ou superior apenas para os comandos de desenvolvimento.

```powershell
node scripts/serve.mjs
```

Abra **http://localhost:4173**. Para encerrar, pressione `Ctrl+C` no terminal. Não é necessário executar `npm install`.

No Windows, use `npm.cmd` se a política do PowerShell bloquear `npm.ps1`:

```powershell
npm.cmd start
npm.cmd test
npm.cmd run check
npm.cmd run build
```

No Linux e macOS, os mesmos comandos funcionam com `npm`.

Leia o [guia completo de uso e publicação](modoDeusar.md).

## Funcionalidades

- Visão geral com custos, preço sugerido, lucro, margem e gráficos interativos.
- Material, perdas, energia, depreciação, manutenção, mão de obra e custos personalizados.
- Comparação de venda direta e marketplace; impostos opcionais.
- Inflação composta de 1 a 60 meses, com seleção dos componentes reajustados.
- Até 20 cenários editáveis, tabela comparativa e gráfico.
- Salvamento automático com estrutura versionada, importação e exportação de JSON e relatórios CSV.
- Cache offline, layout responsivo, navegação por teclado e respeito a movimento reduzido.

## Organização

```text
index.html                   Entrada da aplicação
src/app.js                   Interface, navegação e eventos
src/styles.css               Temas, layout e responsividade
src/finance.js               Cálculos puros, formatação e CSV
src/state.js                 Estado, validação, persistência e backups
src/charts.js                Gráficos SVG acessíveis e interativos
sw.js                        Cache offline
manifest.webmanifest         Metadados da aplicação
tests/*.test.mjs              Testes de cálculo, validação e persistência
scripts/serve.mjs             Servidor estático local
scripts/build.mjs             Prepara dist/ para publicação
scripts/browser-check.mjs     Verificações reais em Edge/Chrome
.github/workflows/pages.yml   Publicação opcional via GitHub Actions
netlify.toml                 Configuração para Netlify
```

O ambiente de produção serve apenas os arquivos estáticos em `dist/`. Não há API nem código de servidor necessário aos cálculos. O servidor local existe para servir módulos JavaScript e permitir testar o cache offline.

## Precisão e limites

Os cálculos mantêm os valores intermediários sem arredondamento. A apresentação usa duas casas decimais; preço sugerido e equilíbrio são elevados ao próximo centavo. Por isso, a soma de componentes exibidos pode diferir em um centavo do total calculado com os valores completos.

A margem é calculada sobre o preço de venda. Na venda direta, comissão e tarifa fixa do marketplace são removidas. Os impostos só entram quando ativados. O preço futuro preserva taxas percentuais e tarifa fixa.

O custo atual e o projetado por peça são limitados a R$ 1 bilhão; o preço calculado, a R$ 1 trilhão. Combinações acima desses limites são rejeitadas para proteger a precisão numérica. Cada entrada também possui limites próprios em `src/state.js`.

Os exemplos de impressora, tarifa elétrica e inflação são hipóteses editáveis, sem alegação de valor oficial. Peso e tempo devem vir do fatiador ou de medições.

## Testes de navegador

No Windows com Microsoft Edge instalado:

```powershell
node scripts/browser-check.mjs
```

O comando abre um navegador sem janela, cria um perfil de teste isolado em `.qa/`, inicia um servidor temporário e fecha os processos ao terminar. Os dados do navegador pessoal não são usados. Capturas ficam em `.qa/` e não fazem parte da publicação.

Para outro Chrome/Edge, defina `BROWSER_PATH` com o caminho do executável. O script usa as portas locais 4187 e 9247, que precisam estar livres.

Os testes abrangem entrada brasileira, campos inválidos, cenários, temas, backups, CSV, importação, restauração, responsividade e recarga offline. Os testes automatizados de navegador usam Chromium; Firefox e Safari não foram executados neste ambiente.

## Manutenção

Ao alterar os arquivos estáticos, incremente a versão de `CACHE` em `sw.js` antes de publicar, para substituir o pacote offline. Ao alterar a estrutura dos dados, incremente `VERSION` em `src/state.js` e implemente uma migração explícita antes de aceitar backups antigos. Atualmente, versões diferentes são rejeitadas com mensagem clara.
