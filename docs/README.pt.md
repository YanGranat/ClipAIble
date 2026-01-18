# ✂️ ClipAIble

> **Extrator de artigos com IA** — Salve qualquer artigo da web como PDF, EPUB, FB2, Markdown ou Áudio. Tradução para 11 idiomas. Funciona em qualquer site.

![Versão](https://img.shields.io/badge/versão-3.3.0-blue)
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
- 🎧 **Áudio** — Ouça com narração de IA

Todos os formatos suportam **tradução para 11 idiomas** — até mesmo tradução de texto em imagens!

---

## 🚀 Recursos

### 🤖 Extração com IA
- **Dois modos**: Automático (sem IA, rápido), AI Selector (rápido, reutilizável)
- **Modo automático**: Criar documentos sem IA — nenhuma chave API necessária, extração instantânea
- **Vários provedores**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **Extração de conteúdo PDF** (v3.3.0): Extrair conteúdo de arquivos PDF usando a biblioteca PDF.js
  - Funcionalidade experimental com sistema de classificação multi-nível complexo
  - Extrai texto, imagens, estrutura e metadados de arquivos PDF
  - Suporta arquivos PDF web e locais
  - Lida com layouts multi-coluna, tabelas, cabeçalhos, listas, fusão entre páginas
  - Nota: A funcionalidade é experimental e pode ter limitações com PDFs complexos (PDFs digitalizados, PDFs protegidos por senha)
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
- **Múltiplas vozes**: OpenAI, ElevenLabs, Google Gemini, Qwen, Respeecher
- **Regulação de velocidade**: 0.25x a 4.0x (apenas OpenAI/ElevenLabs; Google/Qwen/Respeecher usam velocidade fixa)
- **Suporte a formatos**: MP3 (OpenAI/ElevenLabs) ou WAV (Google/Qwen/Respeecher)
- **Pronúncia multilíngue**: Pronúncia correta para cada idioma
- **Suporte ao idioma ucraniano**: Vozes ucranianas dedicadas via Respeecher
- **Limpeza inteligente de texto**: IA remove URLs, código e conteúdo não vocal
- **Recursos específicos do provedor**:
  - **ElevenLabs**: Seleção de modelo, seleção de formato, configurações avançadas de voz
  - **Google Gemini 2.5 TTS**: Múltiplas vozes disponíveis
  - **Qwen**: Inclui voz russa (Alek)
  - **Respeecher**: Parâmetros de amostragem avançados

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
- **Extração de conteúdo PDF** (v3.3.0): Extrair conteúdo de arquivos PDF e convertê-los em artigos
  - Usa a biblioteca PDF.js para análise em um documento offscreen
  - Sistema de classificação multi-nível para extração precisa
  - Suporta arquivos PDF web e locais
  - Integração completa do pipeline: tradução, índice, resumo, todos os formatos de exportação
  - Nota: Funcionalidade experimental, pode ter limitações com PDFs complexos
- **Suporte a vídeo**: Extrair legendas de vídeos YouTube/Vimeo e convertê-las em artigos (v3.0.0)
  - Extração direta de legendas (nenhuma chave API do YouTube/Vimeo necessária)
  - Processamento IA: remove timestamps, mescla parágrafos, corrige erros
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
- **Chaves API criptografadas** (OpenAI, Claude, Gemini, Grok, DeepSeek, OpenRouter, ElevenLabs, Qwen, Respeecher)
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
- **Requisito keep-alive**: Chrome MV3 requer um intervalo keep-alive de pelo menos 1 minuto. Tarefas de processamento longas podem levar vários minutos. A extensão usa mecanismo unificado de keep-alive (alarme a cada 1 minuto) para evitar que o service worker pare.
- **CORS para imagens**: Algumas imagens podem não carregar se o site bloquear solicitações cross-origin. A extensão ignorará essas imagens.
- **Cancelamento não instantâneo**: O cancelamento pode levar alguns segundos para parar completamente todos os processos em segundo plano.
- **Recuperação do Service Worker**: Operações retomam automaticamente após reinicialização do service worker, se o estado for recente (< 1 minuto). O recarregamento da extensão sempre redefine o estado.
- **Limitações de extração PDF** (v3.3.0): 
  - PDFs digitalizados (sem camada de texto) não são suportados — OCR ainda não está disponível
  - PDFs protegidos por senha devem ser desbloqueados antes da extração
  - PDFs muito grandes (>100MB) podem não funcionar devido a limitações de memória
  - Layouts complexos (multi-coluna, tabelas) são extraídos mas podem exigir verificação manual

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
2. **Instale as dependências e compile:**
   ```bash
   npm install
   npm run build
   ```
3. Abra Chrome → `chrome://extensions/`
4. Ative o **Modo do desenvolvedor**
5. Clique em **Carregar sem compactação** → selecione a pasta

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

### DeepSeek

1. Vá para [platform.deepseek.com](https://platform.deepseek.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys** ou vá para [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Clique em **"Create API key"**
5. Copie a chave (começa com `sk-...`)

> **Nota:** DeepSeek fornece modelos DeepSeek-V3.2: `deepseek-chat` (modo non-thinking) e `deepseek-reasoner` (modo thinking). A API é compatível com o formato OpenAI.

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
| **DeepSeek** | Raciocínio avançado, econômico | ❌ | ❌ |
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
| **Automático** | ⚡⚡ Instantâneo | Artigos simples, nenhuma chave API necessária |
| **AI Selector** | ⚡ Rápido | A maioria dos sites, blogs, notícias |

### Predefinições de estilo (PDF)

| Predefinição | Descrição |
|--------------|-----------|
| Escuro | Fundo escuro, texto claro |
| Claro | Fundo claro, texto escuro |
| Sépia | Tema sépia suave |
| Alto contraste | Máximo contraste para legibilidade |

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

---

## 🔐 Segurança e privacidade

- **Criptografia**: As chaves API são criptografadas com criptografia padrão
- **Sem rastreamento**: Sem análises, sem registro remoto
- **Apenas local**: Todos os dados permanecem no seu navegador

---

## 📋 Permissões

ClipAIble requer as seguintes permissões para funcionar:

| Permissão | Por quê |
|-----------|---------|
| `activeTab` | Ler a página atual para extrair conteúdo |
| `storage` | Salvar configurações e estatísticas localmente |
| `scripting` | Injetar scripts de extração de conteúdo |
| `downloads` | Salvar arquivos gerados |
| `debugger` | Gerar PDFs de alta qualidade |
| `alarms` | Manter o service worker ativo durante operações longas |
| `contextMenus` | Adicionar opções ao menu contextual |
| `notifications` | Mostrar notificações de desktop |
| `unlimitedStorage` | Armazenar cache de seletores |
| `webNavigation` | Obter URL original de PDFs do visualizador Chrome |
| `pageCapture` | Reservado para recursos futuros de captura PDF |
| `offscreen` | Criar documentos offscreen para extração PDF e TTS offline |

### Permissões de host

| Permissão | Por quê |
|-----------|---------|
| `<all_urls>` | Extrair conteúdo de qualquer site e fazer chamadas API para provedores IA/TTS |

**Nota de segurança:** Todas as chaves API são criptografadas e armazenadas apenas localmente. As chaves nunca são exportadas ou transmitidas para nenhum servidor, exceto os provedores IA que você configura.

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

