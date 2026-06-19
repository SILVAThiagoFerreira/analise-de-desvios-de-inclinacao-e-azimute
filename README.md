# OpenBlast DXF QA Site

Site estático para análise de desvios de inclinação, azimute e profundidade a partir de um DXF de execução de furos.

O projeto já vem com o arquivo `data/PP23.dxf` carregado como base padrão e pode rodar diretamente no GitHub Pages.

## O que o site entrega

- Campo para informar o nome do fogo analisado.
- Leitura do DXF com camadas `Hole`, `Theoretical Hole`, `Real Hole`, `Number` e `Length`.
- Gráfico de ângulo frontal com limites de controle.
- Gráfico de direção dos furos, com Δ Azimute e Δ Profundidade.
- Mapa em planta com planejado em azul, executado em vermelho e emboques.
- Resumo objetivo no padrão:
  - Aderência de Ângulo
  - Aderência Azimute
  - Aderência Z
  - tendência geral de profundidade
- Campo para inserir logo no relatório.
- Exportação do relatório em PDF pelo navegador.

## Como publicar no GitHub Pages

O pacote inclui workflow em `.github/workflows/deploy-pages.yml` para publicar automaticamente o conteúdo da raiz no GitHub Pages a cada push na branch `main`.

1. Crie ou conecte um repositório GitHub com este diretório.
2. Faça push da branch `main`.
3. No GitHub, acesse **Settings > Pages**.
4. Em **Build and deployment**, selecione `GitHub Actions`.
5. Aguarde a conclusão do workflow `Deploy static site to GitHub Pages`.

## Comandos sugeridos

```bash
git init
git add .
git commit -m "Publica site de analise de desvios OpenBlast"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

Depois, confirme em **Settings > Pages** que a origem está definida como `GitHub Actions`.

## Observação técnica

A análise é feita no navegador. Não existe backend, banco de dados ou planilha externa. Os cálculos são gerados a partir das geometrias do DXF:

- comprimento planejado: linha `Theoretical Hole`;
- comprimento executado: polilinha `Real Hole`;
- ângulo frontal: inclinação da corda executada em relação à vertical;
- Δ Azimute: diferença angular entre direção teórica e direção executada em planta;
- Δ Profundidade: comprimento executado menos comprimento planejado.

Se o furo teórico estiver vertical ou sem deslocamento em planta suficiente, o site não força comparação de azimute para aquele furo.
