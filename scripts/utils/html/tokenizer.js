// @ts-check

const ENTITIES = {
  amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"',
  apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', colon: ':', semi: ';', Tab: '\t', NewLine: '\n'
};

export function decodeEntities(value) {
  return String(value ?? '').replace(/&#(\d+);?|&#x([a-f\d]+);?|&([a-z][a-z\d]+);/gi, (entity, decimal, hex, named) => {
    if (named !== undefined) return ENTITIES[named] ?? entity;
    const point = decimal !== undefined ? Number(decimal) : parseInt(hex, 16);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : '\uFFFD';
  });
}

export function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function richText(value) {
  return String(value).replace(/&(?!(?:#[xX][a-f\d]+|#\d+|[a-z][a-z\d]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Quote-aware HTML tokens retain source ranges for attribute-only edits. */
export function tokenizeHtml(value) {
  const input = String(value ?? '');
  const tokens = [];
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf('<', cursor);
    if (start < 0) { tokens.push({ type: 'text', raw: input.slice(cursor) }); break; }
    if (start > cursor) tokens.push({ type: 'text', raw: input.slice(cursor, start) });
    if (input.startsWith('<!--', start)) {
      const end = input.indexOf('-->', start + 4);
      tokens.push({ type: 'comment', raw: input.slice(start, end < 0 ? input.length : end + 3) });
      cursor = end < 0 ? input.length : end + 3;
      continue;
    }
    const prefix = input.slice(start).match(/^<(\/?)([a-z][a-z\d:-]*)(?=[\s/>])/i);
    if (!prefix) { tokens.push({ type: 'text', raw: '<' }); cursor = start + 1; continue; }
    let end = start + prefix[0].length;
    let quote = '';
    for (; end < input.length; end++) {
      const char = input[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === input.length) { tokens.push({ type: 'text', raw: input.slice(start) }); break; }
    const raw = input.slice(start, end + 1);
    const attrs = [];
    const attrRegex = /\s+([^\s/=>"'<]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    attrRegex.lastIndex = prefix[0].length;
    let match;
    while ((match = attrRegex.exec(raw))) {
      attrs.push({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] ?? '', start: match.index, end: attrRegex.lastIndex });
    }
    tokens.push({ type: 'tag', raw, name: prefix[2].toLowerCase(), closing: !!prefix[1], attrs });
    cursor = end + 1;
  }
  return tokens;
}

export function stripAttributes(value, names) {
  const removed = new Set(names.map(name => String(name).toLowerCase()));
  return tokenizeHtml(value).map(token => {
    if (token.type !== 'tag' || token.closing) return token.raw;
    let raw = token.raw;
    for (const attr of token.attrs.slice().reverse()) {
      if (removed.has(attr.name)) raw = raw.slice(0, attr.start) + raw.slice(attr.end);
    }
    return raw;
  }).join('');
}

export function safeLink(value, sourceUrl = '', allowFileProtocol = false) {
  const href = decodeEntities(value).trim();
  if (!href) return null;
  const protocolProbe = href.replace(/[\u0000-\u0020\u007f]/g, '');
  if (/^[a-z][a-z\d+.-]*:/i.test(protocolProbe) && !/^(?:https?:|mailto:|tel:|file:)/i.test(protocolProbe)) return null;
  if (/^file:/i.test(protocolProbe) && !allowFileProtocol) return null;
  if (href.startsWith('#')) return href;
  try {
    const resolved = sourceUrl ? new URL(href, sourceUrl) : new URL(href);
    if (!['http:', 'https:', 'mailto:', 'tel:', ...(allowFileProtocol ? ['file:'] : [])].includes(resolved.protocol)) return null;
    if (sourceUrl && resolved.hash) {
      const source = new URL(sourceUrl);
      if (source.protocol === resolved.protocol && source.host === resolved.host && source.pathname === resolved.pathname && source.search === resolved.search) return resolved.hash;
    }
    return /^[a-z][a-z\d+.-]*:/i.test(href) ? href : resolved.href;
  } catch {
    return !/^[a-z][a-z\d+.-]*:/i.test(protocolProbe) && !href.startsWith('//') ? href : null;
  }
}

const INLINE = new Set('a strong b em i u s del ins code br sub sup mark small span abbr cite q time dfn kbd var samp'.split(' '));
const BLOCK = new Set([...INLINE, ...'h1 h2 h3 h4 h5 h6 p hr pre blockquote ul ol li table thead tbody tfoot tr th td'.split(' ')]);
const VOID = new Set(['br', 'hr']);
const BLOCK_BOUNDARIES = new Set('p div li tr h1 h2 h3 h4 h5 h6 blockquote ul ol pre table section article'.split(' '));
const DROP = new Set('script style iframe object embed form input button textarea select template'.split(' '));

function safeColor(value) {
  const color = decodeEntities(value).trim();
  if (!/^(?:#[a-f\d]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%+-]+\))$/i.test(color)) return '';
  return /^(?:black|#000|#000000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(color) ? 'inherit' : color;
}

export function renderRich(value, sourceUrl = '', options = {}, block = false) {
  const allowed = block ? BLOCK : INLINE;
  const stack = [];
  let dropped = '';
  let result = '';
  for (const token of tokenizeHtml(value)) {
    if (dropped) { if (token.type === 'tag' && token.closing && token.name === dropped) dropped = ''; continue; }
    if (token.type === 'comment') continue;
    if (token.type === 'text') { result += richText(token.raw); continue; }
    const tag = token.name;
    if (DROP.has(tag)) { if (!token.closing && !['input', 'embed'].includes(tag)) dropped = tag; continue; }
    if (!allowed.has(tag)) { if (BLOCK_BOUNDARIES.has(tag) && (token.closing || tag === 'br')) result += '<br>'; continue; }
    if (token.closing) {
      const position = stack.lastIndexOf(tag);
      if (position >= 0) while (stack.length > position) result += `</${stack.pop()}>`;
      continue;
    }
    const attrs = [];
    const seen = new Set();
    for (const attr of token.attrs) {
      if (seen.has(attr.name)) continue;
      seen.add(attr.name);
      const name = attr.name;
      let value = decodeEntities(attr.value);
      if (name === 'href' && tag === 'a') {
        const href = safeLink(attr.value, sourceUrl, options.allowFileProtocol);
        attrs.push(`href="${escapeText(href ?? '#')}"`);
        if (href && /^https?:/i.test(href)) attrs.push('target="_blank"', 'rel="noopener noreferrer"');
      } else if (['id', 'name'].includes(name) && ['a', 'span', 'sub', 'sup'].includes(tag)) {
        attrs.push(`${name}="${escapeText(value)}"`);
      } else if ((name === 'title' && ['a', 'abbr'].includes(tag)) || (name === 'datetime' && tag === 'time')) {
        attrs.push(`${name}="${escapeText(value)}"`);
      } else if (name === 'cite' && tag === 'q') {
        const href = safeLink(attr.value, sourceUrl, options.allowFileProtocol);
        if (href) attrs.push(`cite="${escapeText(href)}"`);
      } else if (name === 'class' && ['span', 'code'].includes(tag) && /^[\w -]{1,200}$/.test(value)) {
        attrs.push(`class="${escapeText(value)}"`);
      } else if ((name === 'color' || name === 'style') && tag === 'span') {
        const color = safeColor(name === 'color' ? attr.value : value.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1] ?? '');
        if (color && !attrs.some(attr => attr.startsWith('style='))) attrs.push(`style="color: ${escapeText(color)}"`);
      } else if (block && ['colspan', 'rowspan'].includes(name) && ['td', 'th'].includes(tag) && /^[1-9]\d{0,2}$/.test(value)) {
        attrs.push(`${name}="${value}"`);
      } else if (block && name === 'start' && tag === 'ol' && /^-?\d{1,8}$/.test(value)) {
        attrs.push(`start="${value}"`);
      }
    }
    result += `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    if (!VOID.has(tag)) stack.push(tag);
  }
  while (stack.length) result += `</${stack.pop()}>`;
  return result.trim();
}

export function plainText(value) {
  let dropped = '';
  return decodeEntities(tokenizeHtml(value).map(token => {
    if (dropped) { if (token.type === 'tag' && token.closing && token.name === dropped) dropped = ''; return ''; }
    if (token.type === 'text') return token.raw;
    if (token.type === 'tag' && DROP.has(token.name) && !token.closing) { if (!['input', 'embed'].includes(token.name)) dropped = token.name; return ''; }
    return token.type === 'tag' && (token.name === 'br' || token.name === 'hr' || BLOCK_BOUNDARIES.has(token.name)) ? ' ' : '';
  }).join('')).replace(/\s+/g, ' ').trim();
}
