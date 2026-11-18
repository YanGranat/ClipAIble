# ClipAIble

Salve artigos da web em PDF, EPUB, FB2, Markdown ou áudio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Uso

1. Abra um artigo, um vídeo compatível ou um PDF.
2. Clique em ClipAIble na barra de ferramentas do Chrome.
3. Selecione o formato de saída e o modo de extração.
4. Clique em **Salvar**.

O menu de contexto da página também oferece ações para salvar. Para PDFs locais, permita o acesso a arquivos nas configurações da extensão no Chrome ou selecione o arquivo correspondente quando solicitado. Mantenha o painel da extensão aberto se for necessário selecionar um arquivo.

Para artigos da web, **Automático** usa heurísticas locais e seletores disponíveis no cache. **AI Selector** pede a um serviço de IA os seletores CSS e depois extrai o conteúdo correspondente. **AI Extract** pede ao serviço que estruture o conteúdo. Para PDFs, Automático extrai a camada de texto; os modos de IA processam as páginas renderizadas.

As configurações incluem tradução de texto e imagens, estilos de documento e um sumário. O painel também permite gerar um resumo ou afirmações principais. O áudio usa um serviço TTS configurado ou a síntese local do Piper após o download de um modelo de voz.

Adicione as chaves de API necessárias para as funções de IA e TTS escolhidas. A exportação das configurações exclui as chaves de API e pode incluir estatísticas e o cache de seletores.

## Desenvolvimento

As instruções de instalação, compilação e testes estão no [guia principal em inglês](../README.md#development).

[Permissões](../PERMISSIONS.md) · [Privacidade](../PRIVACY.md) · [Visão técnica](technical-overview.md)
