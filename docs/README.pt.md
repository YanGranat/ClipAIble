# ✂️ ClipAIble

> **Extrator de artigos com IA** — Salve qualquer artigo da web como PDF, EPUB, FB2, Markdown ou Áudio. Tradução para 11 idiomas. Funciona em qualquer site.

![Versão](https://img.shields.io/badge/versão-2.7.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extensão-green)
![Licença](https://img.shields.io/badge/licença-MIT-brightgreen)

---

## ✨ O que é ClipAIble?

ClipAIble usa inteligência artificial para extrair inteligentemente o conteúdo de artigos de qualquer página web — remove anúncios, navegação, popups e elementos desnecessários. Depois exporta para seu formato preferido:

- 📄 **PDF** — Estilo bonito e personalizável
- 📚 **EPUB** — Compatível com Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatível com PocketBook, FBReader
- 📝 **Markdown** — Texto simples para notas
- 🎧 **Áudio (MP3)** — Ouça com narração de IA

Todos os formatos suportam **tradução para 11 idiomas** — até mesmo tradução de texto em imagens!

---

## 🚀 Recursos

### 🤖 Extração com IA
- **Dois modos**: AI Selector (rápido, reutilizável) e AI Extract (abrangente)
- **Vários provedores**: OpenAI GPT, Google Gemini, Anthropic Claude
- **Detecção inteligente**: Encontra o conteúdo principal do artigo, remove elementos desnecessários automaticamente
- **Preserva estrutura**: Cabeçalhos, imagens, blocos de código, tabelas, notas de rodapé

### 🎧 Exportação de áudio
- **2 provedores TTS**: OpenAI TTS e ElevenLabs
- **20+ vozes**: 11 vozes OpenAI + 9 vozes ElevenLabs
- **Regulação de velocidade**: 0.5x a 2.0x
- **Pronúncia multilíngue**: Pronúncia correta para cada idioma
- **Limpeza inteligente de texto**: IA remove URLs, código e conteúdo não vocal

### 🌍 Tradução
- **11 idiomas**: EN, RU, UK, DE, FR, ES, IT, PT, ZH, JA, KO
- **Detecção inteligente**: Ignora a tradução se o artigo já está no idioma de destino
- **Tradução de imagens**: Traduz texto em imagens (via Gemini)
- **Metadados localizados**: Datas e rótulos se adaptam ao idioma

### 🎨 Personalização PDF
- **4 predefinições**: Escuro, Claro, Sépia, Alto contraste
- **Cores personalizáveis**: Fundo, texto, cabeçalhos, links
- **11 fontes** para escolher
- **Modos de página**: Página única contínua ou formato multi-página A4

### ⚡ Recursos inteligentes
- **Modo offline**: Cache de seletores — nenhuma IA necessária para sites repetidos
- **Estatísticas**: Rastreie quantidade de salvamentos, visualize histórico
- **Índice**: Gerado automaticamente a partir de cabeçalhos
- **Resumo**: Resumo de 2-3 parágrafos escrito por IA
- **Menu contextual**: Clique direito → "Salvar artigo como PDF"
- **Cancelar a qualquer momento**: Pare o processamento com um clique

### 🔒 Segurança
- **Chaves API criptografadas** com AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs)
- **Chaves nunca exportadas** — excluídas do backup de configurações
- **Todos os dados são armazenados localmente** — nada é enviado a terceiros

---

## 📦 Instalação

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

> **Dica:** Gemini também habilita a função de tradução de texto em imagens.

### Anthropic Claude

1. Vá para [console.anthropic.com](https://console.anthropic.com/)
2. Registre-se ou faça login
3. Navegue para **API Keys**
4. Clique em **"Create Key"**
5. Copie a chave (começa com `sk-ant-...`)
6. Adicione créditos em **Plans & Billing**

### Qual escolher?

| Provedor | Melhor para | Áudio | Tradução de imagens |
|----------|-------------|-------|---------------------|
| **OpenAI** | Uso geral, exportação de áudio | ✅ | ❌ |
| **Gemini** | Extração rápida, tradução de imagens | ❌ | ✅ |
| **Claude** | Artigos longos, páginas complexas | ❌ | ❌ |

**Recomendação:** Comece com OpenAI para obter todos os recursos (extração + áudio).

---

## 🎯 Início rápido

1. Clique no ícone **ClipAIble** na barra de ferramentas
2. Digite sua chave API → **Salvar chaves**
3. Navegue para qualquer artigo
4. Clique em **Salvar como PDF** (ou escolha outro formato)
5. Pronto! O arquivo é baixado automaticamente

**Dica:** Clique direito em qualquer lugar → **"Salvar artigo como PDF"**

---

## ⚙️ Configurações

### Modos de extração

| Modo | Velocidade | Melhor para |
|------|------------|-------------|
| **AI Selector** | ⚡ Rápido | A maioria dos sites, blogs, notícias |
| **AI Extract** | 🐢 Abrangente | Páginas complexas, Notion, SPAs |

### Modelos de IA

| Provedor | Modelo | Notas |
|----------|--------|-------|
| OpenAI | GPT-5.1 | Equilibrado |
| OpenAI | GPT-5.1 (high) | Melhor qualidade |
| Anthropic | Claude Sonnet 4.5 | Excelente para artigos longos |
| Google | Gemini 3 Pro | Rápido |

### Vozes de áudio

| Voz | Estilo |
|-----|-------|
| nova | Feminina, calorosa |
| alloy | Neutra |
| echo | Masculina |
| fable | Expressiva |
| onyx | Masculina, profunda |
| shimmer | Feminina, clara |
| coral | Feminina, amigável |
| sage | Neutra, calma |
| ash | Masculina, autoritária |
| ballad | Dramática |
| verse | Rítmica |

### Predefinições de estilo (PDF)

| Predefinição | Fundo | Texto |
|--------------|-------|-------|
| Escuro | `#303030` | `#b9b9b9` |
| Claro | `#f8f9fa` | `#343a40` |
| Sépia | `#faf4e8` | `#5d4e37` |
| Alto contraste | `#000000` | `#ffffff` |

---

## 📊 Estatísticas e cache

Clique em **📊 Estatísticas** para ver:
- Total de salvamentos, contagem deste mês
- Divisão por formato
- Histórico recente com links
- Domínios em cache para modo offline

### Modo offline

ClipAIble armazena em cache os seletores gerados por IA por domínio:
- **Segunda visita = instantânea** — sem chamada de API
- **Invalidação automática** — limpa se a extração falhar
- **Controle manual** — excluir domínios individuais

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

---

## 🏗️ Arquitetura

```
clipaible/
├── manifest.json       # Configuração da extensão
├── popup/              # Interface (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Extração de conteúdo
│   ├── translation/    # Tradução e detecção de idioma
│   ├── generation/     # PDF, EPUB, FB2, MD, Áudio
│   ├── cache/          # Cache de seletores
│   ├── stats/          # Estatísticas de uso
│   └── utils/          # Configuração, criptografia, utilitários
├── print/              # Renderização PDF
├── config/             # Estilos
└── lib/                # JSZip
```

---

## 🔐 Segurança e privacidade

- **Criptografia**: AES-256-GCM via Web Crypto API
- **Derivação de chave**: PBKDF2, 100.000 iterações
- **Sem rastreamento**: Sem análises, sem registro remoto
- **Apenas local**: Todos os dados permanecem no seu navegador

---

## 📋 Permissões

| Permissão | Por quê |
|-----------|---------|
| `activeTab` | Ler artigo da aba atual |
| `storage` | Salvar configurações localmente |
| `scripting` | Injetar script de extração |
| `downloads` | Salvar arquivos gerados |
| `debugger` | Gerar PDFs via API de impressão do Chrome |
| `alarms` | Manter worker em estado ativo durante tarefas longas |
| `contextMenus` | Menu contextual |

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

