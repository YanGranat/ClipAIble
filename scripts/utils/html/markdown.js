// @ts-check

import { decodeEntities, escapeText, safeLink, renderRich, tokenizeHtml } from './tokenizer.js';

function inlineMarkdown(text, sourceUrl, depth = 0) {
  if (depth > 20) return escapeText(text);
  let output = '';
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === '\\' && index + 1 < text.length && /[\\`*{}[\]()#+.!_<>~-]/.test(text[index + 1])) {
      output += escapeText(text[index + 1]); index += 2; continue;
    }
    if (char === '`') {
      const delimiter = text.slice(index).match(/^`+/)[0];
      const close = text.indexOf(delimiter, index + delimiter.length);
      if (close >= 0) {
        output += `<code>${escapeText(text.slice(index + delimiter.length, close))}</code>`;
        index = close + delimiter.length; continue;
      }
    }
    if (char === '[') {
      const closeLabel = text.indexOf('](', index + 1);
      if (closeLabel >= 0) {
        let end = closeLabel + 2;
        let balance = 1;
        for (; end < text.length && balance; end++) {
          if (text[end] === '\\') { end++; continue; }
          if (text[end] === '(') balance++;
          if (text[end] === ')') balance--;
        }
        if (!balance) {
          const href = safeLink(text.slice(closeLabel + 2, end - 1), sourceUrl);
          const label = inlineMarkdown(text.slice(index + 1, closeLabel), sourceUrl, depth + 1);
          output += href ? `<a href="${escapeText(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>` : label;
          index = end; continue;
        }
      }
    }
    const delimiter = ['**', '__', '~~', '*', '_'].find(marker => text.startsWith(marker, index));
    if (delimiter && !(delimiter.includes('_') && /[\p{L}\p{N}]/u.test(text[index - 1] || '')) && !/\s/.test(text[index + delimiter.length] || ' ')) {
      let close = text.indexOf(delimiter, index + delimiter.length);
      while (close >= 0 && (/\s/.test(text[close - 1]) || (delimiter.includes('_') && /[\p{L}\p{N}]/u.test(text[close + delimiter.length] || '')))) close = text.indexOf(delimiter, close + delimiter.length);
      if (close > index + delimiter.length) {
        const tag = delimiter === '~~' ? 's' : delimiter.length === 2 ? 'strong' : 'em';
        output += `<${tag}>${inlineMarkdown(text.slice(index + delimiter.length, close), sourceUrl, depth + 1)}</${tag}>`;
        index = close + delimiter.length; continue;
      }
    }
    if (char === '&') {
      const entity = text.slice(index).match(/^&(?:#[xX][a-f\d]+|#\d+|[a-z][a-z\d]+);/i);
      if (entity) { output += escapeText(decodeEntities(entity[0])); index += entity[0].length; continue; }
    }
    output += escapeText(char);
    index++;
  }
  return output;
}

