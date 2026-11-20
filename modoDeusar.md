# Como usar o Custo3D

O Custo3D estima o custo de fabricar uma peça e sugere um preço de venda com a margem que você definir. Todos os cálculos e dados ficam no navegador.

## 1. Abrir no computador

Na pasta do projeto, abra o terminal e execute:

```powershell
node scripts/serve.mjs
```

Depois, abra **http://localhost:4173** no navegador. Mantenha o terminal aberto durante o uso local. Para encerrar o servidor, pressione `Ctrl+C`.

Não precisa instalar pacotes. É necessário ter Node.js 20 ou superior para usar esse comando. Também é possível usar outro servidor estático. Evite abrir `index.html` com duplo clique: módulos JavaScript e service workers precisam de um endereço HTTP local ou HTTPS.

Se preferir usar os comandos npm no PowerShell, execute `npm.cmd start`. Isso evita o bloqueio de `npm.ps1` pela política de scripts, sem alterar configurações do Windows.

## 2. Simular uma impressão

Na seção **Simulador de produção**, informe:

1. Nome da simulação, peso consumido e horas/minutos estimados pelo fatiador.
2. Tipo de filamento, preço e peso do rolo, além das perdas adicionais.
3. Potência média da impressora e tarifa efetiva da sua conta de energia.
4. Aquisição, valor residual, vida útil e manutenção por hora da impressora.
5. Embalagem, consumíveis e outros custos por peça. Ative mão de obra se quiser contabilizar o seu tempo de trabalho.

Os resultados mudam automaticamente. Você pode usar `12,50`, `1234.56` ou `1.234,56`. Um ponto isolado é interpretado como separador decimal: digite `1800` ou `1.800,00` para mil e oitocentos reais.

Campos vazios ou inválidos ficam destacados. Enquanto você corrige, os cálculos e o salvamento usam o último valor válido. A edição incompleta permanece ao navegar entre seções, mas não é gravada sobre o dado válido: após recarregar, o último valor válido reaparece.

O peso deve incluir a estimativa adequada de material. Evite contar duas vezes os suportes e a purga se o fatiador já os incluiu. O percentual de perdas é um adicional sobre o peso informado.

O tempo de mão de obra é separado do tempo de impressão. Uma impressão de cinco horas não exige necessariamente cinco horas de trabalho manual.

O simulador considera **uma peça por cálculo**. Para um lote, distribua o tempo, o material, as taxas fixas e os demais custos pelo número de peças de acordo com sua operação.

## 3. Definir o preço

Em **Precificação e lucro**, ajuste a margem desejada e as taxas do canal de venda.

- **Margem:** parte do preço de venda que sobra como lucro após os custos e taxas simulados.
- **Comissão:** percentual cobrado sobre a venda pelo marketplace.
- **Tarifa fixa:** valor por transação, tratado como uma transação por peça neste simulador.
- **Impostos:** só entram na conta quando você ativa a opção e informa a alíquota.
- **Equilíbrio:** preço mínimo que cobre os custos e taxas, antes de exigir uma margem de lucro.

A soma de margem, comissão e impostos deve ser menor que 100%. Se chegar a esse limite, o preço sugerido fica indisponível até a correção.

O comparativo mostra venda direta e marketplace lado a lado. Na venda direta, comissão e tarifa fixa são zeradas; impostos ativados continuam sendo considerados.

O preço sugerido sobe ao próximo centavo. Isso pode produzir uma margem efetiva ligeiramente maior que a desejada.

## 4. Projetar inflação

Em **Projeção de inflação**, informe a taxa anual esperada e um horizonte de 1 a 60 meses.

Marque apenas os componentes que devem ser reajustados. A depreciação, por exemplo, começa desmarcada, pois foi calculada sobre uma aquisição já feita. Componentes desmarcados permanecem com o mesmo valor.

O gráfico mostra cada mês. Passe o mouse, selecione um ponto ou use `Tab` para consultar valores. O preço futuro usa o novo custo com as mesmas configurações de margem e taxas. A tarifa fixa não é reajustada.

Essa é uma simulação hipotética, não uma previsão oficial do IPCA.

## 5. Comparar cenários

Em **Comparação de cenários**, edite os exemplos ou clique em **Novo cenário**.

Cada cenário tem nome, peso e tempo próprios. Material, máquina, embalagem, mão de obra e regras de precificação são compartilhados com a configuração atual. Todos esses custos são aplicados por peça.

É possível manter até 20 cenários. Para comparar máquinas ou materiais diferentes, exporte um relatório, altere as configurações compartilhadas e exporte outro.

Dimensões externas, isoladamente, não determinam o peso nem o tempo real de impressão. Use as estimativas do fatiador.

