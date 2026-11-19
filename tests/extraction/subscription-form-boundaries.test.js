import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { isExcluded, isSubscriptionFormContent } from '../../scripts/extraction/extractor/filters.js';
import { sanitizeParagraphHtml } from '../../scripts/extraction/extractor/parse.js';
import { CONSTANTS, NAVIGATION_PATTERNS } from '../../scripts/extraction/extractor/constants.js';

const documents=[];
const constants={...CONSTANTS,NAV_PATTERNS_CONTAINS:NAVIGATION_PATTERNS.contains};
let serialized;
beforeAll(()=>{const builder=new URL('../../scripts/extraction/extractor/builder.js',import.meta.url).href;serialized=execFileSync(process.execPath,['--input-type=module','-e',`import{generateExtractAutomaticallyInlined}from${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`],{encoding:'utf8'});});
function page(html){const dom=new JSDOM(`<!doctype html><article><h1>Field report</h1>${html}</article>`,{url:'https://example.test/report',runScripts:'outside-only'});documents.push(dom);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('Node',dom.window.Node);return dom;}
afterEach(()=>{documents.splice(0).forEach(dom=>dom.window.close());vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Form-owned subscription controls',()=>{
 it.each(['type="email"','type="text" name="email"','type="text" autocomplete="section-contact email"'])('excludes nested control labels only with semantic email and subscription action: %s',attribute=>{
  const dom=page(`<form><input ${attribute}><label><input type="checkbox"><div>Receive daily updates.</div></label><button><span>Sign up</span><span aria-hidden="true">Sign up</span></button></form>`);
  const label=dom.window.document.querySelector('label div');
  expect(isSubscriptionFormContent(label)).toBe(true);
  expect(isExcluded(dom.window,label,constants)).toBe(true);
 });

 it.each([
  '<form><input type="text" name="participant"><div>Participant observations.</div><button>Subscribe</button></form>',
  '<form><input type="email"><div>Contact the research editor.</div><button>Send feedback</button></form>',
  '<form><input type="email"><div>The questionnaire asks whether you would sign up for training.</div><button>Send response</button></form>',
  '<div><input type="email"><div>Authored participation guidance remains part of the report.</div><button>Sign up</button></div>'
 ])('preserves non-subscription forms and non-form reading content: %s',html=>{
  const dom=page(html),node=dom.window.document.querySelector('form div,article>div>div');
  expect(isSubscriptionFormContent(node)).toBe(false);
 });

 it('uses a static accessible form label without reading a loaded field value',()=>{
  const dom=page('<h2 id="signup">Subscribe for field updates</h2><form aria-labelledby="signup"><input name="email"><div>Update frequency</div><button>Continue</button></form><form id="contact"><input name="email"><div>Report findings.</div><button>Send</button></form>');
  expect(isSubscriptionFormContent(dom.window.document.querySelector('form div'))).toBe(true);
  const contact=dom.window.document.getElementById('contact');contact.querySelector('input').value='Subscribe for updates';
  expect(isSubscriptionFormContent(contact.querySelector('div'))).toBe(false);
 });

 it('removes nested controls from a rich container without consuming surrounding authored prose',()=>{
  const dom=page('<div id="reading">Before the observation.<form><input name="email"><label>Receive daily updates.</label><button>Subscribe</button></form>After the observation.</div>');
  const source=dom.window.document.getElementById('reading'),before=source.outerHTML;
  expect(sanitizeParagraphHtml(source)).toBe('Before the observation.After the observation.');
  expect(source.outerHTML).toBe(before);
 });

 it('executes actual serialized extraction while conserving the complete article and excluding all control labels',async()=>{
  const dom=page('<p>The first observation establishes the baseline for the field measurements.</p><div><form><input name="email"><div><label><input type="checkbox"><div>Receive daily updates.</div></label><label><input type="checkbox"><div>Receive weekly updates.</div></label></div><button>Sign up</button></form></div><p>The final observation completes the field measurement record.</p>');
  const before=dom.window.document.body.innerHTML;
  vi.spyOn(dom.window.console,'log').mockImplementation(()=>{});
  dom.window.eval(serialized.replace('export async function','async function')+'\nwindow.extract=extractAutomaticallyInlined;');
  const result=await dom.window.extract(dom.window.location.href,false,{content:'article',title:'h1'});
  const content=JSON.stringify(result.content);
  expect(content).toContain('first observation');expect(content).toContain('final observation');
  expect(content).not.toContain('Receive daily');expect(content).not.toContain('Receive weekly');expect(content).not.toContain('Sign up');
  expect(dom.window.document.body.innerHTML).toBe(before);
 });
});
