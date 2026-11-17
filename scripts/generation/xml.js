// @ts-check
import { decodeHtmlEntities } from '../utils/html.js';

/** Replace code points forbidden by XML 1.0 while preserving valid Unicode. */
export function normalizeXmlCharacters(value) {
  let result = '';
  for (const character of String(value ?? '')) {
    const point = character.codePointAt(0);
    result += point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xD7FF) || (point >= 0xE000 && point <= 0xFFFD) ||
      (point >= 0x10000 && point <= 0x10FFFF) ? character : '\uFFFD';
  }
  return result;
}

export function escapeXml(value) {
  return normalizeXmlCharacters(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;');
}

/** Native PDF text contains glyph strings, not HTML or Markdown. */
export function isNativePdfContent(item) {
  return Number.isInteger(item?.pageNum) && item.pageNum > 0 && !item.html &&
    Array.isArray(item.lines) && item.lines.some(line => Array.isArray(line?.items) &&
      line.items.some(glyph => typeof glyph?.str === 'string'));
}

/** Protect literal angles before the shared HTML sanitizer processes markup. */
export function protectXmlLiteralText(value) {
  const source = normalizeXmlCharacters(value);
  const tags = /<\/?[a-z][a-z0-9]*\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  let output = '', cursor = 0;
  for (const match of source.matchAll(tags)) {
    output += source.slice(cursor, match.index).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    output += match[0].replace(/"[^"]*"|'[^']*'/g, attribute => attribute.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    cursor = match.index + match[0].length;
  }
  return output + source.slice(cursor).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Serialize sanitized inline HTML without requiring a browser DOM. */
export function serializeXmlInline(value, format) {
  const source = normalizeXmlCharacters(value);
  const allowed = new Set(['a','strong','b','em','i','u','s','del','ins','code','br','sub','sup','mark','small','span','abbr','cite','q','time','dfn','kbd','var','samp']);
  const fb2 = { a:'a',strong:'strong',b:'strong',em:'emphasis',i:'emphasis',s:'strikethrough',del:'strikethrough',code:'code',sup:'sup',sub:'sub' };
  const attributes = { a:['href','title','id','name'],span:['class','id','style'],code:['class'],abbr:['title'],time:['datetime'],q:['cite'],sup:['id'],sub:['id'] };
  const text = value => escapeXml(decodeHtmlEntities(value, true));
  const attribute = value => text(value).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;');
  const tags = /<\/?([a-z][a-z0-9]*)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  const stack = [];
  let output = '', cursor = 0;
  for (const match of source.matchAll(tags)) {
    output += text(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[1].toLowerCase(), closing = match[0].startsWith('</');
    if (!allowed.has(name)) { output += text(match[0]); continue; }
    if (name === 'br') { if (!closing) output += format === 'fb2' ? ' ' : '<br/>'; continue; }
    const mapped = format === 'fb2' ? fb2[name] : name;
    if (!mapped) continue;
    if (closing) {
      const index = stack.map(entry => entry.name).lastIndexOf(name);
      if (index >= 0) while (stack.length > index) output += `</${stack.pop().mapped}>`;
      continue;
    }
    const values = {};
    for (const attr of match[0].matchAll(/\s+([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) values[attr[1].toLowerCase()] = attr[2] ?? attr[3];
    let attrs = '';
    if (format === 'fb2') {
      if (name === 'a') {
        if (values.href) attrs += ` l:href="${attribute(values.href)}"`;
        if (values.id || values.name) attrs += ` id="${attribute(values.id || values.name)}"`;
      }
    } else {
      for (const key of attributes[name] || []) if (values[key] !== undefined) attrs += ` ${key}="${attribute(values[key])}"`;
    }
    if (/\/\s*>$/.test(match[0])) output += `<${mapped}${attrs}/>`;
    else { output += `<${mapped}${attrs}>`; stack.push({ name, mapped }); }
  }
  output += text(source.slice(cursor));
  while (stack.length) output += `</${stack.pop().mapped}>`;
  return output;
}
