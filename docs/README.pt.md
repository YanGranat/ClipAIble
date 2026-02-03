# ClipAIble

Extrator de artigos com IA. Funciona em qualquer site.

**Disponível na [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

## O que faz

ClipAIble extrai conteúdo de artigos de páginas web e converte para diferentes formatos:
- Documentos PDF
- Arquivos EPUB
- Arquivos FB2
- Texto Markdown
- Arquivos de áudio

**Funcionalidades especiais:**
- **Suporte YouTube/Vimeo**: Extrai legendas de vídeo e cria artigos a partir delas
- **Processamento PDF**: Funciona com PDFs online e arquivos PDF locais
- **Tradução de conteúdo**: Traduz artigos para 11 idiomas
- **Tradução de imagens**: Traduz texto em imagens usando IA
- **Geração TLDR**: Cria resumos breves dentro dos documentos
- **Painel summary**: Mostra resumos de artigos no popup após o processamento

## Como usar

1. Clique no ícone do ClipAIble na barra de ferramentas do navegador
2. Abra qualquer artigo, vídeo do YouTube ou PDF
3. Selecione o formato desejado (PDF, EPUB, FB2, Markdown ou Audio)
4. Clique em salvar

**Métodos alternativos de salvamento:**
- Clique com o botão direito em qualquer página web e use as opções do menu de contexto

**Para arquivos PDF locais**: Nos modos IA, você será solicitado a selecionar o arquivo PDF devido às restrições do navegador.

## Configurações

### Modos de extração

- **AI Selector**: Modo recomendado para a maioria dos sites. Usa IA para encontrar conteúdo do artigo.
- **Automatic**: Modo básico que funciona sem chaves API.
- **AI Extractor**: Modo alternativo com IA (não recomendado para uso regular).

### Funcionalidades de performance

- **Cache de seletores**: Acelera o processamento de sites visitados anteriormente reutilizando seletores aprendidos pela IA

### Formatos de saída

- **PDF**: Cria documentos formatados com 4 estilos predefinidos (Escuro, Claro, Sépia, Alto contraste) e fontes/cores personalizáveis
- **EPUB**: Cria livros eletrônicos estruturados para leitores como Kindle
- **FB2**: Cria livros eletrônicos estruturados para PocketBook e outros leitores
- **Markdown**: Preserva a estrutura do artigo com títulos e listas
- **Audio**: Converte texto em voz usando 6 serviços TTS diferentes

### Tradução

Conteúdo pode ser traduzido para: inglês, russo, ucraniano, alemão, francês, espanhol, italiano, português, chinês, japonês, coreano.

### Áudio

Áudio pode ser gerado com diferentes provedores TTS:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (apenas inglês e ucraniano)
- Piper (offline, não são necessárias chaves API)

## Chaves API (opcional)

Para funções de IA, você pode adicionar chaves API desses provedores:

### OpenAI
Obtenha a chave em [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Obtenha a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Para TTS, ative [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) no Google Cloud Console

### Anthropic Claude
Obtenha a chave em [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Obtenha a chave em [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Obtenha a chave em [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Obtenha a chave em [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Obtenha a chave em [space.respeecher.com](https://space.respeecher.com/)

## Funcionalidades adicionais

- **Estatísticas**: Acompanhe seus artigos salvos com histórico e contadores mensais
- **Importação/exportação de configurações**: Backup e restauração de suas preferências
- **Interface em 11 idiomas**: Alterne entre idiomas sem reiniciar
- **Armazenamento seguro**: As chaves API são criptografadas antes de salvar

## Permissões

A extensão precisa dessas permissões para funcionar:
- Ler páginas web que você visita
- Salvar arquivos no seu computador
- Fazer chamadas API para provedores de IA (apenas quando você usa essas funções)

**Segurança**: Todas as chaves API são criptografadas antes de serem armazenadas no navegador.

---

ClipAIble extrai e converte artigos web.