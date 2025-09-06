import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Endpoint para resolver problemas de imagem
app.post('/api/solve', async (req, res) => {
  try {
    const { provider, model, temperature, dataUrl, prompt } = req.body;
    
    console.log(`Recebendo requisição: ${provider} ${model}`);
    
    // Verifica se todos os dados necessários foram enviados
    if (!dataUrl || !prompt) {
      return res.status(400).json({ error: "Dados insuficientes: falta dataUrl ou prompt" });
    }
    
    // Configuração da API baseada no provedor
    let apiUrl, apiKey, modelName;
    
    if (provider === "openai") {
      apiUrl = "https://api.openai.com/v1/chat/completions";
      apiKey = process.env.OPENAI_API_KEY;
      modelName = model || "gpt-4o-mini";
    } else if (provider === "openrouter") {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      apiKey = process.env.OPENROUTER_API_KEY;
      modelName = model || "openai/gpt-4o-mini";
    } else {
      return res.status(400).json({ error: "Provedor não suportado" });
    }
    
    // Verifica se a chave de API está configurada
    if (!apiKey) {
      return res.status(500).json({ 
        error: `Chave de API não configurada para ${provider}. Configure a variável de ambiente ${provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY"}` 
      });
    }
    
    // Prepara a mensagem para a API
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }
    ];
    
    // Chama a API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(provider === "openrouter" && {
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Solucionador por Imagem'
        })
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        temperature: temperature || 0.2,
        max_tokens: 1000
      })
    });
    
    // Verifica se a resposta foi bem-sucedida
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro da API: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `Erro na API ${provider}: ${response.status}`, 
        details: errorText 
      });
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    res.json({ content });
    
  } catch (error) {
    console.error("Erro no servidor:", error);
    res.status(500).json({ error: "Erro interno do servidor", details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor backend rodando em http://localhost:${PORT}`);
  const hasOpenAI = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '';
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '';
  console.log(`Variáveis .env carregadas -> OPENAI_API_KEY: ${hasOpenAI ? 'SIM' : 'NÃO'}, OPENROUTER_API_KEY: ${hasOpenRouter ? 'SIM' : 'NÃO'}`);
  console.log("Lembre-se de configurar suas variáveis de ambiente:");
  console.log("  OPENAI_API_KEY=sua_chave_aqui (se usar OpenAI)");
  console.log("  OPENROUTER_API_KEY=sua_chave_aqui (se usar OpenRouter)");
});
