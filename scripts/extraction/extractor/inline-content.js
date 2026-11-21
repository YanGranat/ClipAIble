// @ts-check
import { cloneWithoutRepeatedNoteTooltips } from './dom-utils.js';
import { cleanLatexFormula } from './text-utils.js';
import { isIcon, isInteractiveControlLabel, isSubscriptionFormContent } from './filters.js';
import { materializeAnnotationReferences } from './annotations.js';

/** Render a validated presentation MathML subset with portable inline elements. */
export function renderSimpleMathMl(math, outputDocument = math.ownerDocument) {
  try {
    function render(element) {
      if (element.namespaceURI !== 'http://www.w3.org/1998/Math/MathML') return null;
      const tag = element.localName;
      if (!['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub'].includes(tag)) return null;
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name === 'class' || (tag === 'math' && attribute.name === 'xmlns')) continue;
        if (tag === 'mo' && attribute.name === 'stretchy' && /^(true|false)$/.test(attribute.value)) continue;
        return null;
      }
      if (['mi', 'mn', 'mo'].includes(tag)) {
        if (Array.from(element.childNodes).some(node => node.nodeType !== 3) || !element.textContent?.trim()) return null;
        return outputDocument.createTextNode(element.textContent);
      }
      if (Array.from(element.childNodes).some(node => node.nodeType !== 1 && (node.nodeType !== 3 || node.textContent?.trim()))) return null;
      const children = Array.from(element.children);
      if (!children.length || (['msup', 'msub'].includes(tag) && children.length !== 2)) return null;
      const parts = children.map(render);
      if (parts.some(part => !part)) return null;
      const result = outputDocument.createDocumentFragment();
      if (tag === 'msup' || tag === 'msub') {
        result.appendChild(parts[0]);
        const script = outputDocument.createElement(tag === 'msup' ? 'sup' : 'sub');
        script.appendChild(parts[1]);
        result.appendChild(script);
      } else for (const part of parts) result.appendChild(part);
      return result;
    }
    if (math.localName !== 'math') return null;
    return render(math);
  } catch (_) {
    return null;
  }
}

/**
 * Process math elements using semantic markup or the original LaTeX fallback.
 * @param {Element} container - Container element
 */
export function processMathElements(container) {
  // Find all math-related elements
  const mathElements = container.querySelectorAll('.mwe-math-element, .mathjax, .MathJax, .MathJax_Display, .latex, .katex, math');

  for (const mathEl of Array.from(mathElements)) {
    if (!container.contains(mathEl)) continue;
    // Try to get LaTeX from various sources
    let latex = '';

    const frame = mathEl.matches('.MathJax') ? mathEl : mathEl.querySelector('.MathJax');
    const sourceId = frame?.id.replace(/-Frame$/, '');
    const script = (sourceId ? container.ownerDocument.getElementById(sourceId) : null) ||
      frame?.nextElementSibling || mathEl.nextElementSibling;
    if (script?.tagName === 'SCRIPT' && /^math\/tex(?:;|$)/i.test(script.getAttribute('type') || '')) {
      latex = script.textContent || '';
    }

    // 1. Try img alt attribute (Wikipedia uses this)
    const img = mathEl.querySelector('img');
    if (!latex && img && img.alt) {
      latex = img.alt;
    }

    // 2. Try math alttext attribute
    const mathTag = mathEl.querySelector('math') || (mathEl.tagName.toLowerCase() === 'math' ? mathEl : null);
    if (!latex && mathTag) {
      latex = mathTag.getAttribute('alttext') || '';
    }

    // 3. Try annotation element
    if (!latex) {
      const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        latex = annotation.textContent || '';
      }
    }

    let semanticMath = mathTag;
    if (!semanticMath && frame?.getAttribute('data-mathml')) {
      const Parser = container.ownerDocument.defaultView?.DOMParser;
      if (Parser) {
        const parsed = new Parser().parseFromString(frame.getAttribute('data-mathml'), 'application/xml');
        if (!parsed.querySelector('parsererror')) semanticMath = parsed.documentElement;
      }
    }
    const rendered = semanticMath ? renderSimpleMathMl(semanticMath, container.ownerDocument) : null;
    if (rendered) {
      const wrapper = container.ownerDocument.createElement('span');
      wrapper.className = 'math';
      wrapper.appendChild(rendered);
      mathEl.replaceWith(wrapper);
    } else if (latex) {
      // Clean and wrap in markdown math delimiters
      const cleanedLatex = cleanLatexFormula(latex);
      const textNode = container.ownerDocument.createTextNode(` $${cleanedLatex}$ `);
      mathEl.replaceWith(textNode);
    } else {
      mathEl.replaceWith(container.ownerDocument.createTextNode(mathEl.textContent || ''));
    }
  }
}

