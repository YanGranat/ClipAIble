# ✂️ ClipAIble

> **Extrator de artigos com IA** — Salve qualquer artigo da web como PDF, EPUB, FB2, Markdown ou Áudio. Tradução para 11 idiomas. Funciona em qualquer site.

![Versão](https://img.shields.io/badge/versão-3.0.1-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extensão-green)
![Licença](https://img.shields.io/badge/licença-MIT-brightgreen)

**[⬇️ Instalar do Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ O que é ClipAIble?

ClipAIble usa inteligência artificial para extrair inteligentemente o conteúdo de artigos de qualquer página web — remove anúncios, navegação, popups e elementos desnecessários. Depois exporta para seu formato preferido:

- 📄 **PDF** — Estilo bonito e personalizável
- 📚 **EPUB** — Compatível com Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatível com PocketBook, FBReader
- 📝 **Markdown** — Texto simples para notas
- 🎧 **Áudio (MP3/WAV)** — Ouça com narração de IA

Todos os formatos suportam **tradução para 11 idiomas** — até mesmo tradução de texto em imagens!

---

## 🚀 Recursos

### 🤖 Extração com IA
- **Dois modos**: AI Selector (rápido, reutilizável) e AI Extract (abrangente)
- **Vários provedores**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Suporte a vídeo**: Extrair legendas de vídeos YouTube/Vimeo e convertê-las em artigos (v3.0.0)
  - Múltiplos métodos de extração com fallbacks
  - Prioridade: legendas manuais > geradas automaticamente > traduzidas
  - Processamento IA: remove timestamps, mescla parágrafos, corrige erros
  - Fallback de transcrição de áudio quando legendas não estão disponíveis
- **Detecção inteligente**: Encontra o conteúdo principal do artigo, remove elementos desnecessários automaticamente
- **Estratégias de fallback aprimoradas**: 6 estratégias diferentes para extração de conteúdo confiável
- **Preserva estrutura**: Cabeçalhos, imagens, blocos de código, tabelas, notas de rodapé
- **Cache de seletores**: Configurações independentes para uso e habilitação de cache

### 🎧 Exportação de áudio
- **5 provedores TTS**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ vozes**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (inglês e ucraniano)
- **Regulação de velocidade**: 0.5x a 2.0x (apenas OpenAI/ElevenLabs; Google/Qwen/Respeecher usam velocidade fixa)
- **Suporte a formatos**: MP3 (OpenAI/ElevenLabs) ou WAV (Google/Qwen/Respeecher)
- **Pronúncia multilíngue**: Pronúncia correta para cada idioma
- **Suporte ao idioma ucraniano**: Vozes ucranianas dedicadas via Respeecher (10 vozes)
- **Limpeza inteligente de texto**: IA remove URLs, código e conteúdo não vocal
- **Recursos específicos do provedor**:
  - **ElevenLabs**: Seleção de modelo (v2, v3, Turbo v2.5), seleção de formato, configurações avançadas de voz
  - **Google Gemini 2.5 TTS**: Seleção de modelo (pro/flash), 30 vozes, limite de 24k caracteres
  - **Qwen**: 49 vozes incluindo voz russa (Alek), limite de 600 caracteres
  - **Respeecher**: Parâmetros de amostragem avançados (temperature, repetition_penalty, top_p)

### 🌍 Tradução
- **11 idiomas**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Detecção inteligente**: Ignora a tradução se o artigo já está no idioma de destino
- **Tradução de imagens**: Traduz texto em imagens (via Gemini)
- **Metadados localizados**: Datas e rótulos se adaptam ao idioma

### 🎨 Personalização PDF
- **4 predefinições**: Escuro, Claro, Sépia, Alto contraste
- **Cores personalizáveis**: Fundo, texto, cabeçalhos, links
- **11 fontes**: Padrão (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Tamanho da fonte**: Ajustável (padrão: 31px)
- **Modos de página**: Página única contínua ou formato multi-página A4


### ⚡ Recursos inteligentes
- **Suporte a vídeo**: Extrair legendas de vídeos YouTube/Vimeo e convertê-las em artigos (v3.0.0)
  - Extração direta de legendas (nenhuma chave API do YouTube/Vimeo necessária)
  - Processamento IA: remove timestamps, mescla parágrafos, corrige erros
  - Fallback de transcrição de áudio: transcrição automática quando legendas não estão disponíveis (gpt-4o-transcribe)
  - Integração completa do pipeline: tradução, índice, resumo, todos os formatos de exportação
- **Geração de resumo**: Crie resumos IA detalhados de qualquer artigo ou vídeo
  - Clique no botão **"Gerar resumo"** para criar um resumo completo
  - Funciona com artigos normais e vídeos YouTube/Vimeo
  - Continua gerando mesmo se o popup estiver fechado (funciona em segundo plano)
  - Copiar para área de transferência ou baixar como arquivo Markdown
  - Visualização expansível/recolhível com texto formatado
  - Resumos detalhados com ideias-chave, conceitos, exemplos e conclusões
- **Resumo (TL;DR)**: Resumo curto de 2-4 frases escrito por IA, incluído em documentos
  - Recurso opcional: ative nas configurações para adicionar resumo curto a PDF/EPUB/FB2/Markdown
  - Aparece no início dos documentos exportados
  - Diferente do resumo detalhado (este é um resumo breve)
- **Modo offline**: Cache de seletores — nenhuma IA necessária para sites repetidos
  - Configurações independentes: usar seletores em cache e habilitar cache separadamente
  - Invalidação automática em caso de falha na extração
  - Gerenciamento manual de cache por domínio
- **Estatísticas**: Rastreie quantidade de salvamentos, visualize histórico
- **Índice**: Gerado automaticamente a partir de cabeçalhos
- **Menu contextual**: Clique direito → "Salvar artigo como PDF/EPUB/FB2/Markdown/Áudio"
- **Cancelar a qualquer momento**: Pare o processamento com um clique
- **Importar/Exportar configurações**: Backup e restauração de todas as configurações (chaves API excluídas por segurança)

### 🔒 Segurança
- **Chaves API criptografadas** com AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Chaves nunca exportadas** — excluídas do backup de configurações
- **Todos os dados são armazenados localmente** — nada é enviado a terceiros

---

## ⚠️ Limitações Conhecidas

### Formatos de Arquivo
- **Formato WAV** (Google/Qwen/Respeecher): Os arquivos podem ser muito grandes (10-50MB+ para artigos longos). O formato MP3 (OpenAI/ElevenLabs) oferece tamanhos de arquivo menores.
- **Limites de caracteres por solicitação**: 
  - OpenAI TTS: 4096 caracteres
  - ElevenLabs: 5000 caracteres
  - Google Gemini 2.5 TTS: 24000 caracteres
  - Qwen TTS: 600 caracteres
  - Respeecher TTS: 450 caracteres
  - O texto é automaticamente dividido de forma inteligente nos limites de frases/palavras

### Restrições Técnicas
- **Requisito keep-alive**: Chrome MV3 requer um intervalo keep-alive de pelo menos 1 minuto. Tarefas de processamento longas podem levar vários minutos. A extensão usa mecanismo unificado de keep-alive (alarme a cada 1 minuto + salvamento de estado a cada 2 segundos) para evitar que o service worker pare.
- **CORS para imagens**: Algumas imagens podem não carregar se o site bloquear solicitações cross-origin. A extensão ignorará essas imagens.
- **Cancelamento não instantâneo**: O cancelamento pode levar alguns segundos para parar completamente todos os processos em segundo plano.
- **Recuperação do Service Worker**: Operações retomam automaticamente após reinicialização do service worker (dentro de 2 horas).

### Compatibilidade do Navegador
- **Chrome/Edge/Brave/Arc**: Totalmente suportado
- **Firefox**: Não suportado (usa uma API de extensão diferente)
- **Safari**: Não suportado (usa uma API de extensão diferente)

---

## 📦 Instalação

### Opção 1: Instalação do Chrome Web Store (Recomendado)

**[⬇️ Instalar ClipAIble do Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Opção 2: Instalação manual (Modo desenvolvedor)

1. **Clone** este repositório
2. Abra Chrome → `chrome://extensions/`
3. Ative o **Modo do desenvolvedor**
4. Clique em **Carregar sem compactação** → selecione a pasta

### Requisitos

- Chrome, Edge, Brave ou navegador Arc
- Chave API de pelo menos um provedor (veja abaixo)

---

## 🔑 Obter chaves API

### OpenAI (modelos GPT + Áudio)

1. Vá para [platform.openai.com](https://platform.openai.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys** (menu esquerdo) ou diretamente para [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Clique em **"Create new secret key"**
5. Copie a chave (começa com `sk-...`)
6. Adicione faturamento em **Settings → Billing** (necessário para uso da API)

> **Nota:** A chave OpenAI é necessária para exportação de áudio (TTS). Outros formatos funcionam com qualquer provedor.

### Google Gemini

1. Vá para [Google AI Studio](https://aistudio.google.com/)
2. Faça login com conta do Google
3. Clique em **"Get API key"** ou vá diretamente para [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Clique em **"Create API key"**
5. Copie a chave (começa com `AIza...`)

> **Dica:** Gemini também habilita a função de tradução de texto em imagens e Google Gemini 2.5 TTS (30 vozes). Para TTS, você pode usar a mesma chave API Gemini ou definir uma chave API Google TTS dedicada. Requer ativação da Generative Language API no Google Cloud Console.

### Anthropic Claude

1. Vá para [console.anthropic.com](https://console.anthropic.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys**
4. Clique em **"Create Key"**
5. Copie a chave (começa com `sk-ant-...`)
6. Adicione créditos em **Plans & Billing**

### ElevenLabs (Áudio)

1. Vá para [ElevenLabs](https://elevenlabs.io/)
2. Registre-se ou faça login
3. Navegue para **Profile** → **API Keys**
4. Crie uma chave API
5. Copie a chave

> **Nota:** ElevenLabs fornece 9 vozes premium com TTS de alta qualidade. Suporta regulação de velocidade (0.25-4.0x) e seleção de formato (MP3 alta qualidade padrão: mp3_44100_192). Modelos: Multilingual v2, v3 (padrão), Turbo v2.5. Configurações avançadas de voz disponíveis (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Áudio)

1. Vá para [Google AI Studio](https://aistudio.google.com/)
2. Faça login com conta do Google
3. Clique em **"Get API key"** ou vá diretamente para [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Clique em **"Create API key"**
5. Copie a chave (começa com `AIza...`)
6. Ative **Generative Language API** no [Google Cloud Console](https://console.cloud.google.com/)
7. (Opcional) Ative faturamento se necessário para seu modelo

> **Nota:** Google Gemini 2.5 TTS fornece 30 vozes. Você pode usar a mesma chave API Gemini ou definir uma chave API Google TTS dedicada. Formato WAV fixo a 24kHz. Modelos: `gemini-2.5-pro-preview-tts` (principal) ou `gemini-2.5-flash-preview-tts` (mais rápido).

### Qwen3-TTS-Flash (Áudio)

1. Vá para [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys** ou **Model Studio**
4. Crie uma chave API
5. Copie a chave (começa com `sk-...`)

> **Nota:** Qwen3-TTS-Flash fornece 49 vozes, incluindo uma voz russa dedicada (Alek). Formato WAV fixo a 24kHz.

### Respeecher (Áudio - Inglês e Ucraniano)

1. Vá para [Respeecher Space](https://space.respeecher.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys**
4. Crie uma chave API
5. Copie a chave

> **Nota:** Respeecher suporta inglês e ucraniano com vozes ucranianas dedicadas. Formato WAV fixo a 22.05kHz.

### Qual escolher?

| Provedor | Melhor para | Áudio | Tradução de imagens |
|----------|-------------|-------|---------------------|
| **OpenAI** | Uso geral, exportação de áudio, transcrição de vídeo | ✅ (11 vozes) | ❌ |
| **Gemini** | Extração rápida, tradução de imagens, exportação de áudio (30 vozes) | ✅ (30 vozes) | ✅ |
| **Claude** | Artigos longos, páginas complexas | ❌ | ❌ |
| **Grok** | Tarefas de raciocínio rápido | ❌ | ❌ |
| **OpenRouter** | Acesso a múltiplos modelos | ❌ | ❌ |
| **ElevenLabs** | Exportação de áudio (9 vozes, alta qualidade) | ✅ (9 vozes) | ❌ |
| **Qwen** | Exportação de áudio (49 vozes, suporte russo) | ✅ (49 vozes) | ❌ |
| **Respeecher** | Exportação de áudio (idioma ucraniano) | ✅ (14 vozes) | ❌ |

**Recomendação:** 
- **Para extração**: Comece com OpenAI ou Gemini (rápido e confiável)
- **Para áudio**: OpenAI para uso geral, ElevenLabs para alta qualidade, Google Gemini 2.5 TTS para 30 vozes, Qwen para russo, Respeecher para ucraniano
- **Para tradução de imagens**: Requer chave API Gemini

---

## 🎯 Início rápido

1. Clique no ícone **ClipAIble** na barra de ferramentas
2. Digite sua chave API → **Salvar chaves**
3. Navegue para qualquer artigo
4. Clique em **Salvar como PDF** (ou escolha outro formato)
5. Pronto! O arquivo é baixado automaticamente

**Dicas:**
- Clique direito em qualquer lugar → **"Salvar artigo como PDF"**
- Clique em **"Gerar resumo"** para criar um resumo IA detalhado (funciona mesmo se o popup estiver fechado)
- Ative **"Gerar TL;DR"** nas configurações para adicionar um resumo curto aos documentos

---

## ⚙️ Configurações

### Interface

- **Tema**: Escolha Escuro, Claro ou Auto (segue o sistema) no cabeçalho
- **Idioma**: Selecione o idioma da interface (11 idiomas) no cabeçalho
- **Modelos personalizados**: Adicione seus próprios modelos IA através do botão "+" ao lado do seletor de modelos

### Modos de extração

| Modo | Velocidade | Melhor para |
|------|------------|-------------|
| **AI Selector** | ⚡ Rápido | A maioria dos sites, blogs, notícias |
| **AI Extract** | 🐢 Abrangente | Páginas complexas, Notion, SPAs |

### Modelos de IA

| Provedor | Modelo | Notas |
|----------|--------|-------|
| OpenAI | GPT-5.2 | Mais recente, raciocínio médio (padrão) |
| OpenAI | GPT-5.2-high | Melhorada, raciocínio alto |
| OpenAI | GPT-5.1 | Equilibrado |
| OpenAI | GPT-5.1 (high) | Melhor qualidade, raciocínio alto |
| Anthropic | Claude Sonnet 4.5 | Excelente para artigos longos |
| Google | Gemini 3 Pro | Extração rápida, tradução de imagens |
| Grok | Grok 4.1 Fast Reasoning | Raciocínio rápido |
| OpenRouter | Vários modelos | Acesso a múltiplos provedores |

**Modelos personalizados:** Clique no botão **"+"** ao lado do seletor de modelos para adicionar modelos personalizados (por exemplo, `gpt-4o`, `claude-opus-4.5`). Modelos personalizados aparecem no menu suspenso e podem ser ocultados/exibidos conforme necessário.

### Vozes de áudio

**OpenAI (11 vozes) :** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 vozes) :** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 vozes) :** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 vozes) :** Incluindo Elias (padrão), Alek (russo) e vozes para 10 idiomas

**Respeecher (14 vozes) :** 4 inglesas (Samantha, Neve, Gregory, Vincent) + 10 vozes ucranianas

### Predefinições de estilo (PDF)

| Predefinição | Fundo | Texto |
|--------------|-------|-------|
| Escuro | `#303030` | `#b9b9b9` |
| Claro | `#f8f9fa` | `#343a40` |
| Sépia | `#faf4e8` | `#5d4e37` |
| Alto contraste | `#000000` | `#ffffff` |

**Cores personalizadas:** Personalize fundo, texto, cabeçalhos e links com seletores de cor. Botões de redefinição individuais (↺) para cada cor, ou **"Redefinir tudo para padrão"** para restaurar todos os estilos.

---

## 📊 Estatísticas e cache

Clique em **📊 Estatísticas** para ver:
- Total de salvamentos, contagem deste mês
- Divisão por formato (PDF, EPUB, FB2, Markdown, Áudio)
- Histórico recente com links para artigos originais (últimos 50 salvamentos)
  - Clique no link para abrir o artigo original
  - Clique no botão ✕ para excluir uma entrada de histórico individual
  - Mostra formato, domínio, tempo de processamento e data
- Domínios em cache para modo offline
- **Ativar/Desativar estatísticas**: Alternar para coleta de estatísticas
- **Limpar estatísticas**: Botão para redefinir todas as estatísticas
- **Limpar cache**: Botão para remover todos os seletores em cache
- Exclusão de domínios individuais do cache

## 📝 Geração de resumo

Crie resumos IA detalhados de qualquer artigo ou vídeo:

1. Navegue para qualquer artigo ou vídeo YouTube/Vimeo
2. Clique no botão **"Gerar resumo"** no popup
3. O resumo é gerado em segundo plano (você pode fechar o popup)
4. Quando pronto, o resumo aparece com opções:
   - **Copiar** para área de transferência
   - **Baixar** como arquivo Markdown
   - **Expandir/Recolher** para ver o texto completo
   - **Fechar** para ocultar o resumo

**Recursos:**
- Funciona com artigos e vídeos YouTube/Vimeo
- Continua gerando mesmo se o popup estiver fechado
- Resumos detalhados com ideias-chave, conceitos, exemplos e conclusões
- Texto formatado com cabeçalhos, listas e links
- Salvo automaticamente — persiste até que você o feche

**Nota:** A geração de resumo está separada da exportação de documentos. Use-a para entender rapidamente o conteúdo sem salvar um documento completo.

### Modo offline

ClipAIble armazena em cache os seletores gerados por IA por domínio:
- **Segunda visita = instantânea** — sem chamada de API
- **Invalidação automática** — limpa se a extração falhar
- **Controle manual** — excluir domínios individuais
- **Configurações independentes**:
  - **Usar seletores em cache**: Ignorar análise de página se o cache existir (mais rápido)
  - **Habilitar cache**: Salvar novos seletores no cache após extração
  - Ambas as configurações funcionam independentemente para controle flexível

---

## 💾 Importar/Exportar configurações

**⚙️ Configurações** → **Import/Export**

- Exportar todas as configurações (chaves API excluídas por segurança)
- Opcional: incluir estatísticas e cache
- Importar com opções de mesclar ou sobrescrever

---

## 🔧 Solução de problemas

| Problema | Solução |
|----------|---------|
| Conteúdo vazio | Tente o modo **AI Extract** |
| Chave API inválida | Verifique o formato da chave (sk-..., AIza..., sk-ant-...) |
| Imagens faltando | Alguns sites bloqueiam cross-origin; imagens pequenas filtradas |
| Áudio lento | Artigos longos divididos em blocos; observe a barra de progresso |
| Resumo não gerado | Verifique a chave API, certifique-se de que o conteúdo da página esteja carregado, tente novamente |
| Timeout de geração de resumo | Artigos muito longos podem levar até 45 minutos; aguarde ou tente com conteúdo mais curto |

---

## 🏗️ Arquitetura

```
clipaible/
├── manifest.json       # Configuração da extensão
├── popup/              # Interface (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── content.js      # Content script para YouTube
│   ├── locales.js      # Localização UI (11 idiomas)
│   ├── api/            # Provedores AI & TTS
│   │   ├── openai.js   # OpenAI (modelos GPT)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # Roteador TTS
│   │   └── index.js    # Roteador API
│   ├── extraction/     # Extração de conteúdo
│   │   ├── prompts.js  # Prompts IA
│   │   ├── html-utils.js # Utilitários HTML
│   │   ├── video-subtitles.js # Extração de legendas YouTube/Vimeo
│   │   └── video-processor.js # Processamento de legendas IA
│   ├── translation/    # Tradução e detecção de idioma
│   ├── generation/     # PDF, EPUB, FB2, MD, Áudio
│   ├── cache/          # Cache de seletores
│   ├── stats/          # Estatísticas de uso
│   ├── settings/       # Importar/Exportar configurações
│   ├── state/          # Gerenciamento de estado de processamento
│   └── utils/          # Configuração, criptografia, utilitários
│       ├── video.js    # Detecção de plataforma de vídeo
│       └── api-error-handler.js # Tratamento comum de erros API
├── print/              # Renderização PDF
├── config/             # Estilos
├── lib/                # JSZip
├── docs/               # Arquivos README localizados
└── memory-bank/        # Documentação do projeto
```

---

## 🔐 Segurança e privacidade

- **Criptografia**: AES-256-GCM via Web Crypto API
- **Derivação de chave**: PBKDF2, 100.000 iterações
- **Sem rastreamento**: Sem análises, sem registro remoto
- **Apenas local**: Todos os dados permanecem no seu navegador

---

## 📋 Permissões

ClipAIble requer as seguintes permissões para funcionar. Todas as permissões são usadas apenas para os propósitos indicados:

| Permissão | Por quê |
|-----------|---------|
| `activeTab` | Ler a página atual para extrair conteúdo quando você clica no ícone da extensão ou usa o menu contextual. A extensão acessa apenas a aba que você está visualizando atualmente. |
| `storage` | Salvar suas configurações (chaves API, preferências de estilo, seleção de idioma) e estatísticas localmente no seu navegador. Seus dados nunca saem do seu dispositivo. |
| `scripting` | Injetar o script de extração de conteúdo em páginas web. Este script encontra e extrai o conteúdo do artigo (texto, imagens, cabeçalhos) do DOM da página. |
| `downloads` | Salvar os arquivos gerados (PDF, EPUB, FB2, Markdown, Áudio) no seu computador. Sem esta permissão, a extensão não pode baixar arquivos. |
| `debugger` | **Apenas geração PDF** — Usa a funcionalidade integrada print-to-PDF do Chrome para gerar PDFs de alta qualidade com layout de página e estilo adequados. O depurador é anexado apenas durante a geração PDF e imediatamente desanexado após a conclusão. Esta é a única forma de gerar PDFs com estilo personalizado em extensões Chrome. |
| `alarms` | Manter o service worker em segundo plano ativo durante operações longas (artigos grandes, tradução). Chrome Manifest V3 suspende service workers após 30 segundos, mas o processamento de artigos pode levar vários minutos. Usa mecanismo unificado de keep-alive (alarme a cada 1 minuto + salvamento de estado a cada 2 segundos) de acordo com as regras MV3. |
| `contextMenus` | Adicionar opções "Salvar com ClipAIble" (PDF/EPUB/FB2/MD/Áudio) ao menu contextual de clique direito em páginas web. |
| `notifications` | Mostrar notificações de desktop ao usar a função "Salvar" do menu contextual. Notifica você se houver um erro (por exemplo, chave API ausente). |
| `unlimitedStorage` | Armazenar o cache de seletores e dados de impressão temporários localmente. Isso permite extrações repetidas mais rápidas sem chamar a IA novamente (modo offline). |

### Permissões de host

| Permissão | Por quê |
|-----------|---------|
| `<all_urls>` | Extrair conteúdo de qualquer site que você visite. A extensão precisa: 1) Ler o HTML da página para encontrar o conteúdo do artigo, 2) Baixar imagens incorporadas em artigos, 3) Fazer chamadas API para provedores IA/TTS (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher). A extensão acessa apenas páginas que você salva explicitamente — ela não navega na web por conta própria. |

**Nota de segurança:** Todas as chaves API são criptografadas usando AES-256-GCM e armazenadas apenas localmente. As chaves nunca são exportadas ou transmitidas para nenhum servidor, exceto os provedores IA que você configura.

Veja [PERMISSIONS.md](PERMISSIONS.md) para detalhes.

---

## 🤝 Contribuindo

1. Faça fork do repositório
2. Crie ramo de recurso: `git checkout -b feature/cool-thing`
3. Commit: `git commit -m 'Add cool thing'`
4. Push: `git push origin feature/cool-thing`
5. Abra Pull Request

---

## 📜 Licença

MIT License — veja [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Salve. Leia. Ouça. Em qualquer lugar.
</p>

