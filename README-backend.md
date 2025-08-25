# Solucionador por Imagem - Backend

Este é um servidor backend simples que expõe o endpoint `/api/solve` para o frontend do Solucionador por Imagem.

## Configuração

1. Crie um arquivo `.env` na raiz do projeto com sua chave de API:

Para OpenAI:
```
OPENAI_API_KEY=sua_chave_aqui
```

Para OpenRouter:
```
OPENROUTER_API_KEY=sua_chave_aqui
```

2. Instale as dependências (já feito):
```
npm install express cors node-fetch
```

3. Execute o servidor:
```
npm run server
```

O servidor estará disponível em `http://localhost:3001`.

## Funcionalidades

- Endpoint `/api/solve` que recebe:
  - `provider`: 'openai' ou 'openrouter'
  - `model`: modelo específico (ex: 'gpt-4o-mini')
  - `temperature`: valor de 0 a 1
  - `dataUrl`: imagem em base64
  - `prompt`: instruções para o modelo

- Suporte a ambos provedores (OpenAI e OpenRouter)
- Validação de dados de entrada
- Tratamento de erros detalhado