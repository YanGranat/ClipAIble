# ClipAIble

Salve artigos da web em PDF, EPUB, FB2, Markdown ou áudio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Uso

1. Abra um artigo, um vídeo compatível ou um PDF.
2. Clique em ClipAIble na barra de ferramentas do Chrome.
3. Selecione o formato de saída e o modo de extração.
4. Clique em **Salvar**.

O menu de contexto da página também oferece ações para salvar. Para PDFs locais, permita o acesso a arquivos nas configurações da extensão no Chrome ou selecione o arquivo correspondente quando solicitado. Mantenha o painel da extensão aberto se for necessário selecionar um arquivo.

Para artigos da web, **Automático** usa heurísticas locais e seletores disponíveis no cache. **AI Selector** pede a um serviço de IA os seletores CSS e depois extrai o conteúdo correspondente. **AI Extract** pede ao serviço que estruture o conteúdo. Para PDFs, Automático extrai a camada de texto; os modos de IA processam as páginas renderizadas. **OCR (Tesseract)** reconhece localmente o texto de todas as páginas do PDF.

Para exportar vídeos do YouTube e do Vimeo, é preciso ter legendas e uma chave de API do serviço de IA selecionado para artigos. Isso também vale no modo **Automático**.

As configurações incluem tradução de texto e imagens, estilos de documento e um sumário. No painel, você também pode gerar um resumo ou afirmações principais. Para criar áudio, use um serviço de síntese de voz configurado ou baixe o modelo do Piper ou do Supertonic para gerar áudio no computador.

Adicione as chaves de API necessárias para as funções de IA e de síntese de voz escolhidas. O backup JSON inclui as configurações e os prompts personalizados. Você também pode incluir estatísticas, histórico e cache de seletores. As chaves de API ficam fora do backup. Na importação, você pode incluir entradas ausentes no histórico e regras de novos sites ou substituir as seções selecionadas. Consulte [Backup das configurações](../README.md#export-and-restore-settings).

## Desenvolvimento

As instruções de instalação, compilação e testes estão no [guia principal em inglês](../README.md#development).

[Permissões](../PERMISSIONS.md) · [Privacidade](../PRIVACY.md) · [Visão técnica](technical-overview.md)
