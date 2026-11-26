// @ts-check
import { tokenizeHtml, decodeEntities } from '../utils/html/tokenizer.js';
import { stripHtml } from '../utils/html.js';

/** Split a list tree into ordered paragraph fragments without a browser DOM. */
export function fb2ListParagraphs(html) {
  const lists = [], items = [], formatting = [], paragraphs = [];
  let buffer = '';
  const flush = () => {
    const current = items.at(-1);
    if (current && (stripHtml(buffer).trim() || (current.first && current.id))) {
      paragraphs.push({ html: buffer + formatting.slice().reverse().map(token => `</${token.name}>`).join(''),
        prefix: current.first ? current.prefix : '', id: current.first ? current.id : '', depth: current.depth });
      current.first = false;
    }
    buffer = '';
  };
  const begin = () => { if (!buffer) buffer = formatting.map(token => token.raw).join(''); };
  for (const token of tokenizeHtml(html)) {
    if (token.type === 'text') { if (items.length) { begin(); buffer += token.raw; } continue; }
    if (token.type !== 'tag') continue;
    if (token.name === 'ul' || token.name === 'ol') {
      flush();
      if (token.closing) lists.pop();
      else {
        const start = Number(token.attrs.find(attr => attr.name === 'start')?.value.trim() || '1');
        lists.push({ ordered: token.name === 'ol', number: Number.isSafeInteger(start) ? start : 1 });
      }
    } else if (token.name === 'li') {
      flush();
      if (token.closing) items.pop();
      else {
        const list = lists.at(-1);
        items.push({ prefix: list?.ordered ? `${list.number++}. ` : '• ',
          depth: Math.max(0, lists.length - 1), first: true, id: decodeEntities(token.attrs.find(attr => attr.name === 'id')?.value || '') });
      }
    } else if (token.name === 'br') { begin(); buffer += ' '; }
    else if (token.closing) {
      const index = formatting.map(open => open.name).lastIndexOf(token.name);
      if (index >= 0) {
        const closing = formatting.splice(index).reverse().map(open => `</${open.name}>`).join('');
        if (buffer) buffer += closing;
      }
    } else { if (buffer) buffer += token.raw; formatting.push(token); }
  }
  flush();
  return paragraphs;
}