export function encodeOriginalText(element, text) {
  const node = element.ownerDocument.createElement('span');
  node.textContent = text;
  return node.innerHTML;
}

/**
 * Sanitize paragraph HTML (remove event handlers, clean up)
 * @param {Element} p - Paragraph element
 * @returns {string} - Sanitized HTML
 */
export function serializeReadingHtml(p, excludedSelectors = [], referenceRoots = null) {
  // Clone to avoid modifying original
  const copies = new Map();
  const clone = /** @type {Element} */ (cloneWithoutRepeatedNoteTooltips(p, referenceRoots, excludedSelectors, copies));
  for (const source of [p, ...Array.from(p.querySelectorAll('form'))]) {
    if (!isSubscriptionFormContent(source)) continue;
    const copy = copies.get(source);
    if (copy === clone) clone.replaceChildren();
    else copy?.remove();
  }
  for (const form of Array.from(clone.querySelectorAll('form'))) {
    if (isSubscriptionFormContent(form)) form.remove();
    else form.replaceWith(...form.childNodes);
  }
  for (const label of Array.from(p.querySelectorAll('label,span[id]'))) {
    if (isInteractiveControlLabel(label)) copies.get(label)?.remove();
  }
  materializeAnnotationReferences(clone);

  // Preserve supported semantic math and the original notation fallback.
  processMathElements(clone);

  // Remove event handlers
  const allElements = clone.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.tagName === 'SPAN') {
      const style = /** @type {HTMLElement} */ (el).style;
      const bold = style?.fontWeight === 'bold' || Number(style?.fontWeight) >= 600;
      const italic = style?.fontStyle === 'italic';
      if (bold || italic) {
        const wrapper = clone.ownerDocument.createElement(bold ? 'strong' : 'em');
        wrapper.append(...el.childNodes);
        el.replaceWith(wrapper);
        if (bold && italic) {
          const emphasis = clone.ownerDocument.createElement('em');
          emphasis.append(...wrapper.childNodes);
          wrapper.append(emphasis);
        }
      }
    }
    // Remove on* attributes
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }

    // Remove footnotes and icons
    if (isIcon(el)) {
      el.remove();
    }

    // Remove style and script elements that might have slipped through
    if (el.tagName.toLowerCase() === 'style' || el.tagName.toLowerCase() === 'script') {
      el.remove();
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && !href.startsWith('#')) {
        try {
          const absolute = new URL(href, p.ownerDocument.baseURI);
          if (['http:', 'https:', 'mailto:'].includes(absolute.protocol)) el.setAttribute('href', absolute.href);
          else el.removeAttribute('href');
        } catch (_) { el.removeAttribute('href'); }
      }
    }
  }

  // Clean empty elements
  const emptyElements = clone.querySelectorAll('span:empty, div:empty');
  for (const empty of Array.from(emptyElements)) {
    empty.remove();
  }

  return clone.textContent?.trim() || clone.querySelector('math')
    ? (/** @type {HTMLElement} */ (clone)).innerHTML.trim() : '';
}
