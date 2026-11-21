// @ts-check
import { mkdir, writeFile } from 'node:fs/promises';
import { generateExtractAutomaticallyInlined } from './scripts/extraction/extractor/builder.js';

const output = new URL('./dist/extraction-automatic-generated.js', import.meta.url);
const source = await generateExtractAutomaticallyInlined();
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(output, source, 'utf8');
console.log(`Built article extractor (${Buffer.byteLength(source)} bytes).`);
