// @ts-check
import { cloneWithoutRepeatedNoteTooltips } from './dom-utils.js';
import { cleanLatexFormula } from './text-utils.js';
import { isIcon, isInteractiveControlLabel, isSubscriptionFormContent } from './filters.js';
import { materializeAnnotationReferences } from './annotations.js';

const MATHML = 'http://www.w3.org/1998/Math/MathML';
const MATH_TOKENS = ['mi', 'mn', 'mo', 'mtext'];
const MATH_GROUPS = ['math', 'semantics', 'mrow', 'msup', 'msub'];
const MATH_LAYOUT = ['mfrac', 'msqrt', 'msubsup', 'mspace', 'mtable', 'mtr', 'mtd'];

/** MathML semantics has one presentation branch. Annotations are alternate forms. */
function presentationChildren(element) {
  const children = Array.from(element.children);
  if (element.localName !== 'semantics') return children;
  return children.slice(0, 1).filter(child => child.namespaceURI === MATHML &&
    !['annotation', 'annotation-xml'].includes(child.localName));
}

/** Render a validated presentation MathML subset with portable inline elements. */
export function renderSimpleMathMl(math, outputDocument = math.ownerDocument, allowLinearLayout = false) {
  try {
    function render(element) {
      if (element.namespaceURI !== MATHML) return null;
      const tag = element.localName;
      if (!MATH_TOKENS.includes(tag) && !MATH_GROUPS.includes(tag) && !(allowLinearLayout && MATH_LAYOUT.includes(tag))) return null;
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name === 'class' || attribute.name.startsWith('data-semantic-') || attribute.name === 'data-speech-node') continue;
        if (tag === 'math' && (attribute.name === 'xmlns' || attribute.name === 'display' && /^(inline|block)$/.test(attribute.value))) continue;
        if (tag === 'mo' && attribute.name === 'stretchy' && /^(true|false)$/.test(attribute.value)) continue;
        if (allowLinearLayout && (
          tag === 'mspace' && ['width', 'height', 'depth'].includes(attribute.name) ||
          ['mtable', 'mtd', 'mtr'].includes(tag) && ['columnalign', 'rowalign', 'columnspacing', 'rowspacing'].includes(attribute.name)
        )) continue;
        return null;
      }
      if (MATH_TOKENS.includes(tag)) {
        if (Array.from(element.childNodes).some(node => node.nodeType !== 3) || !element.textContent) return null;
        return outputDocument.createTextNode(element.textContent);
      }
      if (tag === 'mspace') return element.childNodes.length ? null : outputDocument.createTextNode(' ');
      if (Array.from(element.childNodes).some(node => node.nodeType !== 1 && (node.nodeType !== 3 || node.textContent?.trim()))) return null;
      const children = presentationChildren(element);
      if (!children.length || (['msup', 'msub', 'mfrac'].includes(tag) && children.length !== 2) ||
          (tag === 'msubsup' && children.length !== 3)) return null;
      const parts = children.map(render);
      if (parts.some(part => !part)) return null;
      const result = outputDocument.createDocumentFragment();
      const scripted = (name, content) => {
        const node = outputDocument.createElement(name);
        node.append(content);
        return node;
      };
      if (tag === 'msup') result.append(parts[0], scripted('sup', parts[1]));
      else if (tag === 'msub') result.append(parts[0], scripted('sub', parts[1]));
      else if (tag === 'msubsup') result.append(parts[0], scripted('sub', parts[1]), scripted('sup', parts[2]));
      else if (tag === 'mfrac') result.append('(', parts[0], ')/(', parts[1], ')');
      else if (tag === 'msqrt') result.append('√(', ...parts, ')');
      else parts.forEach((part, index) => {
        if (index && tag === 'mtable') result.append(outputDocument.createElement('br'));
        if (index && tag === 'mtr') result.append(' ');
        result.append(part);
      });
      return result;
    }
    if (math.localName !== 'math') return null;
    return render(math);
  } catch (_) {
    return null;
  }
}

/** Use one expression even when its presentation cannot be projected as rich text. */
function presentationMathText(element) {
  if (element.namespaceURI !== MATHML || ['annotation', 'annotation-xml'].includes(element.localName)) return '';
  if (element.localName === 'semantics') return presentationChildren(element).map(presentationMathText).join('');
  return Array.from(element.childNodes, child =>
    child.nodeType === 3 ? child.textContent : child.nodeType === 1 ? presentationMathText(child) : '').join('');
}

/**
 * Process math elements using semantic markup or the original LaTeX fallback.
 * @param {Element} container - Container element
 */
