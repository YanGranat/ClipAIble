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

function flattenedText(node) {
  const pending = [node];
  let text = '';
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') text += markdownText(current);
    else if (current.name === 'br') text += '\n';
    else for (let index = current.children.length - 1; index >= 0; index--) pending.push(current.children[index]);
  }
  return text;
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
  const renderList = (node, indentation = '', depth = 0) => {
    if (depth > 64) return flattenedText(node);
    let number = Number(node.attrs.find(attr => attr.name === 'start')?.value) || 1;
    const output = [];
    for (const child of node.children) {
      if (typeof child === 'string') { if (child.trim()) output.push(indentation + markdownText(child)); continue; }
      if (child.name !== 'li') { output.push(indentation + render(child, depth + 1)); continue; }
      const marker = node.name === 'ol' ? `${number++}. ` : '- ';
      const continuation = indentation + ' '.repeat(marker.length);
      let paragraph = '';
      let started = false;
      const flush = () => {
        if (!paragraph.trim()) return;
        const content = paragraph.trim().split('\n');
        output.push((started ? '\n' + continuation : indentation + marker) + content.join('\n' + continuation));
        paragraph = '';
        started = true;
      };
      for (const part of child.children) {
        if (typeof part !== 'string' && ['ul', 'ol'].includes(part.name)) {
          flush();
          if (!started) { output.push(indentation + marker.trimEnd()); started = true; }
          output.push(renderList(part, continuation, depth + 1));
        } else paragraph += render(part, depth + 1);
      }
      flush();
      if (!started) output.push(indentation + marker.trimEnd());
    }
    return output.join('\n');
  };
  const render = (node, depth = 0) => {
    if (typeof node === 'string') return markdownText(node);
    if (depth > 64) return flattenedText(node);
    if (node.name === 'ul' || node.name === 'ol') return '\n' + renderList(node, '', depth) + '\n';
    const inner = node.children.map(child => render(child, depth + 1)).join('');
    if (['strong', 'b', 'em', 'i', 's', 'del'].includes(node.name)) {
      const marker = ['strong', 'b'].includes(node.name) ? '**' : ['s', 'del'].includes(node.name) ? '~~' : '*';
      return inner.trim() ? `${marker}${inner.trim()}${marker}` : '';
    }
    if (node.name === 'code') {
      const code = node.children.map(child => typeof child === 'string' ? decodeEntities(child) : render(child, depth)).join('');
      const runs = code.match(/`+/g) || [];
      const marker = '`'.repeat(Math.max(1, ...runs.map(run => run.length + 1)));
      return `${marker}${code}${marker}`;
    }
    if (node.name === 'pre') return '\n\n' + inner + '\n\n';
    if (node.name === 'a') {
      const href = node.attrs.find(attr => attr.name === 'href');
      return href ? `[${inner}](${decodeEntities(href.value).replace(/\(/g, '%28').replace(/\)/g, '%29')})` : inner;
    }
    if (node.name === 'br') return '\n';
    if (node.name === 'hr') return '\n\n---\n\n';
    if (/^h[1-6]$/.test(node.name)) return '\n\n' + '#'.repeat(Number(node.name[1])) + ' ' + inner + '\n\n';
    if (['p', 'blockquote', 'tr'].includes(node.name)) return '\n' + inner + '\n';
    return inner;
  };
  return render(root).replace(/([\p{L}\p{N}.,;:!?)\]])(\*\*)(?=[\p{L}\p{N}])/gu, '$1$2 ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