export function markdownHtml(value, sourceUrl = '', depth = 0) {
  if (depth > 20) return escapeText(value);
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  const listItem = line => line.match(/^([ \t]*)(?:([-+*])|(\d+)\.)\s+(.+)$/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = line.match(/^\s*(`{3,}|~{3,})([\w+-]*)\s*$/);
    if (fence) {
      const content = [];
      const end = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (++index < lines.length && !end.test(lines[index])) content.push(lines[index]);
      output.push(`<pre><code${fence[2] ? ` class="language-${escapeText(fence[2])}"` : ''}>${escapeText(content.join('\n'))}</code></pre>`);
      continue;
    }
    const item = listItem(line);
    if (item) {
      const tag = item[3] ? 'ol' : 'ul';
      const indentation = item[1].length;
      output.push(`<${tag}${tag === 'ol' && item[3] !== '1' ? ` start="${Number(item[3])}"` : ''}>`);
      while (index < lines.length) {
        const current = listItem(lines[index]);
        if (!current || current[1].length !== indentation || !!current[3] !== !!item[3]) break;
        const body = [current[4]];
        const continuation = current[0].length - current[4].length;
        let next = index + 1;
        for (; next < lines.length; next++) {
          if (!lines[next].trim()) { body.push(''); continue; }
          const leading = lines[next].match(/^[ \t]*/)[0].length;
          if (leading <= indentation) break;
          body.push(lines[next].slice(Math.min(leading, continuation)));
        }
        output.push(`<li>${markdownHtml(body.join('\n').trimEnd(), sourceUrl, depth + 1)}</li>`);
        index = next;
      }
      output.push(`</${tag}>`);
      index--;
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2], sourceUrl)}</h${heading[1].length}>`);
    else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) output.push('<hr>');
    else if (/^>\s?/.test(line)) output.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''), sourceUrl)}</blockquote>`);
    else output.push(inlineMarkdown(line, sourceUrl) + (index < lines.length - 1 ? '<br>' : ''));
  }
  return output.join('');
}

function markdownText(text) {
  return decodeEntities(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]])/g, '\\$1');
}

function flattenedText(node, plain = false) {
  const pending = [node];
  let text = '';
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') text += plain ? decodeEntities(current) : markdownText(current);
    else if (current.name === 'br') text += '\n';
    else for (let index = current.children.length - 1; index >= 0; index--) pending.push(current.children[index]);
  }
  return text;
}

function boundaryCharacter(value, last = false) {
  return Array.from(value).at(last ? -1 : 0) || '';
}

function formattingAtEdge(node, last = false) {
  let current = node;
  const value = flattenedText(node, true);
  if (!value || /\s/u.test(boundaryCharacter(value, last))) return false;
  while (typeof current !== 'string') {
    if (['strong', 'b', 'em', 'i', 's', 'del'].includes(current.name)) return true;
    if (['a', 'code', 'br'].includes(current.name)) return false;
    const children = last ? [...current.children].reverse() : current.children;
    current = children.find(child => flattenedText(child, true));
    if (current === undefined) return false;
  }
  return false;
}

function inlineContexts(children, outer = { before: '', after: '', beforeFormatting: false, afterFormatting: false }) {
  const texts = children.map(child => flattenedText(child, true));
  const contexts = texts.map(() => ({ before: '', after: '', beforeFormatting: false, afterFormatting: false }));
  let previous = outer.before;
  let previousFormatting = outer.beforeFormatting;
  for (let index = 0; index < texts.length; index++) {
    contexts[index].before = previous;
    contexts[index].beforeFormatting = previousFormatting;
    if (texts[index]) {
      previous = boundaryCharacter(texts[index], true);
      previousFormatting = formattingAtEdge(children[index], true);
    }
  }
  let next = outer.after;
  let nextFormatting = outer.afterFormatting;
  for (let index = texts.length - 1; index >= 0; index--) {
    contexts[index].after = next;
    contexts[index].afterFormatting = nextFormatting;
    if (texts[index]) {
      next = boundaryCharacter(texts[index]);
      nextFormatting = formattingAtEdge(children[index]);
    }
  }
  return contexts;
}

export function richMarkdown(value, sourceUrl = '') {
  const root = { name: '', children: [], attrs: [] };
  const stack = [root];
  for (const token of tokenizeHtml(renderRich(value, sourceUrl, {}, true))) {
    if (token.type === 'text') stack.at(-1).children.push(token.raw);
    if (token.type !== 'tag') continue;
    if (token.closing) { if (stack.length > 1) stack.pop(); continue; }
    const node = { name: token.name, children: [], attrs: token.attrs };
    stack.at(-1).children.push(node);
    if (!['br', 'hr'].includes(node.name)) stack.push(node);
  }
  const emittedIds = new Set();
  const renderAnchor = node => node.attrs.filter(attr => ['id', 'name'].includes(attr.name)).map(attr => {
    const id = decodeEntities(attr.value);
    if (!id || emittedIds.has(id)) return '';
    emittedIds.add(id);
    return `<a id="${escapeText(id)}"></a>`;
  }).join('');
  const renderList = (node, indentation = '', depth = 0) => {
    if (depth > 64) return flattenedText(node);
    const start = Number(node.attrs.find(attr => attr.name === 'start')?.value.trim() || '1');
    let number = Number.isSafeInteger(start) ? start : 1;
    const output = [];
    for (const child of node.children) {
      if (typeof child === 'string') { if (child.trim()) output.push(indentation + markdownText(child)); continue; }
      if (child.name !== 'li') { output.push(indentation + render(child, depth + 1)); continue; }
      const marker = node.name === 'ol' ? `${number++}. ` : '- ';
      const continuation = indentation + ' '.repeat(marker.length);
      let paragraph = renderAnchor(child);
      let started = false;
      const flush = () => {
        if (!paragraph.trim()) return;
        const content = paragraph.trim().split('\n');
        output.push((started ? '\n' + continuation : indentation + marker) + content.join('\n' + continuation));
        paragraph = '';
        started = true;
      };
      const contexts = inlineContexts(child.children);
      for (const [index, part] of child.children.entries()) {
        if (typeof part !== 'string' && ['ul', 'ol'].includes(part.name)) {
          flush();
          if (!started) { output.push(indentation + marker.trimEnd()); started = true; }
          output.push(renderList(part, continuation, depth + 1));
        } else paragraph += render(part, depth + 1, contexts[index]);
      }
      flush();
      if (!started) output.push(indentation + marker.trimEnd());
    }
    return output.join('\n');
  };
  const renderContent = (node, depth = 0, context = { before: '', after: '', beforeFormatting: false, afterFormatting: false }) => {
    if (typeof node === 'string') return markdownText(node);
    if (depth > 64) return flattenedText(node);
    if (node.name === 'ul' || node.name === 'ol') return '\n\n' + renderList(node, '', depth) + '\n\n';
    const block = ['p', 'blockquote', 'tr', 'li', 'pre'].includes(node.name) || /^h[1-6]$/.test(node.name);
    const contexts = inlineContexts(node.children, block ? undefined : context);
    const inner = node.children.map((child, index) => render(child, depth + 1, contexts[index])).join('');
    if (['strong', 'b', 'em', 'i', 's', 'del'].includes(node.name)) {
      const marker = ['strong', 'b'].includes(node.name) ? '**' : ['s', 'del'].includes(node.name) ? '~~' : '*';
      const value = inner.trim();
      if (!value) return inner;
      const leading = inner.slice(0, inner.length - inner.trimStart().length);
      const trailing = inner.slice(inner.trimEnd().length);
      const left = leading.at(-1) || context.before;
      const right = trailing[0] || context.after;
      const whitespace = char => !char || /\s/u.test(char);
      const punctuation = char => !!char && /[\p{P}\p{S}]/u.test(char);
      const canOpen = !punctuation(boundaryCharacter(value)) || whitespace(left) || punctuation(left);
      const canClose = !punctuation(boundaryCharacter(value, true)) || whitespace(right) || punctuation(right);
      const nestedDelimiter = value.startsWith(marker[0]) || value.endsWith(marker[0]);
      const joinedDelimiter = (!leading && context.beforeFormatting) || (!trailing && context.afterFormatting);
      const tag = marker === '**' ? 'strong' : marker === '*' ? 'em' : 's';
      const formatted = canOpen && canClose && !nestedDelimiter && !joinedDelimiter ? `${marker}${value}${marker}` : `<${tag}>${value}</${tag}>`;
      return leading + formatted + trailing;
    }
    if (node.name === 'code') {
      const code = node.children.map(child => typeof child === 'string' ? decodeEntities(child) : render(child, depth)).join('');
      const runs = code.match(/`+/g) || [];
      const marker = '`'.repeat(Math.max(1, ...runs.map(run => run.length + 1)));
      return `${marker}${code}${marker}`;
    }
    if (node.name === 'pre') return '\n\n' + inner + '\n\n';
    if (node.name === 'sup' || node.name === 'sub') return `<${node.name}>${inner}</${node.name}>`;
    if (node.name === 'a') {
      const href = node.attrs.find(attr => attr.name === 'href');
      if (!href || !inner.trim()) return inner;
      const leadingBreak = /^[ \t]*\n/.test(inner);
      const trailingBreak = /\n[ \t]*$/.test(inner);
      let label = inner.replace(/[ \t]*\n(?:[ \t]*\n)*[ \t]*/g, ' ');
      if (leadingBreak) label = label.trimStart();
      if (trailingBreak) label = label.trimEnd();
      const destination = decodeEntities(href.value).replace(/\(/g, '%28').replace(/\)/g, '%29');
      return `${leadingBreak ? ' ' : ''}[${label}](${destination})${trailingBreak ? ' ' : ''}`;
    }
    if (node.name === 'br') return '\n';
    if (node.name === 'hr') return '\n\n---\n\n';
    if (/^h[1-6]$/.test(node.name)) return '\n\n' + '#'.repeat(Number(node.name[1])) + ' ' + inner + '\n\n';
    if (['p', 'blockquote', 'tr'].includes(node.name)) return '\n' + inner + '\n';
    return inner;
  };
  const render = (node, depth = 0, context = { before: '', after: '', beforeFormatting: false, afterFormatting: false }) =>
    typeof node === 'string' ? markdownText(node) : renderAnchor(node) + renderContent(node, depth, context);
  return render(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