export function processMathElements(container, runtimeInputs = new Map()) {
  // Find all math-related elements
  const mathElements = container.querySelectorAll('.mwe-math-element, .mathjax, .MathJax, .MathJax_Display, .latex, .katex, mjx-container, math');

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
    if (!latex) latex = runtimeInputs.get(mathEl) || '';

    let semanticMath = mathTag;
    if (!semanticMath && frame?.getAttribute('data-mathml')) {
      const Parser = container.ownerDocument.defaultView?.DOMParser;
      if (Parser) {
        const parsed = new Parser().parseFromString(frame.getAttribute('data-mathml'), 'application/xml');
        if (!parsed.querySelector('parsererror')) semanticMath = parsed.documentElement;
      }
    }
    const rendered = semanticMath ? renderSimpleMathMl(semanticMath, container.ownerDocument, !latex) : null;
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
      const presentation = semanticMath?.namespaceURI === MATHML
        ? presentationMathText(semanticMath)
        : mathEl.querySelector('mjx-math,.katex-html')?.textContent ?? mathEl.textContent;
      mathEl.replaceWith(container.ownerDocument.createTextNode(presentation || ''));
    }
  }
}

const clonedMathInputs = new WeakMap();

function getRenderedMathInputs(root) {
  const wrappers = Array.from(root.querySelectorAll('mjx-container'));
  const inputs = new Map(wrappers.flatMap(wrapper => {
    const tex = clonedMathInputs.get(wrapper);
    return tex ? [[wrapper, tex]] : [];
  }));
  if (!wrappers.length || !root.isConnected) return inputs;
  const view = /** @type {Window & {MathJax?: {startup?: {document?: any}}}} */ (root.ownerDocument.defaultView);
  const mathDocument = view?.MathJax?.startup?.document;
  if (typeof mathDocument?.getMathItemsWithin !== 'function') return inputs;
  try {
    for (const item of mathDocument.getMathItemsWithin([root])) {
      if (item.inputJax?.name === 'TeX' && typeof item.math === 'string' && wrappers.includes(item.typesetRoot)) {
        inputs.set(item.typesetRoot, item.math);
      }
    }
  } catch { /* Continue with the portable markup. */ }
  return inputs;
}

/** Carry runtime notation through clone-based list, quote, or table projection. */
export function preserveClonedMathInputs(root, copies) {
  for (const [original, tex] of getRenderedMathInputs(root)) {
    const copy = copies.get(original);
    if (copy) clonedMathInputs.set(copy, tex);
  }
}

/** Associate rendered math with its source before a flow wrapper is detached. */
export function preserveRangeMathInputs(root, range, fragment) {
  const rendered = Array.from(fragment.querySelectorAll('mjx-container'));
  if (!rendered.length) return;
  const originals = Array.from(root.querySelectorAll('mjx-container')).filter(node => range.intersectsNode(node));
  if (originals.length !== rendered.length) return;
  const inputs = getRenderedMathInputs(root);
  rendered.forEach((copy, index) => {
    const tex = inputs.get(originals[index]);
    if (tex) clonedMathInputs.set(copy, tex);
  });
}

export function encodeOriginalText(element, text) {
  const node = element.ownerDocument.createElement('span');
  node.textContent = text;
  return node.innerHTML;
}

/**
 * Sanitize paragraph HTML (remove event handlers, clean up)
 * @param {Element} p - Paragraph element
 * @param {Array<Element|string>} excludedSelectors
 * @param {Element[]|null} referenceRoots
 * @param {boolean} preserveRoot - Retain inline formatting or a link on the selected element
 * @returns {string} - Sanitized HTML
 */
export function serializeReadingHtml(p, excludedSelectors = [], referenceRoots = null, preserveRoot = false) {
  // Clone to avoid modifying original
  const copies = new Map();
  let clone = /** @type {Element} */ (cloneWithoutRepeatedNoteTooltips(p, referenceRoots, excludedSelectors, copies));
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
  if (preserveRoot && p.matches('a,b,i,em,strong,small,sup,sub,span,mark,s,u')) {
    const wrapper = p.ownerDocument.createElement('span');
    clone.removeAttribute('id');
    wrapper.appendChild(clone);
    clone = wrapper;
  }
  materializeAnnotationReferences(clone);

  // Preserve supported semantic math and the original notation fallback.
  const mathInputs = new Map(Array.from(getRenderedMathInputs(p), ([original, tex]) => [copies.get(original), tex]));
  processMathElements(clone, mathInputs);

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
