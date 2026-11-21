import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

let serialized;const documents=[];
beforeAll(()=>{const builder=new URL('../../scripts/extraction/extractor/builder.js',import.meta.url).href;serialized=execFileSync(process.execPath,['--input-type=module','-e',`import{generateExtractAutomaticallyInlined}from${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`],{encoding:'utf8'});});
afterEach(()=>{documents.splice(0).forEach(d=>d.window.close());vi.restoreAllMocks();});
const images='<img id="base" src="/base.jpg" width="640" height="400"><img id="overlay" src="/overlay.png" width="640" height="400">';
async function extract({hero=images,selector='#cover',inside=false,metadata='<meta property="og:image" content="/complete-cover.jpg">',exclude=[]}={}){
 const figure=`<figure id="cover">${hero}<figcaption>Artwork credit.</figcaption></figure>`;
 const dom=new JSDOM(`<!doctype html>${metadata}${inside?'':figure}<article><h1>Field report</h1>${inside?figure:''}<p>The field report contains the complete observation record and its interpretation.</p></article>`,{url:'https://example.test/report',runScripts:'outside-only'});
 documents.push(dom);vi.spyOn(dom.window.console,'log').mockImplementation(()=>{});
 const before=dom.window.document.body.innerHTML;
 dom.window.eval(serialized.replace('export async function','async function')+'\nwindow.extract=extractAutomaticallyInlined;');
 const result=await dom.window.extract(dom.window.location.href,false,{content:'article',title:'h1',heroImage:selector,exclude});
 expect(dom.window.document.body.innerHTML).toBe(before);
 return result;
}
const featured=result=>result.content.find(item=>item.type==='image'&&item.isFeatured);

describe('Declared source hero media', () => {
 it('keeps all source gallery images and the owned credit without unrelated OG substitution',async()=>{
  const result=await extract();
  expect(result.error).toBeUndefined();
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg','https://example.test/overlay.png']);
  expect(result.content.filter(item=>item.caption==='Artwork credit.')).toHaveLength(1);
  expect(result.content.some(item=>item.type==='paragraph'&&item.text.includes('complete observation record'))).toBe(true);
 });
 it('resolves an explicit IMG to its exact source FIGURE owner',async()=>{
  const result=await extract({selector:'#base'});
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg','https://example.test/overlay.png']);
  expect(result.content.filter(item=>item.caption==='Artwork credit.')).toHaveLength(1);
 });
 it('preserves a single-image container',async()=>expect(featured(await extract({hero:'<img id="base" src="/base.jpg" width="640" height="400">'})).src).toBe('https://example.test/base.jpg'));
 it('preserves ordinary galleries inside the selected article body',async()=>{
  const result=await extract({inside:true});
  expect(featured(result)).toBeUndefined();
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg','https://example.test/overlay.png']);
 });
 it('does not admit page-wide media through a selector that contains the body root',async()=>{
  const result=await extract({selector:'body'});
  expect(result.content.filter(item=>item.type==='image')).toEqual([]);
 });
 it('keeps physical source images when OG is absent and other metadata exists',async()=>{
  const result=await extract({metadata:'<meta name="twitter:image" content="/alternative.jpg">'});
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg','https://example.test/overlay.png']);
 });
 it('does not resurrect an excluded gallery component through metadata',async()=>{
  const result=await extract({exclude:['#overlay']});
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg']);
 });
 it('respects exclusion of the entire hero container',async()=>{
  const result=await extract({exclude:['#cover']});
  expect(result.content.filter(item=>item.type==='image')).toEqual([]);
 });
 it('keeps source gallery media inside a carousel container',async()=>{
  const result=await extract({hero:`<div aria-roledescription="carousel">${images}</div>`});
  expect(result.content.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/base.jpg','https://example.test/overlay.png']);
 });
});
