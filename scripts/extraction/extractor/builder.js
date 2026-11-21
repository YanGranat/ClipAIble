// @ts-check
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** Build a self-contained page function from the complete runtime import graph. */
export async function generateExtractAutomaticallyInlined() {
  const result = await build({
    absWorkingDir: fileURLToPath(new URL('../../../', import.meta.url)),
    stdin: { contents: "export { runExtraction } from './index.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'extractor-entry.js' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'clipaibleArticleExtractor',
    target: 'chrome116',
    charset: 'utf8',
    legalComments: 'eof',
    sourcemap: false,
    metafile: true
  });
  if (Object.values(result.metafile.outputs).some(output => output.imports.some(dependency => dependency.external))) {
    throw new Error('Extraction bundle contains an external runtime dependency.');
  }
  return `// @ts-check
// Generated from the article extraction runtime modules.
export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false, selectors = null) {
${result.outputFiles[0].text}
return clipaibleArticleExtractor.runExtraction(baseUrl, enableDebugInfo, selectors);
}
`;
}
