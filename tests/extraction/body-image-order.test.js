import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

let code;const documents=[];
beforeAll(()=>{const builder=new URL('../../scripts/extraction/extractor/builder.js',import.meta.url).href;code=execFileSync(process.execPath,['--input-type=module','-e',`import{generateExtractAutomaticallyInlined}from${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`],{encoding:'utf8'});});
afterEach(()=>{documents.splice(0).forEach(dom=>dom.window.close());vi.restoreAllMocks();});
const intro='<p>The diagram below explains how the recorded measurements relate to the control group.</p>';
const tail='<p>The following observation completes the measurement sequence.</p>';
const image='<img id="diagram" src="/diagram-small.jpg" data-full-src="/diagram-large.jpg" srcset="/diagram-large.jpg 1280w" width="640" height="400">';
async function extract(body,{outside='',heroImage='#diagram',content='article',exclude=[]}={}){
 const dom=new JSDOM(`<!doctype html><meta property="og:image" content="/declared-cover.jpg">${outside}<article><h1>Measurement relationships</h1>${body}</article>`,{url:'https://example.test/report',runScripts:'outside-only'});
 documents.push(dom);vi.spyOn(dom.window.console,'log').mockImplementation(()=>{});
 const before=dom.window.document.body.innerHTML;
 dom.window.eval(code.replace('export async function','async function')+'\nwindow.extract=extractAutomaticallyInlined;');
 const result=await dom.window.extract(dom.window.location.href,false,{content,title:'h1',heroImage,exclude});
 expect(dom.window.document.body.innerHTML).toBe(before);
 return result.content;
}
describe('Selected body image ownership and original reading order',()=>{
 it('keeps introduction, chosen diagram resource and following prose in source order exactly once',async()=>{
  const result=await extract(intro+image+tail);
  expect(result.map(item=>item.type)).toEqual(['paragraph','image','paragraph']);
  expect(result[0].text).toContain('diagram below');
  expect(result[1]).toMatchObject({src:'https://example.test/diagram-large.jpg'});
  expect(result[1].isFeatured).toBeUndefined();
  expect(result[2].text).toContain('following observation');
  expect(result.filter(item=>item.type==='image')).toHaveLength(1);
 });
 it('keeps an image which is already first in the body before its following prose',async()=>{
  const result=await extract(image+tail);
  expect(result.map(item=>item.type)).toEqual(['image','paragraph']);
  expect(result[0].src).toBe('https://example.test/diagram-large.jpg');
  expect(result[0].isFeatured).toBeUndefined();
 });
 it('keeps external explicit hero behavior while retaining the body image position',async()=>{
  const result=await extract(intro+image+tail,{outside:'<figure><img id="cover" src="/cover.jpg" width="640" height="400"></figure>',heroImage:'#cover'});
  expect(result.map(item=>item.type)).toEqual(['image','paragraph','image','paragraph']);
  expect(result[0]).toMatchObject({src:'https://example.test/cover.jpg',isFeatured:true});
  expect(result[2].src).toBe('https://example.test/diagram-large.jpg');
 });
 it('keeps both gallery resources and source caption within their original reading interval',async()=>{
  const result=await extract(intro+`<figure id="gallery">${image}<img src="/other-diagram.jpg" width="640" height="400"><figcaption>Measurement diagrams.</figcaption></figure>`+tail,{heroImage:'#gallery'});
  expect(result.map(item=>item.type)).toEqual(['paragraph','image','image','paragraph']);
  expect(result.filter(item=>item.type==='image').map(item=>item.src)).toEqual(['https://example.test/diagram-large.jpg','https://example.test/other-diagram.jpg']);
  expect(result.filter(item=>item.isFeatured)).toHaveLength(0);
  expect(result[2].caption).toBe('Measurement diagrams.');
 });
 it('lets an image selected as its own reading root use the normal body parser',async()=>{
  const result=await extract(image,{content:'#diagram'});
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({type:'image',src:'https://example.test/diagram-large.jpg'});
  expect(result[0].isFeatured).toBeUndefined();
 });
 it('does not revive an excluded body image through its hero selector',async()=>{
  const result=await extract(intro+image+tail,{exclude:['#diagram']});
  expect(result.map(item=>item.type)).toEqual(['paragraph','paragraph']);
 });
});
