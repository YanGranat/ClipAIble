// @ts-check
import { decodeEntities, escapeText, tokenizeHtml } from '../utils/html/tokenizer.js';

/** Decode URI fragment bytes once, preserving literal percent characters. */
export function decodeFragmentIdentifier(value) {
  const bytes = new TextEncoder().encode(String(value));
  const decoded = [];
  const hex = byte => (byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 70) || (byte >= 97 && byte <= 102);
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 37 && hex(bytes[index + 1]) && hex(bytes[index + 2])) {
      decoded.push(parseInt(String.fromCharCode(bytes[index + 1], bytes[index + 2]), 16)); index += 2;
    } else decoded.push(bytes[index]);
  }
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(decoded));
}

/** Encode a logical identifier as a URI component, including Markdown delimiters. */
export function encodeFragmentIdentifier(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

/** Resolve document references against actual exported logical identifiers. */
export function resolveSourceFragment(href, sourceUrl, targetIds, aliases = new Map()) {
  if (!sourceUrl || !String(href).includes('#')) return href;
  try {
    const source = new URL(sourceUrl), target = new URL(href, source);
    if (!['http:', 'https:', 'file:'].includes(target.protocol)) return href;
    const absolute = target.href;
    const fragment = decodeFragmentIdentifier(target.hash.slice(1));
    source.hash = ''; target.hash = '';
    const localId = aliases.get(fragment) ?? (targetIds.has(fragment) ? fragment : null);
    return source.href === target.href && localId !== null ? '#' + encodeFragmentIdentifier(localId) : absolute;
  } catch (_) { return href; }
}

const LITERAL_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea', 'template']);

/** Read identifiers only from already rendered HTML, excluding literal code. */
export function collectRenderedFragmentIds(html, inlineFragmentTargets = true) {
  const ids = new Set(), literal = [];
  for (const token of tokenizeHtml(html)) {
    if (token.type !== 'tag') continue;
    if (LITERAL_TAGS.has(token.name)) {
      if (token.closing) { if (literal.at(-1) === token.name) literal.pop(); }
      else literal.push(token.name);
      continue;
    }
    if (literal.length || token.closing) continue;
    const seen = new Set();
    for (const attr of token.attrs) {
      if (seen.has(attr.name)) continue;
      seen.add(attr.name);
      if ((inlineFragmentTargets || token.name === 'li') && (attr.name === 'id' || (token.name === 'a' && attr.name === 'name'))) {
        const id = decodeEntities(attr.value); if (id) ids.add(id);
      }
    }
  }
  return ids;
}

/** Rewrite only href attributes, preserving surrounding markup and literal code. */
export function rewriteHtmlFragmentLinks(html, sourceUrl, targetIds, aliases) {
  const literal = [];
  return tokenizeHtml(html).map(token => {
    if (token.type !== 'tag') return token.raw;
    if (LITERAL_TAGS.has(token.name)) {
      if (token.closing) { if (literal.at(-1) === token.name) literal.pop(); }
      else literal.push(token.name);
      return token.raw;
    }
    if (literal.length || token.closing || token.name !== 'a') return token.raw;
    const attr = token.attrs.find(attr => attr.name === 'href');
    if (!attr) return token.raw;
    const href = decodeEntities(attr.value), resolved = resolveSourceFragment(href, sourceUrl, targetIds, aliases);
    return resolved === href ? token.raw : token.raw.slice(0, attr.start) + ` href="${escapeText(resolved)}"` + token.raw.slice(attr.end);
  }).join('');
}

/** Rewrite Markdown destinations without round-tripping prose or code through HTML. */
export function rewriteMarkdownFragmentLinks(markdown, sourceUrl, targetIds, aliases) {
  const text = String(markdown ?? '');
  const edits = [];
  let fence = null;
  for (let index = 0; index < text.length;) {
    if (index === 0 || text[index - 1] === '\n') {
      const end = text.indexOf('\n', index), lineEnd = end < 0 ? text.length : end + 1;
      const line = text.slice(index, lineEnd);
      const marker = line.match(/^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+\.)[ \t]+)?(`{3,}|~{3,})([^\r\n]*)/);
      if (fence) {
        if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        index = lineEnd; continue;
      }
      if (marker) { fence = { character: marker[1][0], length: marker[1].length }; index = lineEnd; continue; }
    }
    if (fence) { index++; continue; }
    if (text[index] === '\\') { index += 2; continue; }
    if (text[index] === '`') {
      const marker = text.slice(index).match(/^`+/)[0];
      let close = text.indexOf(marker, index + marker.length);
      while (close >= 0 && (text[close - 1] === '`' || text[close + marker.length] === '`')) close = text.indexOf(marker, close + marker.length);
      index = close < 0 ? index + marker.length : close + marker.length; continue;
    }
    if (text[index] !== '[') { index++; continue; }
    if (index > 0 && text[index - 1] === '!') { index++; continue; }
    let labelEnd = index + 1, depth = 1;
    for (; labelEnd < text.length && depth; labelEnd++) {
      if (text[labelEnd] === '\\') { labelEnd++; continue; }
      if (text[labelEnd] === '[') depth++;
      if (text[labelEnd] === ']') depth--;
    }
    if (depth || text[labelEnd] !== '(') { index++; continue; }
    const open = labelEnd;
    let close = open + 1, parentheses = 1;
    for (; close < text.length && parentheses; close++) {
      if (text[close] === '\\') { close++; continue; }
      if (text[close] === '(') parentheses++;
      if (text[close] === ')') parentheses--;
    }
    if (parentheses) { index++; continue; }
    let start = open + 1;
    while (/\s/.test(text[start] || '') && start < close - 1) start++;
    let end = start, angled = text[start] === '<';
    if (angled) {
      start++; end = start;
      while (end < close - 1 && text[end] !== '>') { if (text[end] === '\\') end++; end++; }
      if (text[end] !== '>') { index = close; continue; }
    } else {
      let nested = 0;
      for (; end < close - 1; end++) {
        if (text[end] === '\\') { end++; continue; }
        if (text[end] === '(') nested++;
        if (text[end] === ')') nested--;
        if (/\s/.test(text[end]) && nested === 0) break;
      }
    }
    const raw = text.slice(start, end);
    const href = decodeEntities(raw.replace(/\\([\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e])/g, '$1'));
    const resolved = resolveSourceFragment(href, sourceUrl, targetIds, aliases);
    if (resolved !== href) edits.push({ start, end, value: resolved });
    index = close;
  }
  let result = text;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}