## 6. Guardar e transferir dados

As alterações válidas são salvas automaticamente. O cabeçalho informa o horário do último salvamento; **Configurações** mostra a data e o horário completos.

Os dados pertencem ao navegador e ao endereço usado. `localhost`, `127.0.0.1`, portas diferentes e sites publicados têm armazenamentos diferentes. Não existe sincronização entre dispositivos. Limpar os dados do site ou usar navegação privada pode impedir a conservação das simulações.

Em **Configurações**:

- **Exportar backup:** baixa um JSON com todas as configurações, tema e cenários válidos.
- **Importar backup:** valida estrutura, versão, tipos, limites e relações dos valores. Depois solicita confirmação antes de substituir os dados atuais.
- **Exportar relatório CSV:** baixa a simulação atual e todos os cenários para abrir em uma planilha.
- **Restaurar configurações padrão:** solicita confirmação e substitui as configurações pelos exemplos. Exporte um backup antes se quiser guardar o trabalho.

Backups são limitados a 1 MB. Backups incompatíveis não substituem os dados. Os rascunhos inválidos dos campos não são incluídos nas exportações.

O CSV usa separador `;`, vírgula decimal e codificação UTF-8 com BOM. Se a planilha não separar as colunas automaticamente, importe o arquivo selecionando UTF-8 e ponto e vírgula. Textos que poderiam virar fórmulas são neutralizados na exportação.

## 7. Usar offline

Abra o site uma vez com conexão e aguarde o rodapé mostrar **Disponível offline neste navegador**. Os arquivos da aplicação serão armazenados por um service worker; depois, os cálculos, a navegação e os backups funcionam sem internet, inclusive após recarregar.

Esse recurso depende de HTTPS em produção ou `localhost` no desenvolvimento. O navegador pode remover caches e dados locais quando falta espaço. O backup JSON continua sendo a forma de guardar suas configurações fora do navegador.

Nenhuma fonte, biblioteca, imagem ou serviço de cálculo é carregado de um CDN.

## 8. Testar e preparar para publicar

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

O último comando cria a pasta **dist**, contendo somente os arquivos necessários ao site. Para testar essa versão:

```powershell
node scripts/serve.mjs --dist
```

No Linux/macOS, troque `npm.cmd` por `npm`.

## 9. Publicar no GitHub Pages

O projeto inclui `.github/workflows/pages.yml`, que testa o código, prepara `dist` e publica os arquivos estáticos.

1. Crie um repositório e envie os arquivos do projeto, incluindo `.github/workflows/pages.yml`.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment → Source**, selecione **GitHub Actions**.
4. Execute o workflow **Publicar Custo3D** pela aba **Actions**, ou envie uma alteração para a branch `main`.
5. Aguarde o workflow concluir e abra a URL exibida na publicação.

Se usar outro nome de branch, ajuste `branches` no arquivo do workflow. Os caminhos do site são relativos, portanto funcionam também em endereços como `usuario.github.io/custo3d/`. As etapas seguem a [documentação oficial do GitHub Pages](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically).

## 10. Publicar no Netlify

Para publicação manual, execute `npm.cmd run build` e envie a pasta **dist** para o Netlify Drop. O `index.html` deve estar diretamente dentro da pasta enviada. O envio manual não executa o build por você. Consulte a [documentação oficial de deploys do Netlify](https://docs.netlify.com/deploy/create-deploys/).

Se conectar um repositório ao Netlify, o arquivo `netlify.toml` já define:

- Comando de build: `npm test && npm run build`.
- Pasta publicada: `dist`.

Depois de publicar, abra a URL HTTPS, faça uma simulação e importe um backup se quiser transferir os dados do endereço local.

## 11. Exemplo inicial

Com os parâmetros iniciais:

| Indicador | Valor |
| --- | ---: |
| Filamento: 65 g, rolo de R$ 95/1.000 g, perdas de 5% | R$ 6,48 |
| Energia: 100 W, 2 h 30 min, R$ 1,03/kWh | R$ 0,26 |
| Depreciação | R$ 0,75 |
| Manutenção | R$ 0,38 |
| Embalagem + consumíveis | R$ 2,00 |
| Custo total | **R$ 9,87** |
| Preço com margem de 30%, comissão de 14% e tarifa de R$ 2 | **R$ 21,19** |
| Lucro estimado | **R$ 6,36** |

A Bambu Lab A1 Mini e a tarifa de Cascavel, PR são referências ilustrativas. Os valores não são especificações oficiais nem uma pesquisa de preços. Ajuste tudo à sua realidade antes de usar o resultado.
