// @ts-check
// Generated from the article extraction runtime modules.
export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false, selectors = null) {
var clipaibleArticleExtractor = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // scripts/extraction/extractor/extractor-entry.js
  var extractor_entry_exports = {};
  __export(extractor_entry_exports, {
    runExtraction: () => runExtraction
  });

  // scripts/extraction/extractor/debug.js
  function collectPageInfo(win, doc, baseUrl) {
    return {
      url: win.location.href,
      title: doc.title,
      baseUrl,
      documentLang: doc.documentElement.lang,
      documentXmlLang: doc.documentElement.getAttribute("xml:lang"),
      bodyClasses: doc.body.className,
      bodyLang: doc.body.lang,
      hasGoogleTranslate: !!doc.querySelector(".goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element"),
      isTranslated: doc.body.classList.contains("translated-ltr") || doc.body.classList.contains("translated-rtl"),
      timestamp: Date.now()
    };
  }
  function collectMetaTags(doc) {
    const metaTags = {};
    doc.querySelectorAll("meta").forEach((meta) => {
      const name = meta.getAttribute("name") || meta.getAttribute("property") || meta.getAttribute("http-equiv");
      if (name) {
        metaTags[name] = meta.getAttribute("content") || "";
      }
    });
    return metaTags;
  }
  function collectDocumentStructure(doc) {
    return {
      hasArticle: !!doc.querySelector("article"),
      hasMain: !!doc.querySelector("main"),
      hasHeader: !!doc.querySelector("header"),
      hasFooter: !!doc.querySelector("footer"),
      hasNav: !!doc.querySelector("nav"),
      hasAside: !!doc.querySelector("aside"),
      allParagraphsCount: doc.querySelectorAll("p").length,
      allHeadingsCount: doc.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
      allImagesCount: doc.querySelectorAll("img").length
    };
  }
  function collectMainContentPreview(doc) {
    const mainContent = doc.querySelector('main, article, [role="main"], #content, #main-content');
    return {
      hasMain: !!mainContent,
      mainTagName: mainContent?.tagName,
      mainClassName: mainContent?.className,
      mainId: mainContent?.id,
      mainTextLength: mainContent?.textContent?.length || 0,
      mainTextFull: mainContent?.textContent || null,
      mainHTMLFull: mainContent?.innerHTML || null,
      childCount: mainContent?.children?.length || 0
    };
  }
  function createDebugInfo(win, doc, baseUrl) {
    return {
      foundElements: 0,
      filteredElements: 0,
      imageCount: 0,
      excludedImageCount: 0,
      processedCount: 0,
      skippedCount: 0,
      contentTypes: {},
      extractionLogs: [],
      pageInfo: collectPageInfo(win, doc, baseUrl),
      metaTags: collectMetaTags(doc),
      documentStructure: collectDocumentStructure(doc),
      mainContentPreview: collectMainContentPreview(doc),
      documentHTMLFull: doc.documentElement.outerHTML || null,
      bodyHTMLFull: doc.body?.innerHTML || null,
      googleTranslateState: null,
      firstParagraphCheck: null
    };
  }
  function pushDebugLog(debugInfo, type, data) {
    if (!debugInfo) return;
    debugInfo.extractionLogs.push({ type, data });
  }
  function incrementContentType(debugInfo, contentType) {
    if (!debugInfo) return;
    debugInfo.contentTypes[contentType] = (debugInfo.contentTypes[contentType] || 0) + 1;
  }
  function logToConsoleSafe(...args) {
    try {
      console.log(...args);
    } catch (e) {
    }
  }
  function logExtractionStart(baseUrl, enableDebugInfo) {
    logToConsoleSafe("[ClipAIble] extractAutomaticallyInlined: START", {
      baseUrl,
      enableDebugInfo,
      timestamp: Date.now()
    });
  }
  function logHtmlState(doc) {
    const actualMainContent = doc.querySelector('main, article, [role="main"], #content, #main-content');
    const actualFirstParagraph = doc.querySelector('main p, article p, [role="main"] p, #content p');
    logToConsoleSafe("[ClipAIble] === ACTUAL HTML ON PAGE ===", {
      documentHTMLLength: doc.documentElement.outerHTML.length,
      hasMainContent: !!actualMainContent,
      mainContentHTMLLength: actualMainContent?.innerHTML?.length || 0,
      hasFirstParagraph: !!actualFirstParagraph,
      firstParagraphText: actualFirstParagraph?.textContent?.substring(0, 200) || null,
      firstParagraphHasDataOriginalText: actualFirstParagraph?.hasAttribute("data-original-text") || false,
      timestamp: Date.now()
    });
  }

  // scripts/extraction/extractor/spa.js
  async function waitForContentLoad(doc) {
    const MAX_WAIT_TIME = 5e3;
    const CHECK_INTERVAL = 200;
    const MIN_CONTENT_LENGTH = 500;
    const SETTLE_DELAY = 300;
    const contentSelectors = [
      // Semantic HTML
      '[role="main"]',
      // Common content classes
      ".article-content",
      ".post-content",
      ".entry-content",
      "#content",
      "#main-content",
      "#article-content",
      // SPA framework roots
      "#root",
      "#app",
      "#__next",
      "[data-reactroot]",
      "[ng-app]",
      "[data-vue-app]",
      // Notion specific
      ".notion-page-content",
      ".notion-page",
      // Generic patterns
      '[class*="article"]',
      '[class*="content"]'
    ];
    function hasContent() {
      const article = doc.querySelector("article");
      const main = doc.querySelector("main");
      if (article && (article.textContent || "").trim().length >= MIN_CONTENT_LENGTH) {
        return true;
      }
      if (main && (main.textContent || "").trim().length >= MIN_CONTENT_LENGTH) {
        return true;
      }
      for (const selector of contentSelectors) {
        try {
          const el = doc.querySelector(selector);
          if (el && (el.textContent || "").trim().length >= MIN_CONTENT_LENGTH) {
            return true;
          }
        } catch (e) {
        }
      }
      const paragraphs = doc.querySelectorAll("p");
      let totalTextLength = 0;
      const paragraphArray = Array.from(paragraphs).slice(0, 10);
      for (const p of paragraphArray) {
        totalTextLength += (p.textContent || "").trim().length;
      }
      if (totalTextLength >= MIN_CONTENT_LENGTH) {
        return true;
      }
      return false;
    }
    if (hasContent()) {
      return;
    }
    const startTime = Date.now();
    while (Date.now() - startTime < MAX_WAIT_TIME) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
      if (hasContent()) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY));
        return;
      }
    }
  }

  // scripts/extraction/extractor/translate.js
  function detectGoogleTranslateState(doc) {
    try {
      const hasGoogleTranslateWidget = !!doc.querySelector(
        ".goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element"
      );
      const isTranslated = doc.body.classList.contains("translated-ltr") || doc.body.classList.contains("translated-rtl");
      const originalTextElements = doc.querySelectorAll("[data-original-text]");
      const gtOrigElements = doc.querySelectorAll("[data-gt-orig-display]");
      return {
        hasGoogleTranslateWidget,
        isTranslated,
        hasOriginalTextAttrs: originalTextElements.length > 0,
        hasGtOrigAttrs: gtOrigElements.length > 0,
        originalTextAttrsCount: originalTextElements.length,
        gtOrigAttrsCount: gtOrigElements.length,
        bodyClasses: doc.body.className,
        timestamp: Date.now()
      };
    } catch (e) {
      return {
        hasGoogleTranslateWidget: false,
        isTranslated: false,
        hasOriginalTextAttrs: false,
        hasGtOrigAttrs: false,
        originalTextAttrsCount: 0,
        gtOrigAttrsCount: 0,
        bodyClasses: "",
        timestamp: Date.now(),
        error: String(e)
      };
    }
  }
  function checkFirstParagraph(doc) {
    const firstP = doc.querySelector('main p, article p, [role="main"] p, #content p');
    if (!firstP) return null;
    const hasOriginalText = firstP.hasAttribute("data-original-text");
    const hasGtOrig = firstP.hasAttribute("data-gt-orig-display");
    const originalText = firstP.getAttribute("data-original-text");
    const currentText = firstP.textContent;
    return {
      hasOriginalTextAttr: hasOriginalText,
      hasGtOrigAttr: hasGtOrig,
      originalTextFull: originalText || null,
      currentTextFull: currentText || null,
      elementHTMLFull: firstP.innerHTML || null,
      textsMatch: originalText === currentText,
      timestamp: Date.now()
    };
  }
  function getOriginalTextIfTranslated(element) {
    if (!element) return null;
    const originalText = element.getAttribute("data-original-text");
    if (originalText && originalText.trim()) {
      const currentText = element.textContent || /** @type {HTMLElement} */
      element.innerText || "";
      if (originalText.trim() !== currentText.trim()) {
        return originalText.trim();
      }
    }
    return null;
  }

  // scripts/extraction/extractor/text-utils.js
  function cleanHeadingText(text) {
    return text ? text.replace(/\uFFFC/g, "").replace(/\s+/g, " ").trim() : "";
  }
  function stripObjMarkers(text) {
    if (!text) return "";
    return text.replace(/\uFFFC/g, "").replace(/\s+/g, " ").trim();
  }
  function cleanLatexFormula(latex) {
    if (!latex) return "";
    return latex.replace(/^\{\\displaystyle\s*(.+?)\}$/s, "$1").replace(/\\displaystyle\s*/g, "").replace(/^\{(.+)\}$/, "$1").trim();
  }
  function normalizeHeadingForDedup(text) {
    return stripObjMarkers(text).toLowerCase().trim();
  }
  function isRealHeading(element, win) {
    if (!element || !win) {
      return true;
    }
    const text = (element.textContent || "").trim();
    const cleanedText = cleanHeadingText(text);
    const tagName = element.tagName?.toLowerCase() || "unknown";
    let fontStyle = "normal";
    let fontSize = "";
    let fontWeight = "";
    let isItalic = false;
    let result = true;
    let reason = "";
    try {
      const style = win.getComputedStyle(element);
      fontStyle = style.fontStyle || "normal";
      fontSize = style.fontSize || "";
      fontWeight = style.fontWeight || "";
      isItalic = fontStyle === "italic" || fontStyle === "oblique";
      if (isItalic) {
        if (cleanedText.length < 20) {
          result = false;
          reason = `short italic text (${cleanedText.length} chars, italic)`;
        }
      }
    } catch (e) {
      reason = `style check failed: ${e.message}`;
    }
    return result;
  }

  // scripts/extraction/extractor/dom-utils.js
  var INTERFACE_REGIONS = 'nav,footer,dialog,[role~="navigation"],[role~="dialog"],[role~="alertdialog"],[aria-modal="true"]';
  function isExternalLinkAdornment(element) {
    const svg = element.closest("svg[data-extlink-placement]");
    if (!svg) return false;
    const placement = svg.getAttribute("data-extlink-placement");
    const link = placement === "after" ? svg.previousElementSibling : placement === "before" ? svg.nextElementSibling : null;
    return link?.matches("a[href][data-extlink]") === true;
  }
  function isPublisherLinkAction(element) {
    const sectionEdit = element.closest(".mw-editsection");
    if (sectionEdit?.querySelector("a[href]") && !sectionEdit.closest("pre,code,math")) return true;
    const link = element.closest("a[href]");
    if (!link) return false;
    if (link.matches('[rel~="me"]') && link.querySelector("svg,img,picture") && !link.closest("p,blockquote,pre,code,math,figure,figcaption,li,dd,dt,table")) {
      const label = link.cloneNode(true);
      for (
        const graphic of
        /** @type {Element} */
        label.querySelectorAll("svg,img,picture")
      ) graphic.remove();
      if (!label.textContent?.trim()) return true;
    }
    const caption = link.closest("figcaption");
    const actionLabel = (node) => Array.from(node.classList).some((name) => /^(?:image|media)[-_]download(?:[-_](?:link|button))?$/i.test(name));
    if (caption?.closest("figure")?.querySelector("img,picture") && (actionLabel(link) || link.parentElement !== caption && actionLabel(link.parentElement))) return true;
    const doc = link.ownerDocument;
    try {
      const target = new URL(link.getAttribute("href"), doc.baseURI);
      if (link.closest("[data-preferred-source]") && ["google.com", "www.google.com"].includes(target.hostname) && target.pathname === "/preferences/source") return true;
      const marked = link.hasAttribute("data-social-service") || /(?:^|\/)(?:share|sharer|shareArticle|intent)(?:[./]|$)/i.test(target.pathname);
      if (!marked || link.querySelector("figure,p,blockquote")) return false;
      const urls = [doc.URL, doc.querySelector('link[rel="canonical"]')?.getAttribute("href")].filter(Boolean).map((value) => new URL(value, doc.baseURI));
      for (const value of target.searchParams.values()) {
        for (const address of value.match(/https?:\/\/[^\s<>"']+/g) || []) {
          const shared = new URL(address);
          if (urls.some((url) => url.origin === shared.origin && url.pathname === shared.pathname)) return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }
  function toAbsoluteUrl(url, baseUrl) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    try {
      return new URL(url, baseUrl).href;
    } catch (e) {
      return url;
    }
  }
  function normalizeImageUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return parsed.href;
    } catch (e) {
      return url;
    }
  }
  function compareDomOrder(a, b) {
    const position = a.compareDocumentPosition(b);
    if (position & a.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & a.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  }
  function safeGetComputedStyle(win, element) {
    try {
      return win.getComputedStyle(element);
    } catch (e) {
      return null;
    }
  }
  function isElementVisible(win, element) {
    const style = safeGetComputedStyle(win, element);
    if (!style) return true;
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  }
  function safeClosest(element, selector) {
    try {
      return element.closest(selector);
    } catch (e) {
      return null;
    }
  }
  function isSourceExcluded(element, exclusions = []) {
    return exclusions.some((rule) => {
      try {
        const owner = typeof rule === "string" ? element.closest(rule) : rule.contains(element) ? rule : null;
        return !!owner && !(owner.matches("blockquote.twitter-tweet") && owner.textContent?.trim());
      } catch (_) {
        return true;
      }
    });
  }
  function readLazyMathPair(source, excluded2) {
    const math = source.firstElementChild;
    if (!source.matches("span") || source.children.length !== 1 || math.localName !== "math" || math.namespaceURI !== "http://www.w3.org/1998/Math/MathML" || !math.textContent?.trim() || Array.from(source.childNodes).some((node) => node !== math && (node.nodeType !== 3 || node.textContent?.trim()))) return null;
    const renderer = source.nextElementSibling;
    const placeholder = renderer?.firstElementChild;
    if (!renderer?.matches("mjx-container") || renderer.children.length !== 1 || !placeholder?.matches("mjx-lazy[data-mjx-lazy]") || placeholder.children.length !== 0 || renderer.textContent?.trim() || renderer.closest("pre,code,[hidden]") || excluded2(renderer) || [math, ...math.querySelectorAll("*")].some(excluded2)) return null;
    const win = renderer.ownerDocument.defaultView;
    const style = win && safeGetComputedStyle(win, renderer);
    if (style?.display === "none" || ["hidden", "collapse"].includes(style?.visibility)) return null;
    for (let node = source.nextSibling; node !== renderer; node = node.nextSibling) {
      if (node.nodeType !== 3 || node.textContent?.trim()) return null;
    }
    return { renderer };
  }
  function isHiddenMathSource(source, style) {
    if (!source.matches("span") || source.firstElementChild?.localName !== "math") return false;
    if (style?.display === "none" || /** @type {HTMLElement} */
    source.style.display === "none" || source.hasAttribute("hidden")) return true;
    if (style?.position !== "absolute" && style?.position !== "fixed") return false;
    const clipped = /^rect\(0px,0px,0px,0px\)$/u.test((style.clip || "").replace(/\s/gu, "")) || style.clipPath === "inset(50%)" || [style.overflowX, style.overflowY].every((value) => /^(?:hidden|clip)$/u.test(value));
    if (!clipped) return false;
    const { width, height } = source.getBoundingClientRect();
    return width > 0 && width <= 1 && height > 0 && height <= 1;
  }
  function cloneReadingContent(element, exclusions = [], copyMap = null, { disclosed = false } = {}) {
    const clone = element.cloneNode(true);
    copyMap?.set(element, clone);
    const win = element.ownerDocument.defaultView;
    const excluded2 = (node) => {
      const region = node.closest(INTERFACE_REGIONS);
      return region && !(disclosed && region === element) || isExternalLinkAdornment(node) || isPublisherLinkAction(node) || isSourceExcluded(node, exclusions) || win && isHiddenSlotAssignment(win, node);
    };
    if (excluded2(element)) {
      clone.replaceChildren();
      return clone;
    }
    const originals = Array.from(element.querySelectorAll("*"));
    const copies = Array.from(clone.querySelectorAll("*"));
    const rootStyle = disclosed && win ? safeGetComputedStyle(win, element) : null;
    const hidden2 = (value) => value === "hidden" || value === "collapse";
    const disclosureVisibility = hidden2(rootStyle?.visibility) ? rootStyle.visibility : null;
    const inheritsDisclosureVisibility = new Set(disclosureVisibility ? [element] : []);
    for (let index = 0; index < originals.length; index++) copyMap?.set(originals[index], copies[index]);
    for (let index = 0; index < originals.length; index++) {
      const original = originals[index], copy = copies[index];
      if (excluded2(original)) {
        copy.remove();
        continue;
      }
      const literal = original.closest("pre,code,math,mjx-container,.MathJax,.katex");
      const style = original.ownerDocument.defaultView ? safeGetComputedStyle(original.ownerDocument.defaultView, original) : null;
      if (!literal && isHiddenMathSource(original, style)) {
        const pair = readLazyMathPair(original, excluded2);
        const rendererCopy = pair && copies[originals.indexOf(pair.renderer, index + 1)];
        if (rendererCopy) {
          rendererCopy.replaceChildren(copy.firstElementChild);
          copy.remove();
          continue;
        }
      }
      if (!literal && (original.matches("script,style,template,noscript,input,select,textarea") || style?.display === "none" || !style && original.hasAttribute("hidden"))) {
        copy.remove();
        continue;
      }
      const ownVisibility = (
        /** @type {HTMLElement} */
        original.style?.visibility
      );
      if (disclosureVisibility === style?.visibility && !hidden2(ownVisibility) && inheritsDisclosureVisibility.has(original.parentElement)) inheritsDisclosureVisibility.add(original);
      const textHidden = !literal && hidden2(style?.visibility) && !inheritsDisclosureVisibility.has(original);
      if (textHidden) {
        for (const child of Array.from(copy.childNodes)) if (child.nodeType === 3) child.remove();
      }
      const originalText = original.getAttribute("data-original-text");
      if (!textHidden && originalText?.trim()) copy.textContent = originalText;
      if (!literal && original.matches(".screen-reader-text,.screen-reader-only,.sr-only,.visually-hidden") && original.closest("a") && !original.closest("mjx-assistive-mml") && !original.querySelector("math,mjx-assistive-mml,.MathJax,.katex")) {
        let label = (copy.textContent || "").trim().replace(/\s+/g, " ").toLowerCase();
        if (label.startsWith("(") && label.endsWith(")")) label = label.slice(1, -1).trim();
        if (/^opens(?: in)? a new (?:tab|window)$/.test(label)) {
          copy.remove();
          continue;
        }
      }
      if (!original.matches("span,a,button,b,i,em,strong,small,sup,sub") || original.closest("pre,code,math,mjx-container,.MathJax,.katex")) continue;
      const adjacentText = original.nextSibling?.textContent || "";
      if (/^(?:left|right|inline-start|inline-end)$/.test(style?.float || "") && new RegExp("^\\p{L}\\p{M}*$", "u").test(original.textContent || "") && /^[\p{L}\p{N}]/u.test(adjacentText)) continue;
      const parentStyle = original.parentElement && original.ownerDocument.defaultView?.getComputedStyle(original.parentElement);
      if (["block", "flex", "grid", "table", "table-row"].includes(style?.display) || ["flex", "grid"].includes(parentStyle?.display)) {
        copy.before(clone.ownerDocument.createElement("br"), "\n");
        copy.after(clone.ownerDocument.createElement("br"), "\n");
      } else {
        if (parseFloat(style?.marginInlineStart) > 0) copy.before(" ");
        if (parseFloat(style?.marginInlineEnd) > 0) copy.after(" ");
      }
    }
    return clone;
  }
  function isHiddenSlotAssignment(win, element) {
    for (let slot = element.assignedSlot; slot; slot = slot.assignedSlot) {
      for (let parent = slot; parent; parent = parent.parentElement) {
        if (safeGetComputedStyle(win, parent)?.display === "none") return true;
      }
    }
    return false;
  }
  function readSourceFragmentIds(element, exclusions = []) {
    if (!element || isSourceExcluded(element, exclusions)) return [];
    const copies = /* @__PURE__ */ new Map();
    const root = cloneReadingContent(element, exclusions, copies);
    const document2 = element.ownerDocument;
    const ids = /* @__PURE__ */ new Set();
    for (const [source, copy] of copies) {
      if (!root.contains(copy)) continue;
      if (source.id && document2.getElementById(source.id) === source) ids.add(source.id);
      const name = source.matches("a[name]") ? source.getAttribute("name") : "";
      if (name && !document2.getElementById(name) && [...document2.getElementsByName(name)].find((node) => node.matches("a")) === source) ids.add(name);
    }
    return [...ids];
  }
  function getDocumentFragmentTarget(element) {
    const href = element.getAttribute("href");
    if (!href) return null;
    try {
      const document2 = element.ownerDocument;
      const target = new URL(href, document2.baseURI);
      const source = new URL(document2.URL);
      if (!target.hash || target.origin !== source.origin || target.pathname !== source.pathname || target.search !== source.search) return null;
      return document2.getElementById(decodeURIComponent(target.hash.slice(1)));
    } catch (_) {
      return null;
    }
  }
  function isDocumentNoteReference(reference) {
    if (reference.closest("pre,code,math,mjx-container,.MathJax,.katex")) return false;
    if (reference.matches('[data-footnote-ref],[role="doc-noteref"]') || (reference.getAttribute("epub:type") || "").split(/\s+/).includes("noteref")) return true;
    if (!/^\[?\d+\]?$/.test(reference.textContent?.trim() || "")) return false;
    const target = getDocumentFragmentTarget(reference);
    if (!target) return false;
    if (target.closest('[role="doc-footnote"],[role="doc-endnote"],[role="doc-endnotes"]') || ["footnote", "endnote"].some((type) => (target.getAttribute("epub:type") || "").split(/\s+/).includes(type))) return true;
    const carrier = reference.closest("sup");
    if (!carrier) return false;
    return Array.from(target.querySelectorAll("a[href]")).some((backlink) => {
      const destination = getDocumentFragmentTarget(backlink);
      return destination === reference || destination === carrier;
    });
  }
  function cloneWithoutRepeatedNoteTooltips(element, referenceRoots = null, excludedSelectors = [], copyMap = null) {
    const clone = cloneReadingContent(element, excludedSelectors, copyMap);
    for (const reference of Array.from(clone.querySelectorAll("a[href]"))) {
      if (!isDocumentNoteReference(reference)) continue;
      const target = getDocumentFragmentTarget(reference);
      if (!target || element.contains(target)) continue;
      if (referenceRoots && !referenceRoots.some((root) => root.contains(target))) continue;
      if (isSourceExcluded(target, excludedSelectors)) continue;
      const canonical = target.cloneNode(true);
      for (const backlink of Array.from(canonical.querySelectorAll("a"))) {
        if (backlink.getAttribute("role") === "doc-backlink" || /^[\s↩︎↩←↑]+$/.test(backlink.textContent || "")) backlink.remove();
      }
      const noteText = (node) => {
        const copy = node.cloneNode(true);
        const marker = copy.firstElementChild;
        if (marker?.tagName === "SUP" && /^\d+$/.test(marker.textContent?.trim() || "")) marker.remove();
        return (copy.textContent || "").replace(/\s+/g, " ").trim();
      };
      const canonicalText = noteText(canonical);
      const owner = reference.closest("sup") || reference.parentElement;
      for (const tooltip of Array.from(owner?.querySelectorAll('[aria-hidden="true"], [hidden], [role="tooltip"]') || [])) {
        if (canonicalText && noteText(tooltip) === canonicalText) tooltip.remove();
      }
    }
    return clone;
  }
  function readArticleMetadataText(element, exclusions = []) {
    if (!element) return "";
    for (let node = element; node; node = node.parentElement) {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (style?.display === "none" || !style && node.hasAttribute("hidden")) return "";
    }
    const clone = cloneWithoutRepeatedNoteTooltips(element, null, exclusions);
    for (const control of Array.from(clone.querySelectorAll(".mw-editsection"))) {
      if (!control.closest("pre,code,math,mjx-container,.MathJax,.katex")) control.remove();
    }
    for (const node of Array.from(clone.querySelectorAll("[hidden]"))) {
      if (!node.closest("math, .MathJax, .katex, mjx-container")) node.remove();
    }
    for (const reference of Array.from(clone.querySelectorAll("a[href]"))) {
      const marker = reference.textContent?.trim();
      const target = /^[#\u00b6\u00a7]$/u.test(marker || "") ? getDocumentFragmentTarget(reference) : null;
      if (target && (target === element || target.contains(element) && target.querySelector("h1,h2,h3,h4,h5,h6") === element) && !reference.closest("pre,code,math,mjx-container,.MathJax,.katex")) {
        reference.remove();
        continue;
      }
      if (isDocumentNoteReference(reference)) {
        (reference.closest("sup") || reference).remove();
      }
    }
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  // scripts/extraction/extractor/metadata.js
  function isValidArticleTitle(h1Element) {
    if (!h1Element || !h1Element.textContent) return false;
    const text = readArticleMetadataText(h1Element);
    if (text.length < 5) return false;
    const siteNamePatterns = ["home", "about", "contact", "blog", "news", "archive"];
    const lowerText = text.toLowerCase();
    if (siteNamePatterns.some((pattern) => lowerText === pattern)) return false;
    return true;
  }
  function extractAuthorFromUrl(url) {
    if (!url) return null;
    try {
      const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
      if (profileMatch) {
        const slug = profileMatch[1];
        const parts = slug.split(/[-_]/);
        if (parts.length > 1) {
          const name2 = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
          if (name2.length > 2 && name2.length < 100) return name2;
        }
        const camelCaseMatch = slug.match(/^([a-z]+)([A-Z][a-z]*)$/);
        if (camelCaseMatch) {
          const name2 = [
            camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
            camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
          ].join(" ");
          if (name2.length > 2 && name2.length < 100) return name2;
        }
        const name = slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase();
        if (name.length > 2 && name.length < 100) return name;
      }
    } catch (e) {
    }
    return null;
  }
  function getMonthNumber(monthName) {
    const months = {
      "january": "01",
      "jan": "01",
      "february": "02",
      "feb": "02",
      "march": "03",
      "mar": "03",
      "april": "04",
      "apr": "04",
      "may": "05",
      "june": "06",
      "jun": "06",
      "july": "07",
      "jul": "07",
      "august": "08",
      "aug": "08",
      "september": "09",
      "sep": "09",
      "sept": "09",
      "october": "10",
      "oct": "10",
      "november": "11",
      "nov": "11",
      "december": "12",
      "dec": "12"
    };
    const name = monthName.toLowerCase();
    return Object.hasOwn(months, name) ? months[name] : null;
  }
  function validatedCalendarDate(date) {
    const value = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
    return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date ? date : null;
  }
  function parseDateToISO(dateStr) {
    const input = dateStr?.trim();
    if (!input) return null;
    const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}(?=$|[Tt\s])/);
    if (isoMatch) return validatedCalendarDate(isoMatch[0]);
    if (/^\d{4}(?:-\d{2})?$/.test(input)) {
      return /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(input) ? input : null;
    }
    const namedDate = input.match(/\b(?<day>\d{1,2})(?:st|nd|rd|th)?\s+(?<name>[a-z]+)\s+(?<year>\d{4})\b/i) || input.match(/\b(?<name>[a-z]+)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?<year>\d{4})\b/i);
    if (namedDate?.groups) {
      const { day: day2, name, year: year2 } = namedDate.groups;
      const month2 = getMonthNumber(name);
      if (month2) return validatedCalendarDate(`${year2}-${month2}-${day2.padStart(2, "0")}`);
    }
    const monthYear = input.match(/^(?:published\s+(?:in\s+)?)?([a-z]+)\s+(\d{4})$/i);
    if (monthYear) {
      const month2 = getMonthNumber(monthYear[1]);
      if (month2) return `${monthYear[2]}-${month2}`;
    }
    const date = new Date(input);
    if (!Number.isFinite(date.getTime())) return null;
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return validatedCalendarDate(`${year}-${month}-${day}`);
  }
  function readPublicationDate(root, selectors) {
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const parsed = readDateElement(element);
        if (parsed) return parsed;
      }
    }
    return "";
  }
  function readDateElement(element) {
    return parseDateToISO(element.getAttribute("content") || element.getAttribute("datetime") || element.textContent);
  }
  function readStructuredArticleMetadata(doc, baseUrl) {
    const records = [];
    for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const data = JSON.parse(script.textContent || "");
        const pending = [data];
        while (pending.length) {
          const record = pending.shift();
          if (!record || typeof record !== "object") continue;
          if (Array.isArray(record)) {
            pending.push(...record);
            continue;
          }
          records.push(record);
          pending.push(...Object.values(record).filter((value) => value && typeof value === "object"));
        }
      } catch (_) {
      }
    }
    const absoluteId = (value) => {
      try {
        return typeof value === "string" && value.trim() ? new URL(value, baseUrl).href : "";
      } catch (_) {
        return "";
      }
    };
    const pageIdentity = (value) => {
      try {
        const url = new URL(value, baseUrl);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        url.hash = "";
        return url.href;
      } catch (_) {
        return "";
      }
    };
    const pages = new Set([baseUrl, doc.URL, doc.querySelector('link[rel="canonical"]')?.getAttribute("href")].filter(Boolean).map(pageIdentity).filter(Boolean));
    const byId = /* @__PURE__ */ new Map();
    const conflictingIds = /* @__PURE__ */ new Set();
    const comparable = (value) => {
      if (Array.isArray(value)) return value.map(comparable);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, key === "@id" ? absoluteId(value[key]) : comparable(value[key])]));
    };
    for (const record of records) {
      const id = absoluteId(record["@id"]);
      if (!id) continue;
      byId.set(id, { ...byId.get(id), ...record });
    }
    const resolve = (value) => value && typeof value === "object" && value["@id"] ? { ...byId.get(absoluteId(value["@id"])), ...value } : value;
    const values = (value) => Array.isArray(value) ? value : [value];
    const identities = (value) => values(value).flatMap((item) => {
      const resolved = resolve(item);
      return typeof resolved === "string" ? [resolved] : resolved?.url ? values(resolved.url).filter((url) => typeof url === "string") : typeof resolved?.["@id"] === "string" ? [resolved["@id"]] : [];
    });
    const matchesPage = (value) => identities(value).some((identity) => pages.has(pageIdentity(identity)));
    const metadataValue = (field, value) => {
      if (field === "url" || field === "mainEntityOfPage") return identities(value).map((identity) => pageIdentity(identity) || absoluteId(identity));
      if (field === "datePublished" && typeof value === "string") return parseDateToISO(value);
      if (field === "author") return values(value).map((author) => {
        if (typeof author === "string") return byId.get(absoluteId(author))?.name || author;
        return resolve(author)?.name || absoluteId(author?.["@id"]);
      });
      return comparable(value);
    };
    const assertions = /* @__PURE__ */ new Map();
    for (const record of records) {
      const id = absoluteId(record["@id"]);
      if (!id) continue;
      const previous = assertions.get(id) || {};
      for (const field of ["author", "datePublished", "url", "mainEntityOfPage", "name", "headline"]) {
        if (record[field] === void 0) continue;
        const value = JSON.stringify(metadataValue(field, record[field]));
        if (previous[field] !== void 0 && previous[field] !== value) conflictingIds.add(id);
        previous[field] = value;
      }
      assertions.set(id, previous);
    }
    const hasType = (record, pattern) => values(record?.["@type"]).some((type) => typeof type === "string" && pattern.test(type));
    const currentPageSubjects = /* @__PURE__ */ new Set();
    const inlineSubjects = /* @__PURE__ */ new Set();
    for (const record of records) {
      if (!hasType(record, /WebPage$/) || !matchesPage(record.url || record["@id"])) continue;
      for (const subject of values(record.mainEntity)) {
        const id = absoluteId(typeof subject === "string" ? subject : subject?.["@id"]);
        if (id) currentPageSubjects.add(id);
        if (subject && typeof subject === "object") inlineSubjects.add(subject);
      }
    }
    const title = (readArticleMetadataText(doc.querySelector("article h1,main h1,h1")) || doc.title || "").replace(/\s+/g, " ").trim();
    const candidates = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const source of records) {
      const record = resolve(source);
      if (!hasType(record, /(?:Article|BlogPosting)$/)) continue;
      const id = absoluteId(record["@id"]);
      if (id && conflictingIds.has(id)) continue;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      let rank;
      if (identities(record.mainEntityOfPage).length) {
        if (!matchesPage(record.mainEntityOfPage)) continue;
        rank = 4;
      } else if (id && currentPageSubjects.has(id) || inlineSubjects.has(source)) {
        rank = 4;
      } else if (identities(record.url).length) {
        if (!matchesPage(record.url)) continue;
        rank = 3;
      } else if (id && pageIdentity(id)) {
        if (!pages.has(pageIdentity(id))) continue;
        rank = 2;
      } else if (id) continue;
      else rank = 0;
      const headlineMatches = typeof record.headline === "string" && record.headline.replace(/\s+/g, " ").trim() === title;
      candidates.push({ record, rank, headlineMatches });
    }
    candidates.sort((a, b) => b.rank - a.rank || Number(b.headlineMatches) - Number(a.headlineMatches));
    const chosen = candidates[0];
    const empty = { author: "", publishDate: "" };
    if (!chosen || candidates.some((candidate, index) => index > 0 && candidate.rank === chosen.rank && candidate.headlineMatches === chosen.headlineMatches && JSON.stringify(comparable([candidate.record.author, candidate.record.datePublished])) !== JSON.stringify(comparable([chosen.record.author, chosen.record.datePublished])))) return empty;
    const article = chosen.record;
    const names = values(article.author).map((author) => {
      if (typeof author === "string") {
        if (conflictingIds.has(absoluteId(author))) return "";
        const referenced = byId.get(absoluteId(author));
        return referenced?.name || (/^(?:https?:|urn:|#)/i.test(author) ? "" : author);
      }
      if (conflictingIds.has(absoluteId(author?.["@id"]))) return "";
      return resolve(author)?.name;
    }).filter((name) => typeof name === "string").map((name) => name.trim()).filter(Boolean);
    return { author: names.join(", "), publishDate: typeof article.datePublished === "string" ? parseDateToISO(article.datePublished) || "" : "" };
  }
  function isAuthorCandidateDisplayed(element) {
    for (let node = element; node; node = node.parentElement) {
      const style = safeGetComputedStyle(element.ownerDocument.defaultView, node);
      if (style?.display === "none" || !style && node.hasAttribute("hidden")) return false;
    }
    return true;
  }
  function isArticleAuthorCandidate(element) {
    if (!isAuthorCandidateDisplayed(element) || element.closest("figure, figcaption")) return false;
    for (let node = element; node; node = node.parentElement) {
      const types = (node.getAttribute("itemtype") || "").split(/\s+/);
      if (types.some((type) => /^https?:\/\/schema\.org\/(ImageObject|VideoObject|AudioObject)\/?$/.test(type))) return false;
    }
    return true;
  }
  function readAuthorProfileName(element, baseUrl) {
    const readLabel = (node) => readArticleMetadataText(node).replace(/^by\s+/i, "").trim();
    const label = readLabel(element);
    const anchor = element.closest("a[href]");
    const initials = label.replace(/[\s.\u00b7-]/g, "");
    if (!anchor || !new RegExp("^\\p{Lu}{1,4}$", "u").test(initials)) return label;
    let identity;
    try {
      identity = new URL(anchor.getAttribute("href"), baseUrl).href;
    } catch (_) {
      return label;
    }
    for (const candidate of Array.from(element.ownerDocument.querySelectorAll("a[href]"))) {
      if (!isArticleAuthorCandidate(candidate)) continue;
      try {
        if (new URL(candidate.getAttribute("href"), baseUrl).href !== identity) continue;
      } catch (_) {
        continue;
      }
      const name = readLabel(candidate);
      const words = name.match(/[\p{L}\p{M}]+/gu) || [];
      if (words.length < 2 || name.length >= 100) continue;
      const letters = words.map((word) => Array.from(word)[0].toUpperCase());
      if (letters.join("") === initials || letters[0] + letters[letters.length - 1] === initials || initials.length === 1 && letters[0] === initials) return name;
    }
    return label;
  }
  function extractMetadata(doc, baseUrl, titleElement = findArticleTitleElement(doc)) {
    const metadata = {
      title: titleElement ? cleanHeadingText(readArticleMetadataText(titleElement)) : doc.title || "",
      author: "",
      publishDate: ""
    };
    const authorSelectors = [
      'meta[name="author"]',
      'meta[name="citation_author"]',
      'meta[property="article:author"]',
      '[rel="author"]',
      ".author",
      ".byline",
      ".meta-author",
      '[itemprop="author"]',
      'a[rel="author"]'
    ];
    for (const selector of authorSelectors) {
      try {
        const elements = Array.from(doc.querySelectorAll(selector));
        if (selector === 'meta[name="citation_author"]') {
          const names = elements.map((element) => (element.getAttribute("content") || "").normalize("NFC").replace(/\s+/g, " ").trim()).filter((name) => name && !/^https?:/i.test(name) && name.length < 100);
          if (names.length) {
            metadata.author = [...new Set(names)].join(", ");
            break;
          }
        }
        for (const element of elements) {
          if (element.tagName !== "META" && !isArticleAuthorCandidate(element)) continue;
          let authorText = "";
          if (element.tagName === "META") {
            authorText = element.getAttribute("content") || "";
          } else {
            authorText = readAuthorProfileName(element, baseUrl);
          }
          authorText = authorText.replace(/^by\s+/i, "").trim();
          if (authorText && !authorText.startsWith("http") && authorText.length < 100) {
            metadata.author = authorText;
            break;
          }
          if (element.tagName === "A") {
            const href = element.getAttribute("href") || "";
            const extracted = extractAuthorFromUrl(href);
            if (extracted) {
              metadata.author = extracted;
              break;
            }
          }
        }
        if (metadata.author) break;
      } catch (e) {
      }
    }
    const structured = readStructuredArticleMetadata(doc, baseUrl);
    if (!metadata.author) metadata.author = structured.author;
    if (!metadata.author) {
      for (const element of Array.from(doc.querySelectorAll('a[href*="/author/"], a[href*="/profile/"]'))) {
        try {
          if (new URL(element.getAttribute("href"), baseUrl).origin !== new URL(baseUrl).origin) continue;
          if (!isArticleAuthorCandidate(element)) continue;
          const text = readAuthorProfileName(element, baseUrl);
          if (text && !text.startsWith("http") && text.length < 100) {
            metadata.author = text;
            break;
          }
        } catch (_) {
        }
      }
    }
    metadata.publishDate = readPublicationDate(doc, [
      'meta[property="article:published_time"]',
      'meta[name="datePublished"]',
      'meta[name="citation_date"]',
      '[itemprop="datePublished"]',
      "time[pubdate]"
    ]) || structured.publishDate || readPublicationDate(doc, ['meta[name="date"]']);
    if (!metadata.publishDate) {
      const article = titleElement?.closest("article, main");
      const titleHeader = titleElement?.closest("header");
      const header = article?.contains(titleHeader) ? titleHeader : article?.querySelector(":scope > header");
      if (header) metadata.publishDate = readPublicationDate(header, ["time[datetime]", ".published", ".date", ".meta-date"]);
      if (!metadata.publishDate && article) {
        const next = titleElement?.nextElementSibling;
        metadata.publishDate = next?.matches("time[datetime],.published,.meta-date") && readDateElement(next) || readPublicationDate(article, [":scope > .published", ":scope > .meta-date"]);
      }
    }
    return metadata;
  }
  function findArticleTitleElement(doc) {
    for (const selector of ["article h1", "main h1", "h1"]) {
      const heading = doc.querySelector(selector);
      if (heading && isValidArticleTitle(heading)) return heading;
    }
    return null;
  }

  // scripts/extraction/extractor/reading-context.js
  var DECLARED_BODY = '[itemprop~="articleBody"],.instapaper_body';
  var EDITORIAL_CONTAINERS = 'article,[role~="article"],' + DECLARED_BODY;
  var HEADINGS = "h1,h2,h3,h4,h5,h6";
  var RELATED_HEADING = /^(?:related (?:articles|stories|(?:blog )?posts)|recommended (?:articles|stories|posts)|most (?:read|viewed)|you (?:may|might) also like|also in .+)$/i;
  var normalizedLabel = (value) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();
  function isSemanticReadingScope(element) {
    return element.matches(EDITORIAL_CONTAINERS + ',main,[role~="main"]');
  }
  function ownHeadings(element) {
    return Array.from(element.querySelectorAll("h1")).filter((heading) => heading.closest(EDITORIAL_CONTAINERS) === element && !heading.closest(INTERFACE_REGIONS));
  }
  function isDocumentHeadline(heading) {
    if (!heading || heading.closest(INTERFACE_REGIONS)) return false;
    const doc = heading.ownerDocument;
    const label = normalizedLabel(readArticleMetadataText(heading));
    const titles = [doc.title, doc.querySelector('meta[property="og:title"]')?.getAttribute("content")].map(normalizedLabel);
    return !!label && titles.some((title) => title === label || [" | ", " — ", " – ", " - "].some((separator) => title.startsWith(label + separator)));
  }
  function isEditorialOwner(element) {
    if (!element?.matches(EDITORIAL_CONTAINERS) || element.closest(INTERFACE_REGIONS)) return false;
    if (element.matches(DECLARED_BODY)) return true;
    const doc = element.ownerDocument;
    const headings = ownHeadings(element);
    if (headings.some(isDocumentHeadline)) return true;
    if (headings.length !== 1 || !normalizedLabel(headings[0].textContent) || doc.querySelector('meta[property="og:type"]')?.getAttribute("content")?.toLowerCase() !== "article") return false;
    return !Array.from(doc.querySelectorAll('article,[role~="article"]')).some((other) => other !== element && ownHeadings(other).some((heading) => normalizedLabel(heading.textContent)));
  }
  function isEditorialLayoutLabel(region, source, role) {
    if (role === "modal") {
      if (!isSemanticReadingScope(region) || region.closest(INTERFACE_REGIONS)) return false;
    } else if (role !== "newsletter" && role !== "sidebar" && role !== "header") return false;
    if (region.matches('aside,[role~="complementary"],[role~="banner"]')) return false;
    if (role === "header" && region.closest('main,[role~="main"],article,[role~="article"]') && Array.from(region.querySelectorAll("h1")).some(isDocumentHeadline)) {
      return true;
    }
    if (region.matches("header")) return false;
    if (region.id.toLowerCase() === role || Array.from(region.classList).some((name) => name.toLowerCase() === role)) return false;
    if (role === "sidebar") {
      const labels = [region.id, ...Array.from(region.classList)].filter((name) => /(?:^|[-_])sidebar(?:$|[-_])/i.test(name));
      if (labels.length && labels.every((name) => /^(?:has|no|non|with|without)[-_]sidebar(?:[-_](?:content|layout|body|main))?$/i.test(name))) return true;
    }
    if (role === "modal") {
      const modalLabel = /(?:^|[_-])modal(?:$|[_-])/i;
      const hooks = Array.from(region.classList).filter((name) => modalLabel.test(name));
      if (!modalLabel.test(region.id) && hooks.length && hooks.every((name) => /^js-/i.test(name))) return true;
    }
    const owner = source.closest(EDITORIAL_CONTAINERS);
    return isEditorialOwner(owner) && (region === owner || role !== "newsletter" && region.contains(owner));
  }
  function isReferencedReadingAside(element, roots, tocRoots = []) {
    if (!element.matches('aside[id],[role~="complementary"][id]')) return false;
    const heading = element.querySelector("h2,h3,h4,h5,h6");
    const label = normalizedLabel(heading?.textContent);
    if (!label || !element.querySelector("p,blockquote,ul,ol,figure,table")) return false;
    const articleRoots = roots.filter((root) => !root.matches("body,html"));
    if (!articleRoots.some((root) => root.contains(element))) return false;
    return [...articleRoots, ...tocRoots].some((root) => Array.from(root.querySelectorAll('a[href*="#"]')).some((link) => !element.contains(link) && normalizedLabel(link.textContent) === label && getDocumentFragmentTarget(link) === element));
  }
  function isReadingOwned(element, roots = []) {
    return (roots || []).some((root) => root.contains(element));
  }
  function linkedArticlePreview(element) {
    if (!element.matches('article,[role~="article"]') || isEditorialOwner(element) || element.querySelector('article,[role~="article"],table,pre,blockquote,math')) return null;
    const doc = element.ownerDocument;
    const body = Array.from(element.querySelectorAll("p")).filter((node) => !node.closest("figcaption,header,footer") && normalizedLabel(node.textContent).length >= 60);
    if (body.length > 1 || body.some((node) => normalizedLabel(node.textContent).length >= 260)) return null;
    const actions = Array.from(element.querySelectorAll("a[href]")).filter((link) => !link.closest("nav,figcaption,p") && !!normalizedLabel(link.textContent));
    const title = element.querySelector(HEADINGS);
    const tail = actions.at(-1);
    const action = actions.find((link) => link.matches('[rel~="bookmark"]') || title?.contains(link) || title && link.contains(title)) || (actions.length === 1 || tail && title && title.compareDocumentPosition(tail) & title.DOCUMENT_POSITION_FOLLOWING ? tail : null);
    if (!action) return null;
    try {
      const url = new URL(action.getAttribute("href"), doc.baseURI);
      const page = new URL(doc.URL);
      return /^https?:$/.test(url.protocol) && (url.origin !== page.origin || url.pathname !== page.pathname) ? url.href : null;
    } catch {
      return null;
    }
  }
  function findRecommendationRegions(root) {
    const regions = [];
    const linkedTargets = new Set(Array.from(root.querySelectorAll('a[href*="#"]'), getDocumentFragmentTarget));
    const page = new URL(root.ownerDocument.URL);
    page.hash = "";
    function linkedPage(heading) {
      const link = heading.closest("a[href]") || heading.querySelector("a[href]");
      if (!link) return null;
      try {
        const url = new URL(link.getAttribute("href"), root.ownerDocument.baseURI);
        url.hash = "";
        return /^https?:$/.test(url.protocol) && url.href !== page.href ? url.href : null;
      } catch {
        return null;
      }
    }
    for (const label of Array.from(root.querySelectorAll(HEADINGS))) {
      if (label.tagName === "H1" || !RELATED_HEADING.test(normalizedLabel(label.textContent)) || linkedTargets.has(label) || label.closest("pre,blockquote,figcaption,a")) continue;
      for (let region = label.parentElement; region && region !== root; region = region.parentElement) {
        if (linkedTargets.has(region) || region.querySelector('table,pre,blockquote,math,[role~="doc-bibliography"],[role~="doc-endnotes"]')) break;
        const headings = Array.from(region.querySelectorAll(HEADINGS));
        if (headings[0] !== label) break;
        const cards = headings.slice(1);
        const destinations = cards.map(linkedPage);
        if (destinations.includes(null) || cards.some((heading) => linkedTargets.has(heading))) break;
        if (new Set(destinations).size < 2) continue;
        if (containsOnlyCardText(region, label, cards)) regions.push(region);
        break;
      }
    }
    const previews = Array.from(root.querySelectorAll('article,[role~="article"]'), (element) => ({ element, href: linkedArticlePreview(element) })).filter(({ element, href }) => href && !Array.from(linkedTargets).some((target) => target && element.contains(target)));
    const previewOwners = new Set(previews.map(({ element }) => element));
    for (const { element } of previews) {
      let collection = null;
      for (let region = element.parentElement; region && region !== root; region = region.parentElement) {
        if (linkedTargets.has(region)) break;
        const cards = previews.filter((card) => region.contains(card.element));
        if (new Set(cards.map((card) => card.href)).size < 2) continue;
        const labels = Array.from(region.querySelectorAll(HEADINGS)).filter((node) => !cards.some((card) => card.element.contains(node)));
        if (labels.length > 1 || labels.some((node) => node.tagName === "H1" || linkedTargets.has(node)) || !containsOnlyCardText(region, labels[0], cards.map((card) => card.element), previewOwners)) break;
        collection = region;
      }
      if (collection) regions.push(collection);
    }
    return [...new Set(regions)];
  }
  function containsOnlyCardText(region, label, cards, previewOwners = null) {
    const walker = region.ownerDocument.createTreeWalker(region, region.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || label?.contains(node) || node.parentElement?.closest('script,style,template,noscript,button,[role="button"]')) continue;
      if (previewOwners) {
        if (!previewOwners.has(node.parentElement?.closest('article,[role~="article"]'))) return false;
        continue;
      }
      let count = 0;
      for (let owner = node.parentElement; owner && owner !== region && count === 0; owner = owner.parentElement) {
        count = cards.filter((card) => owner.contains(card)).length;
      }
      if (count !== 1) return false;
    }
    return true;
  }
  function isLayoutTable(element) {
    if (!element || element.tagName !== "TABLE") return false;
    if (["presentation", "none"].includes(element.getAttribute("role") || "")) return true;
    if (element.querySelector("th,thead") || !element.querySelector("h1,h2,h3")) return false;
    const rows = Array.from(
      /** @type {HTMLTableElement} */
      element.rows
    ).filter((row) => row.closest("table") === element);
    return rows.length > 0 && rows.every((row) => row.cells.length === 1 && row.cells[0].colSpan === 1);
  }
  function isFlowContainer(element) {
    return ["DIV", "ARTICLE", "SECTION", "MAIN", "ASIDE", "BODY", "DL", "DT", "DD", "TD", "TH"].includes(element.tagName);
  }

  // scripts/extraction/extractor/discover.js
  function isArticleContentFigure(win, element) {
    const figure = element.closest("figure");
    if (!figure || !figure.querySelector("img") || !(figure.querySelector("figcaption")?.textContent || "").trim()) return false;
    const body = figure.closest(".post-content, .post__content, .article-content, .entry-content, .article-body, .wysiwyg");
    if (!body) return false;
    const owner = body.closest('article, [itemprop~="articleBody"], .post, .article, .entry');
    if (!owner) return false;
    if (!owner.matches('article, [itemprop~="articleBody"]')) {
      const title = (win.document.title || "").trim().toLowerCase();
      if (!Array.from(owner.querySelectorAll("h1")).some((heading) => {
        const text = (heading.textContent || "").trim().toLowerCase();
        return text.length > 0 && (title === text || [" | ", " — ", " – ", " - "].some((separator) => title.startsWith(text + separator)));
      })) return false;
    }
    for (let node = figure; node && node !== owner; node = node.parentElement) {
      if (node.matches('nav, footer, [role="navigation"], [hidden], [aria-hidden="true"]')) return false;
      if (/(?:^|[\s_-])(?:comments?|related|recommended|recommendations?|newsletter|advertisement|advertising|ads?|sponsored?|social|share|author|byline|contributor)(?:$|[\s_-])/i.test(`${node.id} ${node.getAttribute("class") || ""}`)) return false;
      for (const name of ["data-module", "data-component", "data-type"]) {
        if (/^(?:ad|advertisement)$/i.test(node.getAttribute(name) || "")) return false;
      }
    }
    return Array.from(body.querySelectorAll("p")).some((paragraph) => !paragraph.closest("aside, figure") && (paragraph.textContent || "").trim().length >= 20);
  }
  function isOutsideArticleBody(element, owner) {
    const contentFigure = isArticleContentFigure(owner.ownerDocument.defaultView, element);
    for (let node = element; node && node !== owner; node = node.parentElement) {
      if (node.matches('nav, footer, [role="navigation"], [hidden], [aria-hidden="true"]')) return true;
      if (node.matches('aside, [role="complementary"]') && !contentFigure) return true;
      const labels = `${node.id} ${node.getAttribute("class") || ""}`;
      if (/(?:^|[\s_-])(?:comments?|related|recommended|recommendations?|sidebar|newsletter|advertisement|advertising|ads?|sponsored?|social|share)(?:$|[\s_-])/i.test(labels)) return true;
      for (const name of ["data-module", "data-component", "data-type"]) {
        if (/^(?:ad|advertisement)$/i.test(node.getAttribute(name) || "")) return true;
      }
    }
    return false;
  }
  function findSplitArticleBody(scope, win) {
    const ownerSelector = 'article, [itemprop~="articleBody"], .post, .article, .entry';
    const title = (win.document.title || "").trim().toLowerCase();
    const matchesTitle = (owner) => Array.from(owner.querySelectorAll("h1")).some((heading) => {
      const text = (heading.textContent || "").trim().toLowerCase();
      return text.length > 0 && (title === text || [" | ", " — ", " – ", " - "].some((separator) => title.startsWith(text + separator)));
    });
    for (const selector of [".post-content", ".post__content", ".article-content", ".entry-content", ".article-body", ".wysiwyg"]) {
      const groups = /* @__PURE__ */ new Map();
      for (const element of Array.from(scope.querySelectorAll(selector))) {
        let owner = element.closest(ownerSelector);
        if (!owner && scope.matches('main, [role="main"]') && scope.querySelectorAll("h1").length === 1) owner = scope;
        if (!owner || !scope.contains(owner) || isOutsideArticleBody(element, owner)) continue;
        if (!owner.matches('article, [itemprop~="articleBody"]') && !matchesTitle(owner)) continue;
        if (isOutsideArticleBody(owner, scope)) continue;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(element);
      }
      for (const [owner, matches] of groups) {
        const roots = matches.filter((element) => !matches.some((other) => other !== element && other.contains(element)));
        if (roots.length < 2) continue;
        const textLength = roots.reduce((sum, element) => sum + (element.textContent || "").trim().length, 0);
        if (textLength > 500 && roots.some((element) => element.querySelector("p"))) return { owner, roots };
      }
    }
    return null;
  }
  function isLikelyContentContainer(element) {
    const className = String(element.className || "").toLowerCase();
    const id = (element.id || "").toLowerCase();
    const contentIndicators = [
      "article",
      "content",
      "post",
      "entry",
      "main",
      "story",
      "text"
    ];
    for (const indicator of contentIndicators) {
      if (className.includes(indicator) || id.includes(indicator)) {
        return true;
      }
    }
    return false;
  }
  function calculateStopwordBonus(text) {
    if (!text || text.length < 50) return 0;
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    if (cjkChars > text.length * 0.15) return 10;
    const SW = /* @__PURE__ */ new Set([
      // English
      "the",
      "is",
      "was",
      "are",
      "were",
      "a",
      "an",
      "of",
      "in",
      "to",
      "it",
      "he",
      "she",
      "they",
      "we",
      "that",
      "this",
      "for",
      "with",
      "on",
      "at",
      "by",
      "from",
      "as",
      "but",
      "and",
      "or",
      "not",
      "have",
      "has",
      "had",
      "will",
      "would",
      "could",
      "should",
      "be",
      "been",
      "being",
      "its",
      "his",
      "her",
      "their",
      "our",
      "you",
      "if",
      "do",
      "did",
      // Russian
      "и",
      "в",
      "не",
      "на",
      "что",
      "он",
      "она",
      "они",
      "я",
      "мы",
      "с",
      "по",
      "к",
      "из",
      "как",
      "то",
      "у",
      "но",
      "да",
      "так",
      "если",
      "же",
      "уже",
      "при",
      "или",
      "за",
      "со",
      // Ukrainian
      "і",
      "та",
      "не",
      "на",
      "що",
      "він",
      "вона",
      "вони",
      "я",
      "ми",
      "з",
      "по",
      "до",
      "як",
      "то",
      "у",
      "але",
      "вже",
      "або",
      "ж",
      "за",
      "зі",
      // German
      "der",
      "die",
      "das",
      "und",
      "in",
      "ist",
      "den",
      "zu",
      "von",
      "für",
      "eine",
      "einer",
      "auf",
      "nicht",
      "mit",
      "sich",
      "des",
      "dem",
      "war",
      "sind",
      "an",
      "hat",
      "er",
      "sie",
      "es",
      "als",
      "um",
      "aber",
      "wie",
      "so",
      "oder",
      "noch",
      "wenn",
      // French
      "le",
      "la",
      "les",
      "de",
      "et",
      "en",
      "un",
      "une",
      "dans",
      "est",
      "que",
      "il",
      "elle",
      "on",
      "nous",
      "par",
      "sur",
      "pour",
      "pas",
      "plus",
      "ce",
      "qui",
      "mais",
      "ou",
      "car",
      "ni",
      "si",
      "dont",
      // Spanish
      "el",
      "la",
      "los",
      "las",
      "de",
      "en",
      "y",
      "que",
      "es",
      "un",
      "una",
      "para",
      "con",
      "se",
      "lo",
      "del",
      "su",
      "por",
      "al",
      "le",
      "más",
      "como",
      "pero",
      "sus",
      "si",
      // Italian
      "il",
      "la",
      "di",
      "e",
      "che",
      "in",
      "un",
      "una",
      "per",
      "con",
      "non",
      "si",
      "ha",
      "ma",
      "sono",
      "da",
      "al",
      "lo",
      "le",
      "della",
      "del",
      "come",
      "più",
      // Portuguese
      "o",
      "a",
      "os",
      "as",
      "de",
      "em",
      "e",
      "que",
      "um",
      "uma",
      "para",
      "com",
      "se",
      "na",
      "no",
      "ao",
      "do",
      "da",
      "mais",
      "por",
      "como",
      "mas",
      "já"
    ]);
    const words = text.toLowerCase().match(/[a-zа-яёіїєäöüßàáâèéêìíîòóôùúûñ]{2,}/g) || [];
    if (words.length < 8) return 0;
    const stopCount = words.reduce((acc, w) => acc + (SW.has(w) ? 1 : 0), 0);
    const ratio = stopCount / words.length;
    if (ratio >= 0.18) return 25;
    if (ratio >= 0.12) return 15;
    if (ratio >= 0.08) return 5;
    if (ratio < 0.04 && words.length > 30) return -10;
    return 0;
  }
  function calculateContentScore(win, element) {
    const paragraphs = element.querySelectorAll("p");
    const headings = element.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const links = element.querySelectorAll("a");
    const text = element.textContent || "";
    const textLength = text.length;
    let score = paragraphs.length * 10;
    score += headings.length * 5;
    score += Math.min(textLength / 100, 50);
    try {
      const rect = element.getBoundingClientRect();
      const viewportWidth = win.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = win.innerHeight || document.documentElement.clientHeight;
      if (viewportWidth > 0 && viewportHeight > 0) {
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;
        const elementCenterX = rect.left + rect.width / 2;
        const elementCenterY = rect.top + rect.height / 2;
        const distanceFromCenter = Math.sqrt(
          Math.pow(elementCenterX - centerX, 2) + Math.pow(elementCenterY - centerY, 2)
        );
        const maxDistance = Math.sqrt(Math.pow(viewportWidth, 2) + Math.pow(viewportHeight, 2));
        const normalizedDistance = maxDistance > 0 ? distanceFromCenter / maxDistance : 0;
        if (normalizedDistance < 0.3) score += 10;
        else if (normalizedDistance < 0.5) score += 5;
        else if (normalizedDistance > 0.8) score *= 0.9;
        const isVisible = rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0;
        if (isVisible) score += 5;
      }
    } catch (e) {
    }
    const id = (element.id || "").toLowerCase();
    const className = String(element.className || "").toLowerCase();
    if (id === "root" || id === "app" || id === "__next" || className.includes("notion-page") || element.hasAttribute("data-reactroot")) {
      if (textLength >= 500) score += 50;
    }
    let navigationLinkLength = 0;
    let totalLinkTextLength = 0;
    for (const link of Array.from(links)) {
      const linkText = (link.textContent || "").trim();
      if (linkText.length > 2 && linkText.length < 200) {
        totalLinkTextLength += linkText.length;
        if (!link.closest("p")) {
          navigationLinkLength += linkText.length;
        }
      }
    }
    const linkDensity = textLength > 0 ? navigationLinkLength / textLength : 0;
    if (linkDensity > 0.3) score *= 0.4;
    else if (linkDensity > 0.2) score *= 0.6;
    else if (linkDensity > 0.1) score *= 0.8;
    const contentLinkRatio = totalLinkTextLength > 0 ? (totalLinkTextLength - navigationLinkLength) / totalLinkTextLength : 0;
    if (contentLinkRatio > 0.7 && links.length > 0) {
      score *= 1.1;
    }
    const commaCount = (text.match(/,/g) || []).length;
    if (commaCount > 10) score *= 1.2;
    else if (commaCount > 5) score *= 1.1;
    const sentenceCount = (text.match(/[.!?]+\s+/g) || []).length;
    if (sentenceCount > 5) score += Math.min(sentenceCount * 2, 30);
    score += calculateStopwordBonus(text);
    if (paragraphs.length > 0) {
      let paragraphBonusTotal = 0;
      let paragraphsChecked = 0;
      for (const p of Array.from(paragraphs)) {
        const pText = (p.textContent || "").trim();
        if (pText.length > 50) {
          paragraphBonusTotal += calculateStopwordBonus(pText);
          paragraphsChecked++;
        }
      }
      if (paragraphsChecked > 0) {
        score += Math.min(paragraphBonusTotal / paragraphsChecked, 30);
      }
    }
    if (paragraphs.length < 3) {
      try {
        const BLOCK = /* @__PURE__ */ new Set(["p", "ul", "ol", "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article"]);
        const divs = Array.from(element.querySelectorAll("div")).slice(0, 100);
        let virtualParas = 0;
        for (const div of divs) {
          const hasBlockChild = Array.from(div.children).some((c) => BLOCK.has(c.tagName.toLowerCase()));
          if (!hasBlockChild && (div.textContent || "").trim().length > 80) {
            virtualParas++;
          }
        }
        if (virtualParas >= 3) {
          score += virtualParas * 6;
        }
      } catch (e) {
      }
    }
    const tagName = element.tagName.toLowerCase();
    if (tagName === "article") score *= 2;
    else if (tagName === "main") score *= 1.5;
    else if (tagName === "section" && paragraphs.length >= 3) score *= 1.2;
    if (isLikelyContentContainer(element)) score += 100;
    if (textLength < 100) score *= 0.5;
    else if (textLength < 200) score *= 0.8;
    const lists = element.querySelectorAll("ul, ol");
    if (lists.length > paragraphs.length * 3 && paragraphs.length < 3) {
      score *= 0.6;
    }
    const textLower = text.toLowerCase();
    if (textLower.includes("get the latest") && textLower.includes("inbox") || textLower.includes("salesforce marketing cloud")) {
      score -= 1e3;
    }
    const emailInputs = element.querySelectorAll('input[type="email"]');
    if (emailInputs.length > 0) {
      const hasNewsletterText = textLower.includes("newsletter") || textLower.includes("subscribe");
      if (hasNewsletterText) score -= 1e3;
      else score -= 50;
    }
    const images = element.querySelectorAll("img");
    if (images.length > 0 && images.length < 20) {
      score += Math.min(images.length * 3, 20);
    }
    let longParagraphs = 0;
    for (const p of Array.from(paragraphs)) {
      if ((p.textContent || "").trim().length > 200) {
        longParagraphs++;
      }
    }
    if (longParagraphs > 3) score += longParagraphs * 5;
    return score;
  }
  function findMainContent(win, doc, isExcluded2, debugInfo, pushDebugLog2) {
    const confirmedOwner = Array.from(doc.querySelectorAll(EDITORIAL_CONTAINERS)).find((element) => isEditorialOwner(element) && !isExcluded2(element));
    const main = Array.from(doc.querySelectorAll('main,[role~="main"]')).find((element) => !isExcluded2(element) && safeGetComputedStyle(win, element)?.display !== "none" && Array.from(element.querySelectorAll("h1")).some(isDocumentHeadline)) || doc.querySelector("main");
    const mainOwnsProse = main && Array.from(main.querySelectorAll("p")).filter((paragraph) => !paragraph.closest('article,[role~="article"],figure') && !isOutsideArticleBody(paragraph, main) && (paragraph.textContent || "").trim().length >= 60).length >= 2 && Array.from(main.querySelectorAll("h1")).some(isDocumentHeadline);
    const isForeignPreview = (element) => mainOwnsProse && !!linkedArticlePreview(element);
    const spaSelectors = [
      "#root",
      "#app",
      "#__next",
      "[data-reactroot]",
      "[ng-app]",
      ".notion-page-content",
      ".notion-page"
    ];
    for (const selector of confirmedOwner ? [] : spaSelectors) {
      try {
        const spaRoot = doc.querySelector(selector);
        if (spaRoot) {
          const spaText = (spaRoot.textContent || "").trim();
          if (spaText.length >= 500) {
            const specificContent = Array.from(spaRoot.querySelectorAll('article, main, [role="main"], .article-content, .post-content')).find((element) => !isForeignPreview(element));
            if (specificContent && (specificContent.textContent || "").trim().length >= 500) {
              if (!isExcluded2(specificContent)) return specificContent;
            }
            if (!isExcluded2(spaRoot)) {
              return spaRoot;
            }
          }
        }
      } catch (e) {
      }
    }
    const article = confirmedOwner || Array.from(doc.querySelectorAll("article")).filter((element) => (element.textContent || "").trim().length > 500 && !isForeignPreview(element) && !element.closest("aside, .related, .related-stories, .sidebar, .comments, nav, footer") && !isExcluded2(element) && safeGetComputedStyle(win, element)?.display !== "none").sort((a, b) => calculateContentScore(win, b) - calculateContentScore(win, a))[0];
    if (article) {
      const articleText = (article.textContent || "").trim();
      if (confirmedOwner || articleText.length > 500) {
        const isRelatedArticle = article.querySelector(".gc__image-placeholder") !== null || article.closest("aside, .related, .sidebar") !== null;
        if (!isRelatedArticle) {
          const hostname2 = win.location?.hostname || "";
          if (hostname2.includes("atavist.com") || hostname2.includes("magazine.atavist.com")) {
            const specificSelectors = [
              ".entry-content",
              ".post-content",
              ".article-body",
              '[class*="content"]',
              '[class*="article"]',
              '[class*="post"]'
            ];
            for (const selector of specificSelectors) {
              const specificElement = article.querySelector(selector);
              if (specificElement) {
                const specificText = (specificElement.textContent || "").trim();
                if (specificText.length > 500) {
                  const className = String(specificElement.className || "").toLowerCase();
                  const isEntryContent = className.includes("entry-content");
                  if (isEntryContent || !isExcluded2(specificElement)) {
                    return specificElement;
                  }
                }
              }
            }
          }
          return article;
        }
      }
    }
    const hostname = win.location?.hostname || "";
    if (hostname.includes("wikipedia.org") || hostname.includes("wikimedia.org")) {
      const parserOutputs = Array.from(doc.querySelectorAll(".mw-parser-output"));
      let bestParserOutput = null;
      let maxTextLength = 0;
      for (const parserOutput of parserOutputs) {
        const textLength = (parserOutput.textContent || "").trim().length;
        if (textLength > maxTextLength) {
          maxTextLength = textLength;
          bestParserOutput = parserOutput;
        }
      }
      if (bestParserOutput && maxTextLength > 500) {
        return bestParserOutput;
      }
    }
    if (main) {
      const mainText = (main.textContent || "").trim();
      if (mainText.length > 100) {
        const splitBody = findSplitArticleBody(main, win);
        if (splitBody) return splitBody.owner;
        const specificContent = main.querySelector(".wysiwyg, .article-content, .post-content");
        if (specificContent && (specificContent.textContent || "").trim().length > 500) {
          if (!isExcluded2(specificContent)) return specificContent;
        }
        if (!isExcluded2(main)) return main;
      }
    }
    const contentSelectors = [
      '[role="main"]',
      ".article-content",
      ".post-content",
      ".entry-content",
      ".content",
      ".post-body",
      ".article-body",
      ".entry-body",
      "#content",
      "#main-content",
      "#article-content",
      ".wp-block-post-content",
      ".entry",
      ".post",
      ".prose",
      ".article-text",
      ".story-body",
      ".wysiwyg",
      ".wysiwyg--all-content"
    ];
    for (const selector of contentSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element) {
          const elementText = (element.textContent || "").trim();
          if (elementText.length > 100) {
            if (!isExcluded2(element)) {
              return element;
            }
          }
        }
      } catch (e) {
      }
    }
    let candidates = Array.from(doc.querySelectorAll("div, article, main, section, table"));
    if (candidates.length > 500) {
      candidates = candidates.slice(0, 500);
    }
    let bestCandidate = null;
    let maxScore = 0;
    for (const candidate of candidates) {
      if (isExcluded2(candidate) || candidate.closest(INTERFACE_REGIONS)) continue;
      const candidateText = (candidate.textContent || "").trim();
      if (candidateText.length < 100) continue;
      const score = calculateContentScore(win, candidate);
      if (score > maxScore) {
        maxScore = score;
        bestCandidate = candidate;
      }
    }
    return bestCandidate && maxScore > 0 ? bestCandidate : null;
  }

  // node_modules/html-to-image/es/util.js
  function resolveUrl(url, baseUrl) {
    if (url.match(/^[a-z]+:\/\//i)) {
      return url;
    }
    if (url.match(/^\/\//)) {
      return window.location.protocol + url;
    }
    if (url.match(/^[a-z]+:/i)) {
      return url;
    }
    const doc = document.implementation.createHTMLDocument();
    const base = doc.createElement("base");
    const a = doc.createElement("a");
    doc.head.appendChild(base);
    doc.body.appendChild(a);
    if (baseUrl) {
      base.href = baseUrl;
    }
    a.href = url;
    return a.href;
  }
  var uuid = /* @__PURE__ */ (() => {
    let counter = 0;
    const random = () => (
      // eslint-disable-next-line no-bitwise
      `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
    );
    return () => {
      counter += 1;
      return `u${random()}${counter}`;
    };
  })();
  function toArray(arrayLike) {
    const arr = [];
    for (let i = 0, l = arrayLike.length; i < l; i++) {
      arr.push(arrayLike[i]);
    }
    return arr;
  }
  var styleProps = null;
  function getStyleProperties(options = {}) {
    if (styleProps) {
      return styleProps;
    }
    if (options.includeStyleProperties) {
      styleProps = options.includeStyleProperties;
      return styleProps;
    }
    styleProps = toArray(window.getComputedStyle(document.documentElement));
    return styleProps;
  }
  function px(node, styleProperty) {
    const win = node.ownerDocument.defaultView || window;
    const val = win.getComputedStyle(node).getPropertyValue(styleProperty);
    return val ? parseFloat(val.replace("px", "")) : 0;
  }
  function getNodeWidth(node) {
    const leftBorder = px(node, "border-left-width");
    const rightBorder = px(node, "border-right-width");
    return node.clientWidth + leftBorder + rightBorder;
  }
  function getNodeHeight(node) {
    const topBorder = px(node, "border-top-width");
    const bottomBorder = px(node, "border-bottom-width");
    return node.clientHeight + topBorder + bottomBorder;
  }
  function getImageSize(targetNode, options = {}) {
    const width = options.width || getNodeWidth(targetNode);
    const height = options.height || getNodeHeight(targetNode);
    return { width, height };
  }
  function createImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        img.decode().then(() => {
          requestAnimationFrame(() => resolve(img));
        });
      };
      img.onerror = reject;
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url;
    });
  }
  async function svgToDataURL(svg) {
    return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`);
  }
  async function nodeToDataURL(node, width, height) {
    const xmlns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(xmlns, "svg");
    const foreignObject = document.createElementNS(xmlns, "foreignObject");
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    foreignObject.setAttribute("width", "100%");
    foreignObject.setAttribute("height", "100%");
    foreignObject.setAttribute("x", "0");
    foreignObject.setAttribute("y", "0");
    foreignObject.setAttribute("externalResourcesRequired", "true");
    svg.appendChild(foreignObject);
    foreignObject.appendChild(node);
    return svgToDataURL(svg);
  }
  var isInstanceOfElement = (node, instance) => {
    if (node instanceof instance)
      return true;
    const nodePrototype = Object.getPrototypeOf(node);
    if (nodePrototype === null)
      return false;
    return nodePrototype.constructor.name === instance.name || isInstanceOfElement(nodePrototype, instance);
  };

  // node_modules/html-to-image/es/clone-pseudos.js
  function formatCSSText(style) {
    const content = style.getPropertyValue("content");
    return `${style.cssText} content: '${content.replace(/'|"/g, "")}';`;
  }
  function formatCSSProperties(style, options) {
    return getStyleProperties(options).map((name) => {
      const value = style.getPropertyValue(name);
      const priority = style.getPropertyPriority(name);
      return `${name}: ${value}${priority ? " !important" : ""};`;
    }).join(" ");
  }
  function getPseudoElementStyle(className, pseudo, style, options) {
    const selector = `.${className}:${pseudo}`;
    const cssText = style.cssText ? formatCSSText(style) : formatCSSProperties(style, options);
    return document.createTextNode(`${selector}{${cssText}}`);
  }
  function clonePseudoElement(nativeNode, clonedNode, pseudo, options) {
    const style = window.getComputedStyle(nativeNode, pseudo);
    const content = style.getPropertyValue("content");
    if (content === "" || content === "none") {
      return;
    }
    const className = uuid();
    try {
      clonedNode.className = `${clonedNode.className} ${className}`;
    } catch (err) {
      return;
    }
    const styleElement = document.createElement("style");
    styleElement.appendChild(getPseudoElementStyle(className, pseudo, style, options));
    clonedNode.appendChild(styleElement);
  }
  function clonePseudoElements(nativeNode, clonedNode, options) {
    clonePseudoElement(nativeNode, clonedNode, ":before", options);
    clonePseudoElement(nativeNode, clonedNode, ":after", options);
  }

  // node_modules/html-to-image/es/mimes.js
  var WOFF = "application/font-woff";
  var JPEG = "image/jpeg";
  var mimes = {
    woff: WOFF,
    woff2: WOFF,
    ttf: "application/font-truetype",
    eot: "application/vnd.ms-fontobject",
    png: "image/png",
    jpg: JPEG,
    jpeg: JPEG,
    gif: "image/gif",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  function getExtension(url) {
    const match = /\.([^./]*?)$/g.exec(url);
    return match ? match[1] : "";
  }
  function getMimeType(url) {
    const extension = getExtension(url).toLowerCase();
    return mimes[extension] || "";
  }

  // node_modules/html-to-image/es/dataurl.js
  function getContentFromDataUrl(dataURL) {
    return dataURL.split(/,/)[1];
  }
  function isDataUrl(url) {
    return url.search(/^(data:)/) !== -1;
  }
  function makeDataUrl(content, mimeType) {
    return `data:${mimeType};base64,${content}`;
  }
  async function fetchAsDataURL(url, init, process2) {
    const res = await fetch(url, init);
    if (res.status === 404) {
      throw new Error(`Resource "${res.url}" not found`);
    }
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onloadend = () => {
        try {
          resolve(process2({ res, result: reader.result }));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(blob);
    });
  }
  var cache = {};
  function getCacheKey(url, contentType, includeQueryParams) {
    let key = url.replace(/\?.*/, "");
    if (includeQueryParams) {
      key = url;
    }
    if (/ttf|otf|eot|woff2?/i.test(key)) {
      key = key.replace(/.*\//, "");
    }
    return contentType ? `[${contentType}]${key}` : key;
  }
  async function resourceToDataURL(resourceUrl, contentType, options) {
    const cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
    if (cache[cacheKey] != null) {
      return cache[cacheKey];
    }
    if (options.cacheBust) {
      resourceUrl += (/\?/.test(resourceUrl) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime();
    }
    let dataURL;
    try {
      const content = await fetchAsDataURL(resourceUrl, options.fetchRequestInit, ({ res, result }) => {
        if (!contentType) {
          contentType = res.headers.get("Content-Type") || "";
        }
        return getContentFromDataUrl(result);
      });
      dataURL = makeDataUrl(content, contentType);
    } catch (error) {
      dataURL = options.imagePlaceholder || "";
      let msg = `Failed to fetch resource: ${resourceUrl}`;
      if (error) {
        msg = typeof error === "string" ? error : error.message;
      }
      if (msg) {
        console.warn(msg);
      }
    }
    cache[cacheKey] = dataURL;
    return dataURL;
  }

  // node_modules/html-to-image/es/clone-node.js
  async function cloneCanvasElement(canvas) {
    const dataURL = canvas.toDataURL();
    if (dataURL === "data:,") {
      return canvas.cloneNode(false);
    }
    return createImage(dataURL);
  }
  async function cloneVideoElement(video, options) {
    if (video.currentSrc) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURL2 = canvas.toDataURL();
      return createImage(dataURL2);
    }
    const poster = video.poster;
    const contentType = getMimeType(poster);
    const dataURL = await resourceToDataURL(poster, contentType, options);
    return createImage(dataURL);
  }
  async function cloneIFrameElement(iframe, options) {
    var _a;
    try {
      if ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body) {
        return await cloneNode(iframe.contentDocument.body, options, true);
      }
    } catch (_b) {
    }
    return iframe.cloneNode(false);
  }
  async function cloneSingleNode(node, options) {
    if (isInstanceOfElement(node, HTMLCanvasElement)) {
      return cloneCanvasElement(node);
    }
    if (isInstanceOfElement(node, HTMLVideoElement)) {
      return cloneVideoElement(node, options);
    }
    if (isInstanceOfElement(node, HTMLIFrameElement)) {
      return cloneIFrameElement(node, options);
    }
    return node.cloneNode(isSVGElement(node));
  }
  var isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SLOT";
  var isSVGElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SVG";
  async function cloneChildren(nativeNode, clonedNode, options) {
    var _a, _b;
    if (isSVGElement(clonedNode)) {
      return clonedNode;
    }
    let children = [];
    if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
      children = toArray(nativeNode.assignedNodes());
    } else if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
      children = toArray(nativeNode.contentDocument.body.childNodes);
    } else {
      children = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
    }
    if (children.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement)) {
      return clonedNode;
    }
    await children.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
      if (clonedChild) {
        clonedNode.appendChild(clonedChild);
      }
    }), Promise.resolve());
    return clonedNode;
  }
  function cloneCSSStyle(nativeNode, clonedNode, options) {
    const targetStyle = clonedNode.style;
    if (!targetStyle) {
      return;
    }
    const sourceStyle = window.getComputedStyle(nativeNode);
    if (sourceStyle.cssText) {
      targetStyle.cssText = sourceStyle.cssText;
      targetStyle.transformOrigin = sourceStyle.transformOrigin;
    } else {
      getStyleProperties(options).forEach((name) => {
        let value = sourceStyle.getPropertyValue(name);
        if (name === "font-size" && value.endsWith("px")) {
          const reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
          value = `${reducedFont}px`;
        }
        if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && name === "display" && value === "inline") {
          value = "block";
        }
        if (name === "d" && clonedNode.getAttribute("d")) {
          value = `path(${clonedNode.getAttribute("d")})`;
        }
        targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
      });
    }
  }
  function cloneInputValue(nativeNode, clonedNode) {
    if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
      clonedNode.innerHTML = nativeNode.value;
    }
    if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
      clonedNode.setAttribute("value", nativeNode.value);
    }
  }
  function cloneSelectValue(nativeNode, clonedNode) {
    if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
      const clonedSelect = clonedNode;
      const selectedOption = Array.from(clonedSelect.children).find((child) => nativeNode.value === child.getAttribute("value"));
      if (selectedOption) {
        selectedOption.setAttribute("selected", "");
      }
    }
  }
  function decorate(nativeNode, clonedNode, options) {
    if (isInstanceOfElement(clonedNode, Element)) {
      cloneCSSStyle(nativeNode, clonedNode, options);
      clonePseudoElements(nativeNode, clonedNode, options);
      cloneInputValue(nativeNode, clonedNode);
      cloneSelectValue(nativeNode, clonedNode);
    }
    return clonedNode;
  }
  async function ensureSVGSymbols(clone, options) {
    const uses = clone.querySelectorAll ? clone.querySelectorAll("use") : [];
    if (uses.length === 0) {
      return clone;
    }
    const processedDefs = {};
    for (let i = 0; i < uses.length; i++) {
      const use = uses[i];
      const id = use.getAttribute("xlink:href");
      if (id) {
        const exist = clone.querySelector(id);
        const definition = document.querySelector(id);
        if (!exist && definition && !processedDefs[id]) {
          processedDefs[id] = await cloneNode(definition, options, true);
        }
      }
    }
    const nodes = Object.values(processedDefs);
    if (nodes.length) {
      const ns = "http://www.w3.org/1999/xhtml";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("xmlns", ns);
      svg.style.position = "absolute";
      svg.style.width = "0";
      svg.style.height = "0";
      svg.style.overflow = "hidden";
      svg.style.display = "none";
      const defs = document.createElementNS(ns, "defs");
      svg.appendChild(defs);
      for (let i = 0; i < nodes.length; i++) {
        defs.appendChild(nodes[i]);
      }
      clone.appendChild(svg);
    }
    return clone;
  }
  async function cloneNode(node, options, isRoot) {
    if (!isRoot && options.filter && !options.filter(node)) {
      return null;
    }
    return Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
  }

  // node_modules/html-to-image/es/embed-resources.js
  var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
  var URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
  var FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
  function toRegex(url) {
    const escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
  }
  function parseURLs(cssText) {
    const urls = [];
    cssText.replace(URL_REGEX, (raw, quotation, url) => {
      urls.push(url);
      return raw;
    });
    return urls.filter((url) => !isDataUrl(url));
  }
  async function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
    try {
      const resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL;
      const contentType = getMimeType(resourceURL);
      let dataURL;
      if (getContentFromUrl) {
        const content = await getContentFromUrl(resolvedURL);
        dataURL = makeDataUrl(content, contentType);
      } else {
        dataURL = await resourceToDataURL(resolvedURL, contentType, options);
      }
      return cssText.replace(toRegex(resourceURL), `$1${dataURL}$3`);
    } catch (error) {
    }
    return cssText;
  }
  function filterPreferredFontFormat(str, { preferredFontFormat }) {
    return !preferredFontFormat ? str : str.replace(FONT_SRC_REGEX, (match) => {
      while (true) {
        const [src, , format] = URL_WITH_FORMAT_REGEX.exec(match) || [];
        if (!format) {
          return "";
        }
        if (format === preferredFontFormat) {
          return `src: ${src};`;
        }
      }
    });
  }
  function shouldEmbed(url) {
    return url.search(URL_REGEX) !== -1;
  }
  async function embedResources(cssText, baseUrl, options) {
    if (!shouldEmbed(cssText)) {
      return cssText;
    }
    const filteredCSSText = filterPreferredFontFormat(cssText, options);
    const urls = parseURLs(filteredCSSText);
    return urls.reduce((deferred, url) => deferred.then((css) => embed(css, url, baseUrl, options)), Promise.resolve(filteredCSSText));
  }

  // node_modules/html-to-image/es/embed-images.js
  async function embedProp(propName, node, options) {
    var _a;
    const propValue = (_a = node.style) === null || _a === void 0 ? void 0 : _a.getPropertyValue(propName);
    if (propValue) {
      const cssString = await embedResources(propValue, null, options);
      node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName));
      return true;
    }
    return false;
  }
  async function embedBackground(clonedNode, options) {
    ;
    await embedProp("background", clonedNode, options) || await embedProp("background-image", clonedNode, options);
    await embedProp("mask", clonedNode, options) || await embedProp("-webkit-mask", clonedNode, options) || await embedProp("mask-image", clonedNode, options) || await embedProp("-webkit-mask-image", clonedNode, options);
  }
  async function embedImageNode(clonedNode, options) {
    const isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);
    if (!(isImageElement && !isDataUrl(clonedNode.src)) && !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal))) {
      return;
    }
    const url = isImageElement ? clonedNode.src : clonedNode.href.baseVal;
    const dataURL = await resourceToDataURL(url, getMimeType(url), options);
    await new Promise((resolve, reject) => {
      clonedNode.onload = resolve;
      clonedNode.onerror = options.onImageErrorHandler ? (...attributes) => {
        try {
          resolve(options.onImageErrorHandler(...attributes));
        } catch (error) {
          reject(error);
        }
      } : reject;
      const image = clonedNode;
      if (image.decode) {
        image.decode = resolve;
      }
      if (image.loading === "lazy") {
        image.loading = "eager";
      }
      if (isImageElement) {
        clonedNode.srcset = "";
        clonedNode.src = dataURL;
      } else {
        clonedNode.href.baseVal = dataURL;
      }
    });
  }
  async function embedChildren(clonedNode, options) {
    const children = toArray(clonedNode.childNodes);
    const deferreds = children.map((child) => embedImages(child, options));
    await Promise.all(deferreds).then(() => clonedNode);
  }
  async function embedImages(clonedNode, options) {
    if (isInstanceOfElement(clonedNode, Element)) {
      await embedBackground(clonedNode, options);
      await embedImageNode(clonedNode, options);
      await embedChildren(clonedNode, options);
    }
  }

  // node_modules/html-to-image/es/apply-style.js
  function applyStyle(node, options) {
    const { style } = node;
    if (options.backgroundColor) {
      style.backgroundColor = options.backgroundColor;
    }
    if (options.width) {
      style.width = `${options.width}px`;
    }
    if (options.height) {
      style.height = `${options.height}px`;
    }
    const manual = options.style;
    if (manual != null) {
      Object.keys(manual).forEach((key) => {
        style[key] = manual[key];
      });
    }
    return node;
  }

  // node_modules/html-to-image/es/embed-webfonts.js
  var cssFetchCache = {};
  async function fetchCSS(url) {
    let cache2 = cssFetchCache[url];
    if (cache2 != null) {
      return cache2;
    }
    const res = await fetch(url);
    const cssText = await res.text();
    cache2 = { url, cssText };
    cssFetchCache[url] = cache2;
    return cache2;
  }
  async function embedFonts(data, options) {
    let cssText = data.cssText;
    const regexUrl = /url\(["']?([^"')]+)["']?\)/g;
    const fontLocs = cssText.match(/url\([^)]+\)/g) || [];
    const loadFonts = fontLocs.map(async (loc) => {
      let url = loc.replace(regexUrl, "$1");
      if (!url.startsWith("https://")) {
        url = new URL(url, data.url).href;
      }
      return fetchAsDataURL(url, options.fetchRequestInit, ({ result }) => {
        cssText = cssText.replace(loc, `url(${result})`);
        return [loc, result];
      });
    });
    return Promise.all(loadFonts).then(() => cssText);
  }
  function parseCSS(source) {
    if (source == null) {
      return [];
    }
    const result = [];
    const commentsRegex = /(\/\*[\s\S]*?\*\/)/gi;
    let cssText = source.replace(commentsRegex, "");
    const keyframesRegex = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
    while (true) {
      const matches = keyframesRegex.exec(cssText);
      if (matches === null) {
        break;
      }
      result.push(matches[0]);
    }
    cssText = cssText.replace(keyframesRegex, "");
    const importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
    const combinedCSSRegex = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})";
    const unifiedRegex = new RegExp(combinedCSSRegex, "gi");
    while (true) {
      let matches = importRegex.exec(cssText);
      if (matches === null) {
        matches = unifiedRegex.exec(cssText);
        if (matches === null) {
          break;
        } else {
          importRegex.lastIndex = unifiedRegex.lastIndex;
        }
      } else {
        unifiedRegex.lastIndex = importRegex.lastIndex;
      }
      result.push(matches[0]);
    }
    return result;
  }
  async function getCSSRules(styleSheets, options) {
    const ret = [];
    const deferreds = [];
    styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet) {
        try {
          toArray(sheet.cssRules || []).forEach((item, index) => {
            if (item.type === CSSRule.IMPORT_RULE) {
              let importIndex = index + 1;
              const url = item.href;
              const deferred = fetchCSS(url).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
                try {
                  sheet.insertRule(rule, rule.startsWith("@import") ? importIndex += 1 : sheet.cssRules.length);
                } catch (error) {
                  console.error("Error inserting rule from remote css", {
                    rule,
                    error
                  });
                }
              })).catch((e) => {
                console.error("Error loading remote css", e.toString());
              });
              deferreds.push(deferred);
            }
          });
        } catch (e) {
          const inline = styleSheets.find((a) => a.href == null) || document.styleSheets[0];
          if (sheet.href != null) {
            deferreds.push(fetchCSS(sheet.href).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
              inline.insertRule(rule, inline.cssRules.length);
            })).catch((err) => {
              console.error("Error loading remote stylesheet", err);
            }));
          }
          console.error("Error inlining remote css file", e);
        }
      }
    });
    return Promise.all(deferreds).then(() => {
      styleSheets.forEach((sheet) => {
        if ("cssRules" in sheet) {
          try {
            toArray(sheet.cssRules || []).forEach((item) => {
              ret.push(item);
            });
          } catch (e) {
            console.error(`Error while reading CSS rules from ${sheet.href}`, e);
          }
        }
      });
      return ret;
    });
  }
  function getWebFontRules(cssRules) {
    return cssRules.filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).filter((rule) => shouldEmbed(rule.style.getPropertyValue("src")));
  }
  async function parseWebFontRules(node, options) {
    if (node.ownerDocument == null) {
      throw new Error("Provided element is not within a Document");
    }
    const styleSheets = toArray(node.ownerDocument.styleSheets);
    const cssRules = await getCSSRules(styleSheets, options);
    return getWebFontRules(cssRules);
  }
  function normalizeFontFamily(font) {
    return font.trim().replace(/["']/g, "");
  }
  function getUsedFonts(node) {
    const fonts = /* @__PURE__ */ new Set();
    function traverse(node2) {
      const fontFamily = node2.style.fontFamily || getComputedStyle(node2).fontFamily;
      fontFamily.split(",").forEach((font) => {
        fonts.add(normalizeFontFamily(font));
      });
      Array.from(node2.children).forEach((child) => {
        if (child instanceof HTMLElement) {
          traverse(child);
        }
      });
    }
    traverse(node);
    return fonts;
  }
  async function getWebFontCSS(node, options) {
    const rules = await parseWebFontRules(node, options);
    const usedFonts = getUsedFonts(node);
    const cssTexts = await Promise.all(rules.filter((rule) => usedFonts.has(normalizeFontFamily(rule.style.fontFamily))).map((rule) => {
      const baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
      return embedResources(rule.cssText, baseUrl, options);
    }));
    return cssTexts.join("\n");
  }
  async function embedWebFonts(clonedNode, options) {
    const cssText = options.fontEmbedCSS != null ? options.fontEmbedCSS : options.skipFonts ? null : await getWebFontCSS(clonedNode, options);
    if (cssText) {
      const styleNode = document.createElement("style");
      const sytleContent = document.createTextNode(cssText);
      styleNode.appendChild(sytleContent);
      if (clonedNode.firstChild) {
        clonedNode.insertBefore(styleNode, clonedNode.firstChild);
      } else {
        clonedNode.appendChild(styleNode);
      }
    }
  }

  // node_modules/html-to-image/es/index.js
  async function toSvg(node, options = {}) {
    const { width, height } = getImageSize(node, options);
    const clonedNode = await cloneNode(node, options, true);
    await embedWebFonts(clonedNode, options);
    await embedImages(clonedNode, options);
    applyStyle(clonedNode, options);
    const datauri = await nodeToDataURL(clonedNode, width, height);
    return datauri;
  }

  // scripts/api/tts-catalog.js
  var DEFAULT_OPENAI_TTS_VOICE = "marin";
  var DEFAULT_ELEVENLABS_TTS_MODEL = "eleven_v4";

  // scripts/utils/config.js
  var CONFIG = {
    // Content processing
    CHUNK_SIZE: 5e4,
    // Characters per chunk for AI extraction
    CHUNK_OVERLAP: 3e3,
    // Overlap between chunks to avoid cut-off content
    MAX_HTML_FOR_ANALYSIS: 45e4,
    // Max HTML characters sent for selector analysis
    TRANSLATION_CHUNK_SIZE: 2e4,
    // Characters per translation batch
    TRANSLATION_BATCH_MAX_FIELDS: 32,
    // Timeouts
    API_TIMEOUT_MS: 10 * 60 * 1e3,
    TRANSLATION_API_TIMEOUT_MS: 10 * 60 * 1e3,
    PROCESSING_INACTIVITY_TIMEOUT_MS: 10 * 60 * 1e3,
    STATE_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    // 7 days - stale state threshold (increased for very long operations like 1000-page PDFs)
    // NOTE: STATE_SAVE_INTERVAL removed - keep-alive now uses only alarms (every 1 minute)
    // Alarms can wake up terminated service workers, intervals cannot
    // This reduces storage load by 90% while maintaining reliability
    // Long-running operations timeouts (for very large articles/audio files and large PDFs up to 1000 pages)
    MAX_OPERATION_TIMEOUT_MS: 7 * 24 * 60 * 60 * 1e3,
    // 7 days (168 hours) - initial maximum timeout estimate (supports PDFs up to 1000 pages)
    ABSOLUTE_MAX_OPERATION_TIMEOUT_MS: 10 * 24 * 60 * 60 * 1e3,
    // 10 days (240 hours) - absolute maximum (safety limit for stuck operations, supports even larger PDFs)
    OFFScreen_TTS_TIMEOUT_BASE: 60 * 1e3,
    // 60 seconds base timeout
    OFFScreen_TTS_TIMEOUT_PER_CHAR: 100,
    // 100ms per character
    OFFScreen_TTS_TIMEOUT_MAX: 7 * 24 * 60 * 60 * 1e3,
    // 7 days (168 hours) - initial estimate maximum (supports very long audio generation)
    OFFScreen_TTS_HEARTBEAT_INTERVAL: 30 * 1e3,
    // 30 seconds - heartbeat interval for timeout extension
    OFFScreen_TTS_HEARTBEAT_EXTENSION: 30 * 60 * 1e3,
    // 30 minutes - how much to extend timeout on each heartbeat
    // PDF processing timeouts (for very large PDFs up to 1000 pages)
    PDF_TAB_LOAD_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for tab load (increased from 30 seconds for very large PDFs)
    PDF_PAGE_LOAD_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for page load (increased from 5 seconds for very large PDFs)
    PDF_PAGE_LOAD_FALLBACK_TIMEOUT_MS: 2 * 60 * 1e3,
    // 2 minutes - fallback timeout for page load (increased from 2 seconds for very large PDFs)
    PDF_FIRST_PAGE_RENDER_TIMEOUT_MS: 10 * 60 * 1e3,
    // 10 minutes - timeout for first page render (longer for initialization)
    PDF_RENDER_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for PDF page rendering (increased from 60 seconds for 1000-page PDFs)
    PDF_PARSE_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for PDF parsing (increased from 30 seconds for 1000-page PDFs)
    // Audio cleanup
    AUDIO_CLEANUP_THRESHOLD_MS: 5 * 60 * 1e3,
    // 5 minutes - threshold for stale audio cleanup
    // Worker inactivity timeout
    WORKER_INACTIVITY_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for worker inactivity
    // Offscreen TTS cleanup timeout
    OFFScreen_TTS_CLEANUP_TIMEOUT_MS: 5 * 60 * 1e3,
    // 5 minutes - timeout for offscreen TTS cleanup (enough time for audio to be used)
    // Keep-alive
    KEEP_ALIVE_INTERVAL: 1,
    // Minutes (>=1 min per MV3 requirement)
    // OPTIMIZED: Removed intervals - alarms alone are sufficient and can wake terminated service workers
    // This reduces storage operations by 90% (from 30+ per minute to 1 per minute)
    // State thresholds
    RESET_THRESHOLD_MS: 60 * 1e3,
    // 1 minute - threshold for resetting state on extension reload
    SUMMARY_STALE_THRESHOLD_MS: 15 * 60 * 1e3,
    // 15 minutes - threshold for stale summary generation flag
    SUMMARY_TIMEOUT_MS: 10 * 60 * 1e3,
    // 10 minutes - timeout for summary generation (will abort and show error)
    KEY_THESES_STALE_THRESHOLD_MS: 15 * 60 * 1e3,
    KEY_THESES_TIMEOUT_MS: 10 * 60 * 1e3,
    MAX_UPDATE_QUEUE_SIZE: 100,
    // Maximum number of queued state updates (prevents memory leaks)
    // Polling
    POLL_INTERVAL_IDLE: 1e3,
    // ms - polling interval when idle
    POLL_INTERVAL_PROCESSING: 300,
    // ms - polling interval when processing
    // Retry configuration
    RETRY_MAX_ATTEMPTS: 2,
    RETRY_DELAYS: [2e3, 5e3],
    RETRY_MAX_DELAY_MS: 60 * 1e3,
    RETRY_TIMEOUT_MS: 10 * 60 * 1e3,
    RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504],
    // HTTP status codes that trigger retry
    RETRY_NETWORK_ERRORS: true,
    // Retry on network errors (timeout, connection failed, etc.)
    // UI and Event Handling
    UI_DEBOUNCE_DELAY: 500,
    // ms - debounce delay for UI settings saves (popup)
    UI_ASYNC_DEFER_DELAY: 0,
    // ms - delay for deferring async work (0 = next tick)
    UI_RETRY_DELAY: 100,
    // ms - retry delay for failed saves
    UI_CONTEXT_MENU_DELAY: 50,
    // ms - delay for context menu operations
    // Storage
    STORAGE_SAVE_DEBOUNCE: 5e3,
    // ms - debounce for storage saves (background) - OPTIMIZED: increased from 500ms to 5s to reduce load
    STORAGE_SAVE_DEBOUNCE_AUDIO: 3e3,
    // ms - debounce for audio storage saves (longer to avoid blocking WASM operations)
    // TTS and Audio
    TTS_DELAY: 200,
    // ms - delay for TTS operations
    TTS_VOICES_LOAD_DELAY: 1e3,
    // ms - delay for loading TTS voices
    OFFLINE_TTS_SETUP_DELAY: 300,
    // ms - delay for offline TTS setup
    OFFLINE_TTS_RETRY_DELAY: 100,
    // ms - retry delay for offline TTS verification
    OFFLINE_TTS_NEXT_TICK_DELAY: 0,
    // ms - delay for next tick operations
    // Video Processing
    VIDEO_SUBTITLES_CHECK_INTERVAL: 200,
    // ms - interval for checking subtitle storage
    VIDEO_SUBTITLES_TIMEOUT: 6e4,
    // ms - timeout for subtitle extraction (60 seconds)
    VIDEO_SUBTITLES_RETRY_DELAY_1: 2e3,
    // ms - first retry delay for video subtitles
    VIDEO_SUBTITLES_RETRY_DELAY_2: 1e3,
    // ms - second retry delay for video subtitles
    VIDEO_SUBTITLES_WAIT_INTERVAL: 500,
    // ms - wait interval for video subtitles
    // Extraction
    EXTRACTION_AUTOMATIC_TIMEOUT: 3e4,
    // ms - timeout for automatic extraction (30 seconds)
    // Translation
    TRANSLATION_RETRY_DELAYS: [2e3, 5e3, 1e4, 2e4, 3e4],
    // ms - retry delays for translation
    // Default values
    DEFAULT_AUDIO_VOICE: DEFAULT_OPENAI_TTS_VOICE,
    DEFAULT_AUDIO_SPEED: 1,
    // Default audio playback speed
    DEFAULT_AUDIO_FORMAT: "mp3",
    // Default audio format
    DEFAULT_ELEVENLABS_MODEL: DEFAULT_ELEVENLABS_TTS_MODEL,
    DEFAULT_RESPEECHER_VOICE: "samantha",
    // Default Respeecher English voice
    // Logging
    LOG_LEVEL: 2,
    // Log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
    VERBOSE_LOGGING: false,
    // Include detailed content diagnostics during development
    MAX_LOG_DATA_SIZE: 1e5,
    // Maximum size of data object to log (in characters after JSON.stringify), larger objects will be truncated
    LOG_COLLECTION_MAX_SIZE: 1e4
    // Maximum number of logs in memory collection
  };

  // scripts/utils/html/image-bytes.js
  var MAX_IMAGE_BYTES = 50 * 1024 * 1024;
  function imageDataError(code) {
    let message = "The image could not be read.";
    let translationKey = "errorImageUnavailable";
    let translationParams = {};
    if (code === "IMAGE_TOO_LARGE") {
      translationParams = { maxMiB: MAX_IMAGE_BYTES / 1024 / 1024 };
      message = `Image exceeds the ${translationParams.maxMiB} MiB limit.`;
      translationKey = "errorImageTooLarge";
    } else if (code === "IMAGE_UNSAFE_URL" || code === "IMAGE_UNSAFE_REDIRECT") {
      message = "This image URL is not allowed.";
      translationKey = "errorImageUrlBlocked";
    } else if (code === "IMAGE_TIMEOUT") {
      message = "Image processing timed out.";
      translationKey = "errorTimeout";
    } else if (code === "IMAGE_CANCELLED") {
      message = "Image processing was cancelled.";
      translationKey = "statusCancelled";
    }
    return Object.assign(new Error(message), { code, translationKey, translationParams });
  }
  function detectImageMime(bytes) {
    const starts = (values) => values.every((value, index) => bytes[index] === value);
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
    if (starts([255, 216, 255])) return "image/jpeg";
    if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 32))) return "image/avif";
    if (starts([66, 77])) return "image/bmp";
    const comments = /^(?:\s*<!--[\s\S]*?-->)+/;
    const svgDoctype = /^\s*<!DOCTYPE\s+svg(?:\s+(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*')))?\s*>/;
    const prefix = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\s*<\?xml[\s\S]*?\?>/, "").replace(comments, "").replace(svgDoctype, "").replace(comments, "");
    if (/^\s*<svg(?:\s|>)/i.test(prefix)) return "image/svg+xml";
    throw imageDataError(bytes.length ? "IMAGE_UNSUPPORTED_TYPE" : "IMAGE_EMPTY");
  }
  async function readImageBytes(response) {
    const declared = response.headers?.get("content-length");
    if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => {
      });
      throw imageDataError("IMAGE_TOO_LARGE");
    }
    if (!response.body?.getReader) {
      const bytes2 = new Uint8Array(await response.arrayBuffer());
      if (bytes2.byteLength > MAX_IMAGE_BYTES) throw imageDataError("IMAGE_TOO_LARGE");
      return bytes2;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {
          });
          throw imageDataError("IMAGE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  function imageDataUrlBytes(url) {
    if (url.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 512) throw imageDataError("IMAGE_TOO_LARGE");
    const match = url.match(/^data:(image\/[\w.+-]+)((?:;[^\r\n,]*)?),([\s\S]*)$/i);
    if (!match) throw imageDataError("IMAGE_UNSUPPORTED_TYPE");
    let bytes;
    try {
      if (/;base64(?:;|$)/i.test(match[2])) {
        const encoded = match[3].replace(/[\t\r\n ]/g, "");
        if (!/^[a-z\d+/]*={0,2}$/i.test(encoded)) throw new Error("Invalid base64");
        bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      } else bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
    } catch {
      throw imageDataError("IMAGE_INVALID_DATA");
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw imageDataError("IMAGE_TOO_LARGE");
    return bytes;
  }

  // scripts/extraction/extractor/graphics.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var OMIT = 'figcaption,script,style,template,noscript,source,button,input,select,textarea,nav,footer,iframe,video,audio,object,embed,[role="button"],[role="navigation"],[contenteditable="true"]';
  var DEFINITIONS = "defs,marker,pattern,linearGradient,radialGradient,clipPath,mask,symbol,title,desc";
  var FAILURE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=";
  var CAPTION_GLYPH_MAX_SIZE = 48;
  function failure() {
    return Object.assign(new Error("The article graphic could not be captured."), {
      code: "GRAPHIC_CAPTURE_FAILED",
      translationKey: "errorImageUnavailable",
      translationParams: {}
    });
  }
  function hidden(element, descendants = false) {
    const win = element.ownerDocument.defaultView;
    for (let node = element; node; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.display === "none" || style.contentVisibility === "hidden" || style.opacity === "0") return true;
      if (node.matches(".katex-mathml,.MJX_Assistive_MathML") && style.position === "absolute" && style.overflow === "hidden") return true;
    }
    return ["hidden", "collapse"].includes(win.getComputedStyle(element).visibility) && (!descendants || !Array.from(element.querySelectorAll("*")).some((node) => !node.closest(DEFINITIONS) && !hidden(node)));
  }
  function controls(element) {
    return !!element.closest('button,input,select,textarea,nav,footer,[role="button"],[role="navigation"],[contenteditable="true"]');
  }
  function isRenderedPlaceholder(element) {
    if (element.tagName !== "IMG") return false;
    const image = (
      /** @type {HTMLImageElement} */
      element
    );
    const source = image.currentSrc || image.getAttribute("src");
    return !!source && isPlaceholderUrl(source, image);
  }
  function hasLayeredImages(figure) {
    const bounds = Array.from(figure.querySelectorAll("img")).filter((image) => image.closest("figure") === figure && image.complete && image.naturalWidth && image.naturalHeight && !isRenderedPlaceholder(image) && !controls(image) && !hidden(image)).map((image) => {
      const border = image.getBoundingClientRect(), style = image.ownerDocument.defaultView.getComputedStyle(image);
      if (!(border.width > 0 && border.height > 0)) return null;
      const inset = (side) => parseFloat(style.getPropertyValue(`border-${side}-width`) || "0") + parseFloat(style.getPropertyValue(`padding-${side}`) || "0");
      const horizontal = inset("left") + inset("right"), vertical = inset("top") + inset("bottom");
      const scaleX = border.width / ((parseFloat(style.width) || border.width) + (style.boxSizing === "border-box" ? 0 : horizontal));
      const scaleY = border.height / ((parseFloat(style.height) || border.height) + (style.boxSizing === "border-box" ? 0 : vertical));
      const rect = { left: border.left + inset("left") * scaleX, top: border.top + inset("top") * scaleY, right: border.right - inset("right") * scaleX, bottom: border.bottom - inset("bottom") * scaleY, width: border.width - horizontal * scaleX, height: border.height - vertical * scaleY };
      if (!["contain", "scale-down", "none"].includes(style.objectFit)) return rect;
      const fit = style.objectFit === "none" ? 1 : Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight, style.objectFit === "scale-down" ? 1 : Infinity);
      const width = image.naturalWidth * fit, height = image.naturalHeight * fit;
      const positions = (style.objectPosition || "50% 50%").split(/\s+/);
      if (positions.length !== 2) return null;
      const offset = (value, space) => value.endsWith("%") ? parseFloat(value) * space / 100 : value.endsWith("px") ? parseFloat(value) : { left: 0, top: 0, center: space / 2, right: space, bottom: space }[value];
      const x = offset(positions[0], rect.width - width), y = offset(positions[1], rect.height - height);
      return Number.isFinite(x + y) ? { left: Math.max(rect.left, rect.left + x), top: Math.max(rect.top, rect.top + y), right: Math.min(rect.right, rect.left + x + width), bottom: Math.min(rect.bottom, rect.top + y + height) } : null;
    }).filter(Boolean).sort((first, second) => first.left - second.left);
    return bounds.some((first, index) => {
      for (let next = index + 1; next < bounds.length && bounds[next].left < first.right; next++) {
        const second = bounds[next];
        if (Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)) return true;
      }
      return false;
    });
  }
  function isDecorativeLinkGraphic(graphic) {
    if (graphic && isExternalLinkAdornment(graphic)) return true;
    if (graphic?.tagName.toLowerCase() !== "svg" || graphic.getAttribute("aria-hidden") !== "true" || graphic.textContent?.trim() || graphic.hasAttribute("aria-label") || graphic.hasAttribute("aria-labelledby")) return false;
    const link = graphic.closest("a[href]");
    const figure = graphic.closest("figure");
    return !!link?.textContent?.trim() && !(figure && link.contains(figure));
  }
  function isCaptionSvgGlyph(graphic, figure) {
    if (graphic.localName !== "svg" || graphic.closest("figcaption")?.closest("figure") !== figure) return false;
    if (graphic.hasAttribute("role") || graphic.hasAttribute("aria-label") || graphic.hasAttribute("aria-labelledby") || graphic.textContent?.trim() || graphic.querySelector("title,desc,text,image,foreignObject")) return false;
    const { width, height } = graphic.getBoundingClientRect();
    return width > 0 && height > 0 && width <= CAPTION_GLYPH_MAX_SIZE && height <= CAPTION_GLYPH_MAX_SIZE;
  }
  function getGraphicReadingOwner(element, roots) {
    if (!element || !roots?.some((root) => root === element || root.contains(element))) return null;
    if (element.closest("pre,code,math,mjx-container,.MathJax,.katex")) return null;
    const figure = element.closest("figure");
    const graphic = element.closest("svg,canvas");
    if (!figure && !graphic || isDecorativeLinkGraphic(graphic) || controls(element) || hidden(element, true)) return null;
    if (figure && roots.some((root) => root === figure || root.contains(figure))) {
      const graphics = Array.from(figure.querySelectorAll("svg,canvas")).filter((node) => node.closest("figure") === figure && !isCaptionSvgGlyph(node, figure) && !isDecorativeLinkGraphic(node) && !controls(node) && !hidden(node, true));
      const layered = hasLayeredImages(figure);
      if (graphics.length || layered) {
        const mixed = !!figure.querySelector("figure") || Array.from(figure.querySelectorAll("p,table,img,blockquote,pre,ul,ol")).some((node) => !(layered && node.tagName === "IMG") && !isRenderedPlaceholder(node) && !node.closest('figcaption,svg,[role="img"]') && !controls(node) && !hidden(node));
        if (!mixed) return figure;
        return element.closest("svg,canvas");
      }
    }
    if (!graphic || /(?:^|[\s_-])icon(?:$|[\s_-])/i.test(graphic.getAttribute("class") || "")) return null;
    const labelled = graphic.tagName === "CANVAS" || graphic.getAttribute("role") === "img" || graphic.hasAttribute("aria-label") || graphic.hasAttribute("aria-labelledby") || !!graphic.querySelector("title") || roots.includes(graphic);
    return labelled ? graphic : null;
  }
  function excluded(element, owner, selectors) {
    if (element.tagName === "IMG" && isCollapsedImageLayer(
      /** @type {HTMLImageElement} */
      element
    )) return true;
    if (isRenderedPlaceholder(element) || hidden(element, true) || isSourceExcluded(element, selectors)) return true;
    for (let node = element; node && node !== owner; node = node.parentElement) {
      if (node.matches(OMIT)) return true;
    }
    return isSourceExcluded(owner, selectors);
  }
  function visibleText(owner, selectors, caption = false) {
    function read(node) {
      if (node.nodeType === 3) return !hidden(node.parentElement) ? node.textContent || "" : "";
      if (node.nodeType !== 1) return "";
      const element = (
        /** @type {Element} */
        node
      );
      if (!caption && element.closest("figcaption") || excluded(element, owner, selectors) || element.matches("script,style,template,noscript,title,desc,defs")) return "";
      if (element.tagName === "IMG") return "\n" + (element.getAttribute("alt") || graphicLabel(element)) + "\n";
      const annotation = element.matches(".katex,.MathJax") ? element.querySelector('annotation[encoding*="tex"]') : null;
      if (annotation?.textContent?.trim()) return " " + annotation.textContent.trim() + " ";
      let text = Array.from(element.childNodes).map(read).join("");
      if (element.namespaceURI !== SVG_NS && !hidden(element)) {
        const pseudo = (name) => {
          const style = element.ownerDocument.defaultView.getComputedStyle(element, name);
          if (style.display === "none" || style.visibility === "hidden") return "";
          return (style.content.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) || []).map((value) => value.slice(1, -1).replace(/\\(?:([a-f\d]{1,6})\s?|([\s\S]))/gi, (_, hex, character) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 1114111)) : character)).join("");
        };
        text = [pseudo("::before"), text, pseudo("::after")].filter(Boolean).join("\n");
      }
      if (element !== owner && element.matches("svg,canvas")) {
        const label = graphicLabel(element);
        if (label && label !== text.trim()) text = label + "\n" + text;
      }
      const display = element.ownerDocument.defaultView.getComputedStyle(element).display;
      return /^(?:block|flex|grid|flow-root|list-item|table)/.test(display) || element.tagName === "BR" || element.localName === "text" ? "\n" + text + "\n" : text;
    }
    return read(owner).replace(/[\t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  }
  function graphicLabel(element) {
    const doc = element.ownerDocument;
    return (element.getAttribute("aria-label") || (element.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => doc.getElementById(id)?.textContent || "").join(" ") || element.querySelector("title")?.textContent || "").trim();
  }
  function hasCanvasPixels(context, canvas, deadline) {
    for (let top = 0; top < canvas.height; top += 64) {
      if (Date.now() >= deadline) throw imageDataError("IMAGE_TIMEOUT");
      const pixels = context.getImageData(0, top, canvas.width, Math.min(64, canvas.height - top)).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) return true;
      }
    }
    return false;
  }
  function unreadableCanvasReference(owner, roots, text) {
    const doc = owner.ownerDocument;
    const link = doc.createElement("a");
    const target = owner.closest("[id]");
    if (target?.id && roots.some((root) => root === target || root.contains(target))) {
      const url = new URL(doc.URL);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) {
        url.hash = encodeURIComponent(target.id);
        link.href = url.href;
      }
    }
    if (!link.hasAttribute("href") && !text) return null;
    link.textContent = text || "Open original graphic";
    const html = link.hasAttribute("href") ? link.outerHTML : link.innerHTML;
    return { type: "paragraph", text: html, html };
  }
  function localReference(value, doc) {
    try {
      const url = new URL(value, doc.baseURI), source = new URL(doc.URL);
      const hash = url.hash;
      url.hash = source.hash = "";
      return hash && url.href === source.href ? hash : null;
    } catch {
      return null;
    }
  }
  function originalImageLayers(owner, included) {
    if (owner.tagName !== "FIGURE" || included.some((node) => node.matches("svg,canvas"))) return [];
    const images = included.filter((node) => node.tagName === "IMG" && node.closest("figure") === owner);
    const sources = [];
    for (const node of images) {
      const image = (
        /** @type {HTMLImageElement} */
        node
      );
      const source = image.currentSrc || image.getAttribute("src");
      if (!source || !image.complete || !image.naturalWidth || !image.naturalHeight) return [];
      const url = new URL(source, image.ownerDocument.baseURI);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
      sources.push(url.href);
    }
    return sources;
  }
  async function captureReadingGraphics(win, elements, state, constants) {
    const roots = state.referenceRoots || [];
    const selectors = state.selectionExclusions || [];
    const deadline = state.extractionDeadline ?? Date.now() + CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT;
    const owners = /* @__PURE__ */ new Set();
    for (const element of elements) {
      if (Date.now() >= deadline) throw imageDataError("IMAGE_TIMEOUT");
      const owner = getGraphicReadingOwner(element, roots);
      if (owner) owners.add(owner);
    }
    const result = /* @__PURE__ */ new Map();
    if (!owners.size) return result;
    const controller = new win.AbortController();
    const timer = win.setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
    const aborted = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(imageDataError("IMAGE_TIMEOUT")), { once: true }));
    const bounded = (promise) => Promise.race([promise, aborted]);
    const resources = /* @__PURE__ */ new Map();
    const failedFetches = /* @__PURE__ */ new WeakSet();
    const validateResource = (bytes) => {
      const mime = detectImageMime(bytes);
      if (mime === "image/svg+xml") {
        const xml = new win.DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml");
        const externalCss = (value) => /@import/i.test(value) || [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)].some((match) => !match[2].trim().startsWith("#"));
        if (xml.querySelector("parsererror,script,foreignObject") || Array.from(xml.querySelectorAll("*")).some((node) => node.localName === "style" && externalCss(node.textContent || "") || Array.from(node.attributes).some((attribute) => /^on/i.test(attribute.name) || (attribute.name === "href" || attribute.name.endsWith(":href")) && !attribute.value.startsWith("#") || externalCss(attribute.value)))) throw failure();
      }
      return mime;
    };
    const dataUrl = async (url, doc) => {
      if (/^data:image\//i.test(url)) {
        validateResource(imageDataUrlBytes(url));
        return url;
      }
      const absolute = new URL(url, doc.baseURI);
      if (!["https:", "http:", "blob:"].includes(absolute.protocol) || absolute.username || absolute.password) throw failure();
      if (!resources.has(absolute.href)) resources.set(absolute.href, (async () => {
        const response = await win.fetch(absolute.href, { credentials: "omit", signal: controller.signal }).catch((error) => {
          if (!controller.signal.aborted && error?.name === "TypeError") failedFetches.add(error);
          throw error;
        });
        if (!response.ok) throw failure();
        const bytes = await readImageBytes(response), mime = validateResource(bytes);
        return await new Promise((resolve, reject) => {
          const reader = new win.FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(new win.Blob([bytes], { type: mime }));
        });
      })());
      return bounded(resources.get(absolute.href));
    };
    async function image(url) {
      return bounded(new Promise((resolve, reject) => {
        const img = new win.Image();
        img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(failure());
        img.onerror = () => reject(failure());
        img.src = url;
      }));
    }
    try {
      captureOwner: for (const owner of owners) {
        if (Date.now() >= deadline) throw imageDataError("IMAGE_TIMEOUT");
        if (excluded(owner, owner, selectors)) continue;
        const doc = owner.ownerDocument;
        if (doc.fonts?.ready) await bounded(doc.fonts.ready);
        const captionNode = owner.tagName === "FIGURE" ? Array.from(owner.querySelectorAll("figcaption")).find((node) => node.closest("figure") === owner) : null;
        const caption = captionNode ? visibleText(captionNode, selectors, true) : "";
        const label = graphicLabel(owner);
        const text = visibleText(owner, selectors);
        const alt = [label.trim() && label.trim() !== text && label.trim() !== caption ? label.trim() : "", text].filter(Boolean).join("\n");
        const nodes = [owner, ...Array.from(owner.querySelectorAll("*"))];
        const included = nodes.filter((node) => !excluded(node, owner, selectors) && !node.closest(DEFINITIONS));
        const rectangles = (owner.tagName === "FIGURE" ? included.slice(1) : included).map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
        if (!rectangles.length) throw failure();
        const extent = rectangles.reduce((bounds, rect) => ({ left: Math.min(bounds.left, rect.left), top: Math.min(bounds.top, rect.top), right: Math.max(bounds.right, rect.right), bottom: Math.max(bounds.bottom, rect.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        let width = extent.right - extent.left, height = extent.bottom - extent.top;
        if (!Number.isFinite(width * height) || width <= 0 || height <= 0) throw failure();
        const scale = Math.min(1, 32767 / width, 32767 / height, Math.sqrt(2 ** 25 / (width * height)));
        const canvas = doc.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw failure();
        const backdrop = [];
        for (let node = owner; node; node = node.parentElement) backdrop.push(win.getComputedStyle(node).backgroundColor);
        if (owner.tagName === "CANVAS") {
          context.drawImage(owner, 0, 0, canvas.width, canvas.height);
          if (!hasCanvasPixels(context, canvas, deadline)) {
            const reference = unreadableCanvasReference(owner, roots, alt);
            if (reference) result.set(owner, reference);
            continue;
          }
          context.globalCompositeOperation = "destination-over";
          for (const color of backdrop) {
            context.fillStyle = color;
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          for (const color of backdrop.reverse()) {
            context.fillStyle = color;
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          const clone = owner.cloneNode(true), copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
          const definitions = doc.createElementNS(SVG_NS, "svg");
          definitions.setAttribute("width", "0");
          definitions.setAttribute("height", "0");
          definitions.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;";
          const definitionRoot = doc.createElementNS(SVG_NS, "defs");
          definitions.append(definitionRoot);
          const referenceScope = doc.createElement("div");
          referenceScope.append(clone, definitions);
          const pseudoRules = [];
          for (let index = 0; index < nodes.length; index++) {
            if (Date.now() >= deadline) throw imageDataError("IMAGE_TIMEOUT");
            const original = nodes[index], copy = copies[index];
            const pseudoReferences = [];
            const style = win.getComputedStyle(original);
            if (copy.style) {
              const declarations = [];
              for (const property of Array.from(style)) {
                const value = style.getPropertyValue(property).replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
                  const local = localReference(url, doc);
                  return local ? `url("${local}")` : match;
                });
                if (value) declarations.push(`${property}:${value}!important;`);
                else copy.style.removeProperty(property);
              }
              copy.style.cssText += declarations.join("");
            }
            for (const attribute of Array.from(copy.attributes || [])) if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name);
            if ((original === owner || owner.contains(original)) && excluded(original, owner, selectors)) {
              const rect = original.getBoundingClientRect();
              copy.replaceChildren();
              copy.style?.setProperty("visibility", "hidden", "important");
              copy.style?.setProperty("width", rect.width + "px", "important");
              copy.style?.setProperty("height", rect.height + "px", "important");
              for (const attribute of Array.from(copy.attributes)) if (attribute.name !== "style") copy.removeAttribute(attribute.name);
              for (const property of Array.from(copy.style || [])) if (/url\(|@import/i.test(copy.style.getPropertyValue(property))) copy.style.removeProperty(property);
              if ("value" in copy) copy.value = "";
              continue;
            }
            if (original.namespaceURI !== SVG_NS) {
              for (const pseudo of ["::before", "::after"]) {
                const pseudoStyle = win.getComputedStyle(original, pseudo);
                if (!pseudoStyle.content || ["none", "normal"].includes(pseudoStyle.content) || pseudoStyle.display === "none") continue;
                const token = `reading-graphic-${index}-${pseudo.slice(2)}`;
                copy.classList.add(token);
                const declarations = Array.from(pseudoStyle).map((property) => `${property}:${pseudoStyle.getPropertyValue(property)}!important;`).join("");
                pseudoReferences.push(...[...declarations.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map((match) => match[1]));
                pseudoRules.push(`.${token}${pseudo}{${declarations}}`);
              }
            }
            if (original.tagName === "CANVAS") {
              const bitmap = doc.createElement("img");
              bitmap.src = original.toDataURL();
              bitmap.style.cssText = copy.style.cssText;
              copy.replaceWith(bitmap);
              continue;
            }
            if (original.tagName === "IMG") {
              const source = original.currentSrc || original.getAttribute("src");
              if (!source) throw failure();
              let embeddedSource;
              try {
                embeddedSource = await dataUrl(source, doc);
              } catch (error) {
                if (!failedFetches.has(error) || new URL(source, doc.baseURI).origin === new URL(doc.URL).origin) throw error;
                const layers = originalImageLayers(owner, included);
                if (layers.length < 2) throw error;
                state.originalImageLayers ||= /* @__PURE__ */ new Map();
                state.originalImageLayers.set(owner, layers);
                continue captureOwner;
              }
              copy.setAttribute("src", embeddedSource);
              for (const attribute of ["srcset", "sizes", "loading", "crossorigin"]) copy.removeAttribute(attribute);
            }
            for (const attribute of ["href", "xlink:href", "src"]) {
              const value = copy.getAttribute(attribute);
              if (!value) continue;
              if (copy.tagName === "A" || copy.localName === "a") {
                copy.removeAttribute(attribute);
                continue;
              }
              const local = localReference(value, doc);
              if (local) copy.setAttribute(attribute, local);
              else if (copy.localName === "use") throw failure();
              else if (["img", "image", "feImage"].includes(copy.localName)) copy.setAttribute(attribute, await dataUrl(value, doc));
            }
            for (const property of Array.from(copy.style || [])) {
              const value = copy.style.getPropertyValue(property);
              const matches = [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)];
              let embedded = value;
              for (const match of matches) {
                if (match[2].startsWith("#") || match[2].startsWith("data:")) continue;
                if (!/^(?:background|mask|-webkit-mask|border-image|list-style-image)/.test(property)) throw failure();
                embedded = embedded.replace(match[0], `url("${await dataUrl(match[2], doc)}")`);
              }
              if (embedded !== value || copy.style.getPropertyPriority(property) !== "important") {
                copy.style.setProperty(property, embedded, "important");
              }
            }
            const references2 = [...pseudoReferences, ...Array.from(copy.attributes).flatMap((attribute) => {
              const values = [...attribute.value.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map((match) => match[1]);
              if ((attribute.name === "href" || attribute.name.endsWith(":href")) && attribute.value.startsWith("#")) values.push(attribute.value);
              return values;
            })];
            for (const reference of references2) {
              const id = decodeURIComponent(reference.slice(1));
              if (Array.from(referenceScope.querySelectorAll("[id]")).some((node) => node.id === id)) continue;
              const source = doc.getElementById(id);
              if (!source || source.namespaceURI !== SVG_NS || source.matches("script,foreignObject")) throw failure();
              const definition = source.cloneNode(true);
              definitionRoot.append(definition);
              nodes.push(source, ...Array.from(source.querySelectorAll("*")));
              copies.push(definition, ...Array.from(definition.querySelectorAll("*")));
            }
          }
          const rootRect = owner.getBoundingClientRect(), rootStyle = win.getComputedStyle(owner);
          let matrix = new win.DOMMatrix();
          for (let node = owner; node; node = node.parentElement) {
            const transform = win.getComputedStyle(node).transform;
            if (transform && transform !== "none") matrix = new win.DOMMatrix(transform).multiply(matrix);
          }
          if (!matrix.is2D) throw failure();
          const dimension = (axis) => {
            const sides = axis === "width" ? ["left", "right"] : ["top", "bottom"];
            return parseFloat(rootStyle[axis]) + (rootStyle.boxSizing === "border-box" ? 0 : sides.reduce((total, side) => total + parseFloat(rootStyle.getPropertyValue(`padding-${side}`) || "0") + parseFloat(rootStyle.getPropertyValue(`border-${side}-width`) || "0"), 0));
          };
          const sourceWidth = dimension("width"), sourceHeight = dimension("height");
          const corners = [[0, 0], [sourceWidth, 0], [0, sourceHeight], [sourceWidth, sourceHeight]].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y }));
          const left = Math.min(...corners.map((point) => point.x)), top = Math.min(...corners.map((point) => point.y));
          if (!Number.isFinite(sourceWidth * sourceHeight) || Math.abs(Math.max(...corners.map((point) => point.x)) - left - rootRect.width) > 2 || Math.abs(Math.max(...corners.map((point) => point.y)) - top - rootRect.height) > 2) throw failure();
          const wrapper = doc.createElement("div");
          wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
          clone.style.setProperty("position", "absolute", "important");
          clone.style.setProperty("margin", "0", "important");
          clone.style.setProperty("transform", `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},0,0)`, "important");
          clone.style.setProperty("transform-origin", "0 0", "important");
          clone.style.setProperty("left", rootRect.left - extent.left - left + "px", "important");
          clone.style.setProperty("top", rootRect.top - extent.top - top + "px", "important");
          wrapper.append(clone, definitions);
          if (pseudoRules.length) {
            const styles = doc.createElement("style");
            styles.textContent = pseudoRules.join("\n");
            wrapper.append(styles);
          }
          const svgUrl = await bounded(toSvg(wrapper, {
            width,
            height,
            skipFonts: true,
            includeQueryParams: true,
            includeStyleProperties: [],
            imagePlaceholder: FAILURE_IMAGE,
            fetchRequestInit: { credentials: "omit", signal: controller.signal },
            onImageErrorHandler: () => {
              throw failure();
            }
          }));
          const xml = decodeURIComponent(svgUrl.slice(svgUrl.indexOf(",") + 1));
          if (xml.includes(FAILURE_IMAGE) || /(?:href|src)\s*=\s*["'](?:https?:|blob:)/i.test(xml) || /url\(\s*["']?(?:https?:|blob:)/i.test(xml)) throw failure();
          const serialized = new win.DOMParser().parseFromString(xml, "image/svg+xml");
          if (serialized.querySelector("parsererror")) throw failure();
          const ids = new Set(Array.from(serialized.querySelectorAll("[id]")).map((node) => node.id));
          const references = [...xml.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map((match) => match[1]);
          references.push(...Array.from(serialized.querySelectorAll("*")).flatMap((node) => Array.from(node.attributes).filter((attribute) => (attribute.name === "href" || attribute.name.endsWith(":href")) && attribute.value.startsWith("#")).map((attribute) => attribute.value)));
          if (references.some((reference) => !ids.has(decodeURIComponent(reference.slice(1))))) throw failure();
          if (scale < 1) {
            serialized.documentElement.setAttribute("width", String(canvas.width));
            serialized.documentElement.setAttribute("height", String(canvas.height));
          }
          const rendered = await image(scale < 1 ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new win.XMLSerializer().serializeToString(serialized)) : svgUrl);
          context.drawImage(rendered, 0, 0, canvas.width, canvas.height);
        }
        const src = canvas.toDataURL("image/png");
        const bytes = imageDataUrlBytes(src);
        if (detectImageMime(bytes) !== "image/png" || bytes.byteLength > MAX_IMAGE_BYTES) throw failure();
        result.set(owner, { type: "image", isGraphic: true, src, alt, caption });
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw imageDataError("IMAGE_TIMEOUT");
      throw typeof error?.code === "string" ? error : failure();
    } finally {
      win.clearTimeout(timer);
    }
  }

  // scripts/extraction/extractor/annotations.js
  var CONTROL_REGION = 'nav,form,input,select,textarea,[role="menu"],[role="menubar"],[role="listbox"],[role="tablist"],[role="navigation"]';
  var CITATION_REFERENCE = '[role="doc-biblioref"],[epub\\:type~="biblioref"],[rel~="citation"],[data-citation],.cite-ref';
  var NOTE_REGION = '[popover],[role~="doc-footnote"],[role~="doc-endnote"],[epub\\:type~="footnote"],[epub\\:type~="endnote"]';
  var NOTE_REFERENCE = '[role~="doc-noteref"],[epub\\:type~="noteref"],[data-footnote-ref]';
  function isAuthoredAnnotation(target) {
    return !!target && !target.matches(CONTROL_REGION) && !target.querySelector(CONTROL_REGION);
  }
  function reuseAnnotationCitations(content, dependencies, document2) {
    const paragraphKey = (item) => {
      if (item.type !== "paragraph" || !item.html?.includes("<a")) return null;
      const fragment = document2.createElement("template");
      fragment.innerHTML = item.html;
      const links = Array.from(fragment.content.querySelectorAll("a[href]"), (link) => link.getAttribute("href"));
      if (!links.length || !links.every((link) => /^https?:\/\//i.test(link))) return null;
      return JSON.stringify([fragment.content.textContent.trim().replace(/\s+/g, " "), links]);
    };
    const bodyParagraphs = /* @__PURE__ */ new Map();
    for (const item of content) {
      const key = paragraphKey(item);
      if (key) bodyParagraphs.set(key, bodyParagraphs.has(key) ? null : item);
    }
    const aliases = /* @__PURE__ */ new Map();
    for (const { target, label, items, citation } of dependencies) {
      if (!items.length) continue;
      const key = citation && target.hasAttribute("popover") && items.length === 1 ? paragraphKey(items[0]) : null;
      const existing = key ? bodyParagraphs.get(key) : null;
      if (existing) {
        existing.id ||= target.id;
        if (existing.id !== target.id) aliases.set("#" + target.id, "#" + existing.id);
        continue;
      }
      content.push({ type: "heading", level: 3, text: label, format: "text", id: target.id }, ...items);
    }
    if (!aliases.size) return;
    const rewrite = (html) => {
      if (!html?.includes("doc-noteref")) return html;
      const fragment = document2.createElement("template");
      fragment.innerHTML = html;
      for (const link of Array.from(fragment.content.querySelectorAll('a[role="doc-noteref"][href]'))) {
        const alias = aliases.get(link.getAttribute("href"));
        if (alias) link.setAttribute("href", alias);
      }
      return fragment.innerHTML;
    };
    for (const item of content) {
      if (item.html) {
        const html = rewrite(item.html);
        if (item.text === item.html) item.text = html;
        item.html = html;
      }
      if (item.caption) item.caption = rewrite(item.caption);
      if (item.headers) item.headers = item.headers.map(rewrite);
      if (item.rows) item.rows = item.rows.map((row) => row.map(rewrite));
      for (const entry of item.items || []) if (typeof entry === "object" && entry.html) entry.html = rewrite(entry.html);
    }
  }
  function emittedReadingIds(content, document2) {
    const ids = /* @__PURE__ */ new Set();
    const fragment = document2.createElement("template");
    for (const item of content) {
      if (item.id) ids.add(item.id);
      const html = [item.html, item.caption, ...item.headers || [], ...(item.rows || []).flat()];
      for (const part of item.items || []) if (typeof part === "object") {
        if (part.id) ids.add(part.id);
        html.push(part.html);
      }
      for (const value of html) {
        if (!value?.includes("id=")) continue;
        fragment.innerHTML = value;
        for (const target of Array.from(fragment.content.querySelectorAll("[id]"))) ids.add(target.id);
      }
    }
    return ids;
  }
  function getAnnotationTarget(reference) {
    if (reference.closest("pre,code,math,mjx-container,.MathJax,.katex")) return null;
    if (reference.tagName === "A" && isDocumentNoteReference(reference)) {
      const target = getDocumentFragmentTarget(reference);
      return isAuthoredAnnotation(target) ? target : null;
    }
    if (!reference.matches('button,[role="button"],a')) return null;
    if (!reference.closest("p,li,h1,h2,h3,h4,h5,h6,td,th,figcaption,blockquote")) return null;
    for (const attribute of ["popovertarget", "aria-describedby", "aria-controls"]) {
      for (const id of (reference.getAttribute(attribute) || "").split(/\s+/).filter(Boolean)) {
        const target = reference.ownerDocument.getElementById(id);
        if (!isAuthoredAnnotation(target) || target.contains(reference)) continue;
        if (attribute !== "popovertarget" && !target.closest(NOTE_REGION) && !reference.matches(`${NOTE_REFERENCE},${CITATION_REFERENCE}`)) continue;
        if (target.textContent?.trim() && (target.matches("p,li,blockquote,pre,[popover]") || target.querySelector("p,li,blockquote,pre"))) return target;
      }
    }
    return null;
  }
  function collectAnnotationTargets(elements, emittedIds, excludedSelectors = [], accept = (reference) => !!reference) {
    const pending = elements.map((owner) => ({ owner, projected: false }));
    const visited = /* @__PURE__ */ new Set(), targets = [], seenTargets = /* @__PURE__ */ new Set();
    while (pending.length) {
      const { owner, projected } = pending.shift();
      if (visited.has(owner)) continue;
      visited.add(owner);
      const references = [owner, ...Array.from(owner.querySelectorAll('a,button,[role="button"]'))];
      for (const reference of references) {
        if (isSourceExcluded(reference, excludedSelectors)) continue;
        const target = getAnnotationTarget(reference);
        if (!target || seenTargets.has(target) || emittedIds.has(target.id) || isSourceExcluded(target, excludedSelectors)) continue;
        if (!projected && !accept(reference)) continue;
        seenTargets.add(target);
        const clone = cloneAnnotationContent(target, excludedSelectors);
        targets.push({
          target,
          clone,
          citation: reference.matches(CITATION_REFERENCE),
          label: reference.textContent?.trim() || reference.getAttribute("aria-label") || "Note"
        });
        pending.push({ owner: clone, projected: true });
      }
    }
    return targets;
  }
  function cloneAnnotationContent(target, exclusions = []) {
    let clone = cloneReadingContent(target, exclusions, null, { disclosed: true });
    for (const nested of Array.from(clone.querySelectorAll("[popover],script,style,template"))) nested.remove();
    for (const attribute of ["id", "popover", "hidden", "aria-hidden", "style", "class", "role"]) clone.removeAttribute(attribute);
    if (["LI", "DD", "DT", "SPAN", "DIALOG"].includes(clone.tagName)) {
      const wrapper = target.ownerDocument.createElement("div");
      wrapper.append(...clone.childNodes);
      clone = wrapper;
    }
    return clone;
  }
  function materializeAnnotationReferences(clone) {
    for (const reference of Array.from(clone.querySelectorAll('button,[role="button"],a'))) {
      if (reference.closest("pre,code,math,mjx-container,.MathJax,.katex")) continue;
      const target = getAnnotationTarget(reference);
      if (!target?.id) {
        if (reference.matches('button,[role="button"]')) reference.remove();
        continue;
      }
      if (reference.tagName === "A" && reference.hasAttribute("href")) continue;
      const anchor = clone.ownerDocument.createElement("a");
      anchor.setAttribute("href", "#" + target.id);
      anchor.setAttribute("role", "doc-noteref");
      const visibleLabel = reference.textContent?.trim();
      anchor.textContent = visibleLabel || reference.getAttribute("aria-label") || "Note";
      if (visibleLabel) reference.replaceWith(anchor);
      else {
        const marker = clone.ownerDocument.createElement("sup");
        marker.append(anchor);
        reference.replaceWith(" ", marker);
      }
    }
  }

  // scripts/extraction/extractor/filters.js
  function semanticClassNames(element) {
    return Array.from(element.classList).filter((name) => !name.includes("[")).join(" ").toLowerCase();
  }
  function isInteractiveControlLabel(element) {
    const label = element.closest("label,[id]");
    if (!label) return false;
    if (label.tagName === "LABEL" && label.getAttribute("for")) return true;
    if (!label.id || !label.contains(element)) return false;
    return Array.from(element.ownerDocument.querySelectorAll("[aria-labelledby]")).some((control) => (control.getAttribute("aria-labelledby") || "").split(/\s+/).includes(label.id) && control.matches('input,select,button,[role="radiogroup"],[role="listbox"],[role="tablist"],[role="menu"]'));
  }
  function matchesNavigationPattern(text, patterns) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }
  function isIcon(element) {
    if (element.closest("pre,code,math,mjx-container,.MathJax,.katex")) return false;
    const tagName = element.tagName.toLowerCase();
    if (tagName === "svg") return true;
    const className = semanticClassNames(element);
    const id = (element.id || "").toLowerCase();
    if (/(?:^|[\s_-])(?:icon|fa|fas|far|fab)(?:$|[\s_-])/.test(className) || /(?:^|[\s_-])icon(?:$|[\s_-])/.test(id)) {
      return true;
    }
    if (tagName === "span" || tagName === "i" || tagName === "em" || tagName === "sup") {
      const text = (element.textContent || "").trim();
      if (text.length <= 3 && /[←→↑↓↗↘◀▶▲▼↩]/.test(text)) {
        return true;
      }
      if (tagName === "sup" && text.toLowerCase().includes("open these")) {
        return true;
      }
    }
    if (tagName === "img") {
      const imgElement = (
        /** @type {HTMLImageElement} */
        element
      );
      const alt = (imgElement.alt || "").trim();
      const src = (imgElement.src || "").toLowerCase();
      if (alt === "↩" || /[←→↑↓↗↘↩]/.test(alt) || src.includes("emoji") && alt.includes("arrow")) {
        return true;
      }
    }
    return false;
  }
  function isWidget(win, element) {
    const style = safeGetComputedStyle(win, element);
    if (!style) return false;
    const position = style.position;
    if (position !== "fixed" && position !== "absolute") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width > 400 || rect.height > 400) return false;
    const paragraphs = element.querySelectorAll("p");
    if (paragraphs.length > 2) return false;
    return true;
  }
  function isNavigationParagraph(text, navPatternsStartsWith, paywallPatterns) {
    const textTrimmed = text.trim();
    const textLength = textTrimmed.length;
    if (textLength > 200) {
      return false;
    }
    const linkCount = (textTrimmed.match(/<a\s+/gi) || []).length;
    const textWithoutLinks = textTrimmed.replace(/<[^>]+>/g, "").trim();
    const linkDensity = textWithoutLinks.length > 0 ? linkCount / (textWithoutLinks.length / 50) : linkCount;
    if (linkCount >= 2 && textLength < 100) {
      return true;
    }
    if (navPatternsStartsWith.some((pattern) => pattern.test(textTrimmed))) {
      return true;
    }
    const textLower = text.toLowerCase();
    if (paywallPatterns.some((pattern) => textLower.includes(pattern.toLowerCase()))) {
      return true;
    }
    return false;
  }
  function isSubscriptionFormContent(element) {
    const form = element.closest("form");
    if (!form) return false;
    const emailFields = Array.from(form.querySelectorAll("input")).filter((input) => (input.getAttribute("type") || "").toLowerCase() === "email" || (input.getAttribute("name") || "").toLowerCase() === "email" || /^e-?mail(?: address)?$/i.test((input.getAttribute("aria-label") || "").trim()) || (input.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/).includes("email"));
    if (!emailFields.length) return false;
    const labels = [form.getAttribute("aria-label") || ""];
    for (const id of (form.getAttribute("aria-labelledby") || "").split(/\s+/)) {
      if (id) labels.push(form.ownerDocument.getElementById(id)?.textContent || "");
    }
    const subscription = (label) => /\b(?:sign[\s-]*up|subscribe|subscription)\b/i.test(label);
    const actions = Array.from(form.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]'));
    const subscriptionActions = actions.filter((action) => [
      action.textContent || "",
      action.getAttribute("aria-label") || "",
      action.getAttribute("value") || "",
      ...Array.from(action.querySelectorAll("*")).map((part) => part.textContent || "")
    ].some(subscription));
    if (!subscriptionActions.length && !labels.some(subscription)) return false;
    for (const email of emailFields) {
      for (const action of subscriptionActions.length ? subscriptionActions : actions) {
        let component = email.parentElement;
        while (component && component !== form && !component.contains(action)) component = component.parentElement;
        if (!component || !component.contains(element)) continue;
        if (component === form && form.querySelector('article,main,[itemprop~="articleBody"]')) continue;
        return true;
      }
    }
    return false;
  }
  var PANEL_HEADING = "h2,h3,h4,h5,h6";
  var FORM_CONTROL = 'button,input[type="submit"],[role="button"]';
  var SUBSCRIBE_PROMPT = /^(?:subscribe|sign[\s-]*up)\b/i;
  var NEWSLETTER_INVITATION = /^(?:(?:subscribe|sign[\s-]*up)\s+(?:to|for)|join)\s+(?:(?:our|the)\s+)?(?:\S+\s+){0,2}(?:newsletter|mailing list)\b/i;
  var PANEL_PROMPT = /^(?:subscribe|sign[\s-]*up) (?:to|for) [^.!?:]{1,100}$/i;
  var SUBSCRIPTION_PANEL = /^(?:newsletter|subscription)(?: (?:promotion|sign[\s-]*up|form))?$/i;
  var PROTECTED_READING = 'article,main,[role~="article"],[role~="main"],[itemprop~="articleBody"],.instapaper_body,h1,table,pre,blockquote,math';
  function isSingleChildBlock(element) {
    return element?.matches("div,section") && element.childElementCount === 1 && element.textContent.trim() === element.firstElementChild.textContent.trim();
  }
  function findSignupBanner(sibling, linkedTargets) {
    let figure = sibling;
    while (isSingleChildBlock(figure)) {
      if (linkedTargets.has(figure)) return null;
      figure = figure.firstElementChild;
    }
    if (!figure?.matches("figure") || linkedTargets.has(figure) || figure.querySelector("figcaption") || figure.textContent.trim()) return null;
    return Array.from(figure.querySelectorAll("img[alt]")).some((image) => /\b(?:promotional banner|newsletter (?:banner|sign[\s-]*up))\b/i.test(image.getAttribute("alt") || "")) ? figure : null;
  }
  function findPublisherFormRegions(root) {
    const regions = /* @__PURE__ */ new Set();
    const linkedTargets = new Set(Array.from(root.querySelectorAll('a[href*="#"]'), getDocumentFragmentTarget));
    for (const link of Array.from(root.querySelectorAll('a[href="#"]'))) {
      if (link.closest("p,blockquote,pre,figcaption") || linkedTargets.has(link)) continue;
      const action = (link.getAttribute("class") || "").replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s_-]+/);
      if (action.some((word) => /^(?:show|open|toggle)$/i.test(word)) && action.some((word) => /^comments?$/i.test(word))) regions.add(link);
    }
    for (const form of Array.from(root.querySelectorAll("form"))) {
      const subscription = isSubscriptionFormContent(form);
      const comment = form.querySelector('textarea[name="comment" i]') && form.querySelector(FORM_CONTROL) && form.querySelector('input[name="email" i],input[name="author" i]');
      if (!subscription && !comment || form.querySelector(PROTECTED_READING) || form.closest("blockquote,pre")) continue;
      regions.add(form);
      for (let panel = form.parentElement; panel && panel !== root; panel = panel.parentElement) {
        if (panel.matches(PROTECTED_READING) || panel.querySelector(PROTECTED_READING) || panel.querySelectorAll("form").length !== 1) break;
        const heading = Array.from(panel.querySelectorAll(PANEL_HEADING));
        const label = (panel.getAttribute("aria-label") || "").trim();
        const caption = panel.firstElementChild;
        const isCommentPanel = comment && caption?.matches("p," + PANEL_HEADING) && /^(?:leave a (?:comment|reply)|post a comment)$/i.test(caption.textContent.trim()) && !Array.from(panel.childNodes).some((node) => node !== form && node !== caption && node.textContent?.trim());
        const isSubscriptionPanel = subscription && (SUBSCRIPTION_PANEL.test(label) || heading.length === 1 && PANEL_PROMPT.test(heading[0].textContent.trim()) && compareDomOrder(heading[0], form) < 0 && !form.contains(heading[0]) && Array.from(panel.querySelectorAll("a[href]")).some((link) => /^(?:privacy policy|terms of (?:use|service))$/i.test(link.textContent.trim())));
        if (!isCommentPanel && !isSubscriptionPanel) continue;
        if (linkedTargets.has(panel) || heading.some((node) => linkedTargets.has(node))) break;
        regions.add(panel);
        if (label && isSubscriptionPanel) addPanelSkipControls(panel, label, regions);
        break;
      }
    }
    const paragraphs = root.matches("p") ? [root] : Array.from(root.querySelectorAll("p"));
    for (const paragraph of paragraphs) {
      if (paragraph.closest("blockquote,pre,figcaption,form") || linkedTargets.has(paragraph)) continue;
      const actions = Array.from(paragraph.querySelectorAll("a[href]"));
      const firstAction = actions[0]?.textContent.trim() || "";
      if (!SUBSCRIBE_PROMPT.test(firstAction) || !paragraph.textContent.trim().startsWith(firstAction)) continue;
      if (!actions.every((action) => {
        try {
          const pathname = new URL(action.getAttribute("href"), action.baseURI).pathname;
          return /(?:^|[/_-])(?:newsletters?|subscribe|subscriptions?|signup|sign-up)(?:$|[/_.-])/i.test(pathname);
        } catch {
          return false;
        }
      })) continue;
      regions.add(paragraph);
      for (let block = paragraph; block !== root; block = block.parentElement) {
        for (const sibling of [block.previousElementSibling, block.nextElementSibling]) {
          const banner = findSignupBanner(sibling, linkedTargets);
          if (banner) regions.add(banner);
        }
        if (!isSingleChildBlock(block.parentElement) || linkedTargets.has(block.parentElement)) break;
      }
    }
    for (const region of findPublisherWidgets(root, linkedTargets)) regions.add(region);
    return [...regions];
  }
  function findPublisherWidgets(root, linkedTargets) {
    const regions = [];
    const ownsFragment = (element) => linkedTargets.has(element) || [...linkedTargets].some((target) => target && element.contains(target));
    const normalize = (text) => (text || "").trim().replace(/\s+/g, " ");
    for (const link of root.querySelectorAll("a[href]")) {
      if (!NEWSLETTER_INVITATION.test(normalize(link.textContent)) || link.closest("p,blockquote,pre,figure,figcaption,form")) continue;
      for (let panel = link.parentElement; panel && panel !== root; panel = panel.parentElement) {
        if (panel.matches(PROTECTED_READING) || panel.querySelector(PROTECTED_READING) || ownsFragment(panel)) break;
        if (panel.querySelectorAll("a[href]").length !== 1) break;
        const headings = Array.from(panel.querySelectorAll(PANEL_HEADING));
        const descriptions = Array.from(panel.querySelectorAll("p"));
        if (headings.length > 1 || descriptions.length > 1) break;
        if (headings.length !== 1 || descriptions.length !== 1 || !NEWSLETTER_INVITATION.test(normalize(descriptions[0].textContent)) || panel.querySelector("img,picture,video,canvas,ul,ol,dl,form,input,textarea")) continue;
        const labels = [headings[0], descriptions[0], link];
        const walker = panel.ownerDocument.createTreeWalker(panel, panel.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
        let hasOtherText = false;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (normalize(node.textContent) && !labels.some((label) => label.contains(node))) {
            hasOtherText = true;
            break;
          }
        }
        if (!hasOtherText) regions.push(panel);
        break;
      }
    }
    for (const counter of root.querySelectorAll("[data-view-count],[data-view-counter]")) {
      if (counter.closest("p,blockquote,pre,figure,figcaption") || counter.querySelector(PROTECTED_READING) || ownsFragment(counter)) continue;
      const count = normalize(counter.textContent);
      if (new RegExp("^\\p{N}[\\p{N}.,\\s]*(?:(?:page\\s+)?views?)?$", "iu").test(count) && (counter.closest("[data-view-counter-url]") || /\bviews?\b/i.test(count + " " + counter.getAttribute("aria-label")))) {
        regions.push(counter);
      }
    }
    const headline = Array.from(root.querySelectorAll("h1")).find(isDocumentHeadline);
    if (!headline) return regions;
    for (const link of root.querySelectorAll("a[href]")) {
      if (compareDomOrder(link, headline) >= 0 || link.closest("p,blockquote,pre,figure,figcaption") || ownsFragment(link)) continue;
      if (link.matches('[rel~="tag"]')) {
        regions.push(link);
        continue;
      }
      if (!/^\[\s*[^\[\]]+\s*\]$/.test(normalize(link.textContent))) continue;
      try {
        const href = new URL(link.getAttribute("href"), link.baseURI);
        if (href.origin === new URL(root.ownerDocument.URL).origin && /(?:^|\/)search\/?$/i.test(href.pathname) && href.search) regions.push(link);
      } catch {
      }
    }
    return regions;
  }
  function addPanelSkipControls(panel, label, regions) {
    const wrapper = panel.closest("figure,section");
    if (!wrapper) return;
    const normalize = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
    const after = "after " + normalize(label);
    for (const link of Array.from(wrapper.querySelectorAll('a[href*="#"]'))) {
      if (!/^skip\b/i.test(link.textContent.trim()) || compareDomOrder(link, panel) >= 0) continue;
      const target = getDocumentFragmentTarget(link);
      if (wrapper.contains(target) && compareDomOrder(panel, target) < 0 && target.matches('[role~="note"]') && normalize(target.getAttribute("aria-label") || target.textContent || "") === after) {
        regions.add(link);
        regions.add(target);
      }
    }
  }
  function isExcluded(win, element, constants, readingRoots = [], tocRoots = [], selectedIllustration = false) {
    const {
      EXCLUDED_CLASSES: EXCLUDED_CLASSES2,
      PAYWALL_CLASSES: PAYWALL_CLASSES2,
      NAV_PATTERNS_CONTAINS,
      COURSE_AD_PATTERNS: COURSE_AD_PATTERNS2
    } = constants;
    const tagName = element.tagName.toLowerCase();
    const className = semanticClassNames(element);
    const id = (element.id || "").toLowerCase();
    const isSemanticContainer = tagName === "article" || tagName === "main";
    const isImageOrFigure = tagName === "img" || tagName === "figure";
    const readingOwned = isReadingOwned(element, readingRoots);
    const authoredHeading = readingOwned && /^h[1-6]$/.test(tagName);
    const selectedFlows = readingRoots.filter((root) => root.contains(element) && root.querySelector("p,pre,table,blockquote"));
    const layoutRoles = ["nav", "navigation", "menu", "sidebar", "related", "social", "share"];
    const hasAuthoredAnchor = (node) => isReadingOwned(node, readingRoots) && (node.matches("h1,h2,h3,h4,h5,h6") || node.matches("section") && node.querySelector(":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6"));
    const hasExactRole = (node, role2) => node.id.toLowerCase() === role2 || Array.from(node.classList).some((name) => name.toLowerCase() === role2);
    if (element.closest(INTERFACE_REGIONS) || isPublisherLinkAction(element)) return true;
    const control = element.closest('button,[role="button"],input,select,textarea');
    if (control && !getAnnotationTarget(control)) {
      const figure = element.closest("figure");
      const authoredImage = tagName === "img" && readingOwned && control.matches('button,[role="button"]') && element.getAttribute("alt")?.trim() && figure?.contains(control) && !element.closest("figcaption") && Array.from(figure.querySelectorAll("figcaption")).some((caption) => caption.closest("figure") === figure && caption.textContent?.trim());
      if (!authoredImage) return true;
    }
    const selectedMedia = readingRoots.some((root) => root.matches("figure,img,picture,svg,canvas") && (root === element || root.contains(element)));
    const illustrationAside = selectedIllustration ? element.closest('aside,[role~="complementary"]') : null;
    const selectedInline = readingRoots.some((root) => root.matches("p,span,div") && !root.querySelector("article,section,p,table,ul,ol,figure,form") && (root === element || root.contains(element)));
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const ancestorStyle = safeGetComputedStyle(win, ancestor);
      if (ancestorStyle?.display === "none") return true;
      if (["data-module", "data-component", "data-type"].some((attribute) => ["ad", "advertisement"].includes((ancestor.getAttribute(attribute) || "").toLowerCase()))) return true;
    }
    const style = safeGetComputedStyle(win, element);
    if (!style) {
      return false;
    }
    if (isImageOrFigure) {
      if (style.display === "none" || style.visibility === "hidden") {
        const hasLazySrc = element.hasAttribute("data-src") || element.hasAttribute("data-lazy-src") || element.hasAttribute("data-original") || element.hasAttribute("data-srcset");
        if (hasLazySrc) return false;
        if (tagName === "figure") {
          const img = element.querySelector("img");
          if (img && (img.hasAttribute("data-src") || img.hasAttribute("data-lazy-src"))) {
            return false;
          }
        }
        return true;
      }
    } else {
      if (style.display === "none" || style.visibility === "hidden") {
        return true;
      }
    }
    if (isSubscriptionFormContent(element)) return true;
    if (isInteractiveControlLabel(element)) return true;
    if (tagName === "iframe") {
      const iframeElement = (
        /** @type {HTMLIFrameElement} */
        element
      );
      try {
        const hostname = new URL(iframeElement.src, element.ownerDocument.baseURI).hostname.toLowerCase();
        const adHosts = ["doubleclick.net", "googleadservices.com", "pubmatic.com", "imasdk.googleapis.com"];
        if (adHosts.some((host) => hostname === host || hostname.endsWith("." + host))) return true;
      } catch (_) {
      }
    }
    if (isIcon(element) && !getGraphicReadingOwner(element, readingRoots)) return true;
    if (!readingOwned && (tagName === "aside" || element.getAttribute("role") === "complementary")) {
      return true;
    }
    const text = element.textContent || "";
    const textLower = text.toLowerCase();
    const textTrimmed = text.trim();
    if (!isSemanticContainer && element.querySelector && element.querySelector('input[type="email"]')) {
      const hasNewsletterText = textLower.includes("newsletter") || textLower.includes("subscribe") || textLower.includes("signup");
      if (hasNewsletterText) return true;
      const isInNavArea = safeClosest(element, "nav, aside, .sidebar, footer, header") !== null;
      if (isInNavArea) return true;
    }
    const adClasses = ["book-cta", "course-cta", "product-cta", "course-ad", "product-ad"];
    if (adClasses.some((adClass) => className.includes(adClass) || id.includes(adClass))) {
      return true;
    }
    const dataModule = (element.getAttribute("data-module") || "").toLowerCase();
    const dataComponent = (element.getAttribute("data-component") || "").toLowerCase();
    const dataType = (element.getAttribute("data-type") || "").toLowerCase();
    if (dataModule === "ad" || dataModule === "advertisement" || dataComponent === "ad" || dataComponent === "advertisement" || dataType === "ad" || dataType === "advertisement") {
      return true;
    }
    const dataOuter = ((element.getAttribute("data-widget") || "") + (element.getAttribute("data-embed") || "")).toLowerCase();
    if (dataOuter.includes("google") || dataOuter.includes("facebook") || dataOuter.includes("twitter")) {
      return true;
    }
    if (PAYWALL_CLASSES2.some((paywallClass) => className.includes(paywallClass) || id.includes(paywallClass))) {
      return true;
    }
    const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
    const hasPrice = pricePattern.test(text);
    const isCourseAd = COURSE_AD_PATTERNS2.some((pattern) => textLower.includes(pattern));
    if (!readingOwned && hasPrice && isCourseAd) {
      return true;
    }
    const role = element.getAttribute("role") || "";
    if (role === "tab" || safeClosest(element, '[role="tablist"]') !== null) {
      return true;
    }
    if (!readingOwned && !isSemanticContainer && !isImageOrFigure) {
      const isParagraphOrHeading = tagName === "p" || tagName.match(/^h[1-6]$/);
      if (isParagraphOrHeading) {
        if (textTrimmed.length < 200 && matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
          return true;
        }
      }
    }
    if (!readingOwned && !isSemanticContainer && (textLower.includes("sign up to our newsletter") || textLower.includes("newsletter") && textLower.includes("subscribe"))) {
      return true;
    }
    if (!readingOwned && (textLower.includes("powered by salesforce") || textLower.includes("marketing cloud"))) {
      return true;
    }
    for (const excluded2 of EXCLUDED_CLASSES2) {
      if ((authoredHeading || selectedMedia || selectedInline) && ["header", "article-section-title"].includes(excluded2)) continue;
      if (selectedMedia && excluded2 === "overlay") continue;
      const pattern = new RegExp(`\\b${excluded2}\\b`);
      if ((pattern.test(className) || (id === excluded2 || pattern.test(id) && !hasAuthoredAnchor(element)) || className === excluded2 || className.startsWith(excluded2 + "-") || className.endsWith("-" + excluded2)) && !isEditorialLayoutLabel(element, element, excluded2) && !(excluded2 === "sidebar" && isReferencedReadingAside(element, readingRoots, tocRoots))) {
        return true;
      }
    }
    if (!isSemanticContainer) {
      let parent = element.parentElement;
      let iterations = 0;
      const maxIterations = 50;
      while (parent && parent !== element.ownerDocument.body && iterations < maxIterations) {
        iterations++;
        const parentClass = semanticClassNames(parent);
        const parentId = (parent.id || "").toLowerCase();
        const parentTag = parent.tagName.toLowerCase();
        if (parentTag === "nav" || parentTag === "footer" || parent.getAttribute("role") === "navigation") return true;
        if (EXCLUDED_CLASSES2.some((excluded2) => {
          if ((authoredHeading || selectedMedia || selectedInline) && ["header", "article-section-title"].includes(excluded2)) return false;
          if (selectedMedia && excluded2 === "overlay") return false;
          if (excluded2 === "sidebar" && illustrationAside && parent.contains(illustrationAside)) return false;
          if (excluded2 === "next" || excluded2 === "prev" || excluded2 === "previous") {
            return parentClass.split(/\s+/).includes(excluded2) || parentId === excluded2;
          }
          const escaped = excluded2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const role2 = new RegExp(`(?:^|[\\s_-])${escaped}(?:$|[\\s_-])`);
          const matchingRole = role2.test(parentClass) || parentId === excluded2 || role2.test(parentId) && !hasAuthoredAnchor(parent);
          if (!matchingRole || isEditorialLayoutLabel(parent, element, excluded2) || excluded2 === "sidebar" && isReferencedReadingAside(parent, readingRoots, tocRoots)) return false;
          const wrapsSelectedFlow = layoutRoles.includes(excluded2) && !hasExactRole(parent, excluded2) && !parent.matches('aside,[role~="complementary"],header,[role~="banner"]') && selectedFlows.some((root) => root !== parent && parent.contains(root));
          return !wrapsSelectedFlow;
        })) return true;
        const clearAdIndicators = [/\bad\b/, /\badvertisement\b/, /\bsponsor\b/];
        const isClearAd = clearAdIndicators.some(
          (indicator) => indicator.test(parentClass) || indicator.test(parentId)
        );
        if (isClearAd || parentTag === "aside" && parent !== illustrationAside && !isReadingOwned(parent, readingRoots) && !isArticleContentFigure(win, element)) {
          return true;
        }
        parent = parent.parentElement;
      }
    }
    return false;
  }
  function shouldSkipStronglyExcluded(element) {
    const className = semanticClassNames(element);
    const id = (element.id || "").toLowerCase();
    const strongPatterns = [/\bad\b/, /\bads\b/, /\bsponsor\b/];
    for (const pattern of strongPatterns) {
      if (pattern.test(className) || pattern.test(id)) {
        return true;
      }
    }
    return false;
  }

  // scripts/extraction/extractor/inline-content.js
  var MATHML = "http://www.w3.org/1998/Math/MathML";
  var MATH_TOKENS = ["mi", "mn", "mo", "mtext"];
  var MATH_GROUPS = ["math", "semantics", "mrow", "msup", "msub"];
  var MATH_LAYOUT = ["mfrac", "msqrt", "msubsup", "mspace", "mtable", "mtr", "mtd"];
  function presentationChildren(element) {
    const children = Array.from(element.children);
    if (element.localName !== "semantics") return children;
    return children.slice(0, 1).filter((child) => child.namespaceURI === MATHML && !["annotation", "annotation-xml"].includes(child.localName));
  }
  function renderSimpleMathMl(math, outputDocument = math.ownerDocument, allowLinearLayout = false) {
    try {
      let render = function(element) {
        if (element.namespaceURI !== MATHML) return null;
        const tag = element.localName;
        if (!MATH_TOKENS.includes(tag) && !MATH_GROUPS.includes(tag) && !(allowLinearLayout && MATH_LAYOUT.includes(tag))) return null;
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.name === "class" || attribute.name.startsWith("data-semantic-") || attribute.name === "data-speech-node") continue;
          if (tag === "math" && (attribute.name === "xmlns" || attribute.name === "display" && /^(inline|block)$/.test(attribute.value))) continue;
          if (tag === "mo" && attribute.name === "stretchy" && /^(true|false)$/.test(attribute.value)) continue;
          if (allowLinearLayout && (tag === "mspace" && ["width", "height", "depth"].includes(attribute.name) || ["mtable", "mtd", "mtr"].includes(tag) && ["columnalign", "rowalign", "columnspacing", "rowspacing"].includes(attribute.name))) continue;
          return null;
        }
        if (MATH_TOKENS.includes(tag)) {
          if (Array.from(element.childNodes).some((node) => node.nodeType !== 3) || !element.textContent) return null;
          return outputDocument.createTextNode(element.textContent);
        }
        if (tag === "mspace") return element.childNodes.length ? null : outputDocument.createTextNode(" ");
        if (Array.from(element.childNodes).some((node) => node.nodeType !== 1 && (node.nodeType !== 3 || node.textContent?.trim()))) return null;
        const children = presentationChildren(element);
        if (!children.length || ["msup", "msub", "mfrac"].includes(tag) && children.length !== 2 || tag === "msubsup" && children.length !== 3) return null;
        const parts = children.map(render);
        if (parts.some((part) => !part)) return null;
        const result = outputDocument.createDocumentFragment();
        const scripted = (name, content) => {
          const node = outputDocument.createElement(name);
          node.append(content);
          return node;
        };
        if (tag === "msup") result.append(parts[0], scripted("sup", parts[1]));
        else if (tag === "msub") result.append(parts[0], scripted("sub", parts[1]));
        else if (tag === "msubsup") result.append(parts[0], scripted("sub", parts[1]), scripted("sup", parts[2]));
        else if (tag === "mfrac") result.append("(", parts[0], ")/(", parts[1], ")");
        else if (tag === "msqrt") result.append("√(", ...parts, ")");
        else parts.forEach((part, index) => {
          if (index && tag === "mtable") result.append(outputDocument.createElement("br"));
          if (index && tag === "mtr") result.append(" ");
          result.append(part);
        });
        return result;
      };
      if (math.localName !== "math") return null;
      return render(math);
    } catch (_) {
      return null;
    }
  }
  function presentationMathText(element) {
    if (element.namespaceURI !== MATHML || ["annotation", "annotation-xml"].includes(element.localName)) return "";
    if (element.localName === "semantics") return presentationChildren(element).map(presentationMathText).join("");
    return Array.from(element.childNodes, (child) => child.nodeType === 3 ? child.textContent : child.nodeType === 1 ? presentationMathText(child) : "").join("");
  }
  function processMathElements(container, runtimeInputs = /* @__PURE__ */ new Map()) {
    const mathElements = container.querySelectorAll(".mwe-math-element, .mathjax, .MathJax, .MathJax_Display, .latex, .katex, mjx-container, math");
    for (const mathEl of Array.from(mathElements)) {
      if (!container.contains(mathEl)) continue;
      let latex = "";
      const frame = mathEl.matches(".MathJax") ? mathEl : mathEl.querySelector(".MathJax");
      const sourceId = frame?.id.replace(/-Frame$/, "");
      const script = (sourceId ? container.ownerDocument.getElementById(sourceId) : null) || frame?.nextElementSibling || mathEl.nextElementSibling;
      if (script?.tagName === "SCRIPT" && /^math\/tex(?:;|$)/i.test(script.getAttribute("type") || "")) {
        latex = script.textContent || "";
      }
      const img = mathEl.querySelector("img");
      if (!latex && img && img.alt) {
        latex = img.alt;
      }
      const mathTag = mathEl.querySelector("math") || (mathEl.tagName.toLowerCase() === "math" ? mathEl : null);
      if (!latex && mathTag) {
        latex = mathTag.getAttribute("alttext") || "";
      }
      if (!latex) {
        const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation) {
          latex = annotation.textContent || "";
        }
      }
      if (!latex) latex = runtimeInputs.get(mathEl) || "";
      let semanticMath = mathTag;
      if (!semanticMath && frame?.getAttribute("data-mathml")) {
        const Parser = container.ownerDocument.defaultView?.DOMParser;
        if (Parser) {
          const parsed = new Parser().parseFromString(frame.getAttribute("data-mathml"), "application/xml");
          if (!parsed.querySelector("parsererror")) semanticMath = parsed.documentElement;
        }
      }
      const rendered = semanticMath ? renderSimpleMathMl(semanticMath, container.ownerDocument, !latex) : null;
      if (rendered) {
        const wrapper = container.ownerDocument.createElement("span");
        wrapper.className = "math";
        wrapper.appendChild(rendered);
        mathEl.replaceWith(wrapper);
      } else if (latex) {
        const cleanedLatex = cleanLatexFormula(latex);
        const textNode = container.ownerDocument.createTextNode(` $${cleanedLatex}$ `);
        mathEl.replaceWith(textNode);
      } else {
        const presentation = semanticMath?.namespaceURI === MATHML ? presentationMathText(semanticMath) : mathEl.querySelector("mjx-math,.katex-html")?.textContent ?? mathEl.textContent;
        mathEl.replaceWith(container.ownerDocument.createTextNode(presentation || ""));
      }
    }
  }
  var clonedMathInputs = /* @__PURE__ */ new WeakMap();
  function getRenderedMathInputs(root) {
    const wrappers = Array.from(root.querySelectorAll("mjx-container"));
    const inputs = new Map(wrappers.flatMap((wrapper) => {
      const tex = clonedMathInputs.get(wrapper);
      return tex ? [[wrapper, tex]] : [];
    }));
    if (!wrappers.length || !root.isConnected) return inputs;
    const view = (
      /** @type {Window & {MathJax?: {startup?: {document?: any}}}} */
      root.ownerDocument.defaultView
    );
    const mathDocument = view?.MathJax?.startup?.document;
    if (typeof mathDocument?.getMathItemsWithin !== "function") return inputs;
    try {
      for (const item of mathDocument.getMathItemsWithin([root])) {
        if (item.inputJax?.name === "TeX" && typeof item.math === "string" && wrappers.includes(item.typesetRoot)) {
          inputs.set(item.typesetRoot, item.math);
        }
      }
    } catch {
    }
    return inputs;
  }
  function preserveClonedMathInputs(root, copies) {
    for (const [original, tex] of getRenderedMathInputs(root)) {
      const copy = copies.get(original);
      if (copy) clonedMathInputs.set(copy, tex);
    }
  }
  function preserveRangeMathInputs(root, range, fragment) {
    const rendered = Array.from(fragment.querySelectorAll("mjx-container"));
    if (!rendered.length) return;
    const originals = Array.from(root.querySelectorAll("mjx-container")).filter((node) => range.intersectsNode(node));
    if (originals.length !== rendered.length) return;
    const inputs = getRenderedMathInputs(root);
    rendered.forEach((copy, index) => {
      const tex = inputs.get(originals[index]);
      if (tex) clonedMathInputs.set(copy, tex);
    });
  }
  function encodeOriginalText(element, text) {
    const node = element.ownerDocument.createElement("span");
    node.textContent = text;
    return node.innerHTML;
  }
  function serializeReadingHtml(p, excludedSelectors = [], referenceRoots = null, preserveRoot = false) {
    const copies = /* @__PURE__ */ new Map();
    let clone = (
      /** @type {Element} */
      cloneWithoutRepeatedNoteTooltips(p, referenceRoots, excludedSelectors, copies)
    );
    for (const source of [p, ...Array.from(p.querySelectorAll("form"))]) {
      if (!isSubscriptionFormContent(source)) continue;
      const copy = copies.get(source);
      if (copy === clone) clone.replaceChildren();
      else copy?.remove();
    }
    for (const form of Array.from(clone.querySelectorAll("form"))) {
      if (isSubscriptionFormContent(form)) form.remove();
      else form.replaceWith(...form.childNodes);
    }
    for (const label of Array.from(p.querySelectorAll("label,span[id]"))) {
      if (isInteractiveControlLabel(label)) copies.get(label)?.remove();
    }
    if (preserveRoot && p.matches("a,b,i,em,strong,small,sup,sub,span,mark,s,u")) {
      const wrapper = p.ownerDocument.createElement("span");
      clone.removeAttribute("id");
      wrapper.appendChild(clone);
      clone = wrapper;
    }
    materializeAnnotationReferences(clone);
    const mathInputs = new Map(Array.from(getRenderedMathInputs(p), ([original, tex]) => [copies.get(original), tex]));
    processMathElements(clone, mathInputs);
    const allElements = clone.querySelectorAll("*");
    for (const el of Array.from(allElements)) {
      if (el.tagName === "SPAN") {
        const style = (
          /** @type {HTMLElement} */
          el.style
        );
        const bold = style?.fontWeight === "bold" || Number(style?.fontWeight) >= 600;
        const italic = style?.fontStyle === "italic";
        if (bold || italic) {
          const wrapper = clone.ownerDocument.createElement(bold ? "strong" : "em");
          wrapper.append(...el.childNodes);
          el.replaceWith(wrapper);
          if (bold && italic) {
            const emphasis = clone.ownerDocument.createElement("em");
            emphasis.append(...wrapper.childNodes);
            wrapper.append(emphasis);
          }
        }
      }
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      }
      if (isIcon(el)) {
        el.remove();
      }
      if (el.tagName.toLowerCase() === "style" || el.tagName.toLowerCase() === "script") {
        el.remove();
      }
      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (href && !href.startsWith("#")) {
          try {
            const absolute = new URL(href, p.ownerDocument.baseURI);
            if (["http:", "https:", "mailto:"].includes(absolute.protocol)) el.setAttribute("href", absolute.href);
            else el.removeAttribute("href");
          } catch (_) {
            el.removeAttribute("href");
          }
        }
      }
    }
    const emptyElements = clone.querySelectorAll("span:empty, div:empty");
    for (const empty of Array.from(emptyElements)) {
      empty.remove();
    }
    return clone.textContent?.trim() || clone.querySelector("math") ? (
      /** @type {HTMLElement} */
      clone.innerHTML.trim()
    ) : "";
  }

  // scripts/extraction/extractor/images.js
  function isPlaceholderUrl(url, image) {
    if (!url) return true;
    if (/^data:image\/(?:png|gif);base64,/i.test(url)) {
      try {
        const bytes = atob(url.slice(url.indexOf(",") + 1));
        if (bytes.startsWith("GIF8") && bytes.length >= 10) {
          const width = bytes.charCodeAt(6) | bytes.charCodeAt(7) << 8;
          const height = bytes.charCodeAt(8) | bytes.charCodeAt(9) << 8;
          return width > 0 && height > 0 && width <= 3 && height <= 3;
        }
        if (bytes.startsWith("PNG\r\n\n") && bytes.length >= 24) {
          const read32 = (offset) => bytes.charCodeAt(offset) * 16777216 + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3);
          const width = read32(16), height = read32(20);
          return width > 0 && height > 0 && width <= 3 && height <= 3;
        }
      } catch (_) {
      }
      return false;
    }
    try {
      const basename = decodeURIComponent(new URL(url, "https://example.invalid/").pathname.split("/").pop() || "");
      if (/^(?:placeholder|spacer|blank|transparent|1x1|pixel)\.(?:gif|png|svg|webp)$/i.test(basename)) return true;
      const label = (image?.getAttribute("aria-label") || image?.alt || "").trim().replace(/\s+/g, " ");
      return /^(?:image|photo|picture) (?:is )?(?:unavailable|not available|not found)$/i.test(label) && /(?:^|[-_.])(?:placeholder|fallback)(?:[-_.]|$)/i.test(basename);
    } catch (_) {
      return false;
    }
  }
  function isDecorativeImageUrl(url, patterns) {
    try {
      const basename = decodeURIComponent(new URL(url, "https://example.invalid/").pathname.split("/").pop() || "").toLowerCase();
      const roles = /* @__PURE__ */ new Set(["logo", "favicon", "icon", "avatar", "sprite", "spacer", "social-icon", "share-icon", "share-button"]);
      return (patterns || []).some((pattern) => roles.has(pattern.toLowerCase()) && new RegExp(`(?:^|[_.-])${pattern}(?:$|[_.-])`, "i").test(basename));
    } catch (_) {
      return false;
    }
  }
  function getBestSrcsetUrl(srcset, image) {
    if (!srcset) return null;
    const sources = srcset.split(",").map((s) => s.trim());
    let bestUrl = null;
    let bestSize = 0;
    for (const source of sources) {
      const parts = source.trim().split(/\s+/);
      if (parts.length < 1) continue;
      const url = parts[0];
      if (isPlaceholderUrl(url, image)) continue;
      if (parts.length > 1) {
        const descriptor = parts[1];
        if (descriptor.endsWith("x")) {
          const multiplier = parseFloat(descriptor);
          if (multiplier > bestSize) {
            bestSize = multiplier;
            bestUrl = url;
          }
        } else if (descriptor.endsWith("w")) {
          const width = parseInt(descriptor);
          if (width > bestSize) {
            bestSize = width;
            bestUrl = url;
          }
        }
      } else {
        if (!bestUrl) bestUrl = url;
      }
    }
    return bestUrl;
  }
  function extractBestImageUrl(imgElement) {
    if (!imgElement) return null;
    let src = null;
    for (const attr of ["data-full-src", "data-high-res", "data-original-src", "data-srcset", "data-src", "data-lazy-src", "data-original", "data-lazy"]) {
      const value = imgElement.getAttribute(attr);
      const candidate = attr === "data-srcset" ? getBestSrcsetUrl(value, imgElement) : value;
      if (candidate && !isPlaceholderUrl(candidate, imgElement)) return candidate;
    }
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc, imgElement)) {
      src = imgElement.currentSrc;
    }
    if (!src) {
      const imgSrc = imgElement.src || imgElement.getAttribute("src");
      if (imgSrc && !isPlaceholderUrl(imgSrc, imgElement)) {
        src = imgSrc;
      }
    }
    if (!src) {
      const srcset = imgElement.getAttribute("srcset");
      if (srcset) {
        src = getBestSrcsetUrl(srcset, imgElement);
      }
    }
    if (!src) {
      const picture = imgElement.closest("picture");
      if (picture) {
        for (const source of Array.from(picture.querySelectorAll("source[srcset]"))) {
          const srcset = source.getAttribute("srcset");
          if (srcset) {
            const candidate = getBestSrcsetUrl(srcset, imgElement);
            if (candidate) {
              src = candidate;
              break;
            }
          }
        }
      }
    }
    if (!src) {
      const dataAttrs = [
        "data-src",
        "data-lazy-src",
        "data-original",
        "data-lazy",
        "data-full-src",
        "data-high-res",
        "data-srcset",
        "data-original-src"
      ];
      for (const attr of dataAttrs) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes("data:") && !isPlaceholderUrl(val, imgElement)) {
          if (attr === "data-srcset") {
            src = getBestSrcsetUrl(val, imgElement);
          } else {
            src = val;
          }
          if (src) break;
        }
      }
    }
    if (!src) {
      const parentLink = imgElement.closest("a[href]");
      if (parentLink) {
        const href = parentLink.getAttribute("href");
        if (href && !isPlaceholderUrl(href, imgElement) && (href.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || href.includes("image"))) {
          src = href;
        }
      }
    }
    return src;
  }
  function getSelectedImageNaturalSize(img) {
    const selectedSource = extractBestImageUrl(img);
    const loadedSource = img.currentSrc || img.src || "";
    const matches = !selectedSource || normalizeImageUrl(toAbsoluteUrl(selectedSource, img.ownerDocument.baseURI)) === normalizeImageUrl(toAbsoluteUrl(loadedSource, img.ownerDocument.baseURI));
    return {
      width: matches ? img.naturalWidth || 0 : 0,
      height: matches ? img.naturalHeight || 0 : 0,
      matchesSource: matches
    };
  }
  function isCollapsedImageLayer(img) {
    if (!img.isConnected || !img.complete || !img.naturalWidth || !img.naturalHeight) return false;
    if (img.getAttribute("alt")?.trim() !== "" || img.title || img.hasAttribute("aria-label") || img.hasAttribute("aria-labelledby") || img.closest("a[href]") || !img.closest("figure")) return false;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return false;
    const win = img.ownerDocument.defaultView;
    const style = safeGetComputedStyle(win, img);
    const collapsed = rect.width <= 0 && style?.width === "0px" || rect.height <= 0 && style?.height === "0px";
    if (!collapsed || !["absolute", "fixed"].includes(style?.position) || !getSelectedImageNaturalSize(img).matchesSource) return false;
    return Array.from(img.parentElement?.children || []).some((sibling) => sibling !== img && sibling.tagName === "IMG" && safeGetComputedStyle(win, sibling)?.position === style.position);
  }
  function isTrackingPixel(win, img) {
    const selectedSource = extractBestImageUrl(img);
    const { width: naturalWidth, height: naturalHeight } = getSelectedImageNaturalSize(img);
    try {
      const style = safeGetComputedStyle(win, img);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
        if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
          return true;
        }
      }
    } catch (e) {
    }
    if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
      return true;
    }
    try {
      const url = new URL(selectedSource || img.src || "", img.ownerDocument.baseURI);
      return /(?:^|\.)doubleclick\.net$/i.test(url.hostname) || /(?:^|\.)googleadservices\.com$/i.test(url.hostname) || /(?:^|\.)facebook\.com$/i.test(url.hostname) && /^\/tr\/?$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }
  function isDecorativeImage(win, img, logoPatterns) {
    if (!img) return false;
    const src = (extractBestImageUrl(img) || img.src || "").toLowerCase();
    const alt = (img.alt || "").toLowerCase();
    const className = String(img.className || "").toLowerCase();
    const id = (img.id || "").toLowerCase();
    const naturalSize = getSelectedImageNaturalSize(img);
    const naturalWidth = naturalSize.width || (naturalSize.matchesSource ? img.width : Number(img.getAttribute("width"))) || 0;
    const naturalHeight = naturalSize.height || (naturalSize.matchesSource ? img.height : Number(img.getAttribute("height"))) || 0;
    if (img.getAttribute("role") === "separator") return true;
    if (naturalWidth > 0 && naturalHeight > 0 && (naturalWidth > 3 && naturalHeight <= 3 || naturalHeight > 3 && naturalWidth <= 3)) {
      return true;
    }
    if (className.includes("headshot") || id.includes("headshot") || className.includes("author-photo") || className.includes("author-image") || className.includes("byline-thumbnail") || className.includes("contributor-thumbnail")) {
      return true;
    }
    let checkParent = img.parentElement;
    for (let i = 0; i < 5 && checkParent; i++) {
      const parentClass = String(checkParent.className || "").toLowerCase();
      const parentId = (checkParent.id || "").toLowerCase();
      if (parentClass.includes("contributor") || parentClass.includes("byline") || parentClass.includes("author-info") || parentClass.includes("author-bio")) {
        if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 150 && naturalHeight <= 150) {
          return true;
        }
      }
      checkParent = checkParent.parentElement;
    }
    if (alt && (alt.includes("'s avatar") || alt.includes(" avatar") || alt === "avatar")) {
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
        return true;
      }
    }
    if (isDecorativeImageUrl(src, logoPatterns)) {
      return true;
    }
    if (/^(?:(?:site|company|brand|social)\s+)?(?:logo|icon)$/i.test(alt)) {
      return true;
    }
    if (/(?:^|[\s_-])(?:logo|icon|avatar|social-icon|share-icon|share-button)(?:$|[\s_-])/.test(className)) {
      return true;
    }
    if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
      if (src.includes("icon") || src.includes("logo") || src.includes("social")) {
        return true;
      }
    }
    return false;
  }
  function getImageCaption(img, captionOwners = null, excludedElements = [], selectedIllustration = null) {
    const captionText = (element) => serializeReadingHtml(element, excludedElements);
    const excluded2 = (element) => excludedElements.some((rule) => {
      try {
        return typeof rule === "string" ? !!element.closest(rule) : rule.contains(element);
      } catch (_) {
        return true;
      }
    });
    const readable = (element) => {
      if (excluded2(element)) return false;
      for (let node = element; node; node = node.parentElement) {
        if (node.matches("[hidden]")) return false;
        const style2 = safeGetComputedStyle(img.ownerDocument.defaultView, node);
        if (style2?.display === "none") return false;
      }
      const style = safeGetComputedStyle(img.ownerDocument.defaultView, element);
      if (style?.visibility === "hidden" || style?.visibility === "collapse") return false;
      return true;
    };
    const figure = img.closest("figure");
    if (figure) {
      for (const figcaption of Array.from(figure.querySelectorAll("figcaption"))) {
        if (figcaption.closest("figure") !== figure || !readable(figcaption)) continue;
        const text = captionText(figcaption);
        if (!text) continue;
        captionOwners?.add(figcaption);
        return text;
      }
    }
    for (const id of (img.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)) {
      const description = img.ownerDocument.getElementById(id);
      if (!description || description.contains(img) || !readable(description)) continue;
      const text = captionText(description);
      if (text) {
        captionOwners?.add(description);
        return text;
      }
    }
    const nextSibling = img.nextElementSibling;
    if (nextSibling && readable(nextSibling) && String(nextSibling.className || "").toLowerCase().includes("caption")) {
      const text = captionText(nextSibling);
      if (text) {
        captionOwners?.add(nextSibling);
        return text;
      }
    }
    const parent = img.parentElement;
    if (parent && parent.querySelectorAll("img").length === 1) {
      const captionEl = parent.querySelector(".caption, .image-caption, .photo-caption");
      if (captionEl && readable(captionEl)) {
        const text = captionText(captionEl);
        if (text && text !== img.alt && captionEl.closest("figure") === figure) {
          captionOwners?.add(captionEl);
          return text;
        }
      }
    }
    if (!figure && selectedIllustration && selectedIllustration !== img) {
      const captions = Array.from(selectedIllustration.children).filter((node) => node.matches("figcaption,p,h2,h3,h4,h5,h6") && compareDomOrder(img, node) < 0 && readable(node));
      const parts = captions.map((node) => {
        const html = captionText(node);
        if (html) captionOwners?.add(node);
        return html;
      }).filter(Boolean);
      if (parts.length) return parts.join("<br>");
    }
    return "";
  }
  function extractMetadataImage(doc, baseUrl, logoPatterns) {
    const featuredImageSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="article:image"]',
      'meta[name="image"]'
    ];
    for (const selector of featuredImageSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element) {
          const content = element.getAttribute("content");
          if (content) {
            const absoluteUrl = toAbsoluteUrl(content, baseUrl);
            if (!isDecorativeImageUrl(absoluteUrl, logoPatterns)) {
              return { src: absoluteUrl, alt: "", caption: "" };
            }
          }
        }
      } catch (e) {
      }
    }
    return null;
  }
  function discoverReadingMedia(bodyRoots, selectedHeroes = []) {
    const mediaSelector = "figure,img,picture,svg,canvas,video,audio,iframe";
    const mediaRoots = /* @__PURE__ */ new Set();
    const featuredRoots = /* @__PURE__ */ new Set();
    const selectedIllustrations = /* @__PURE__ */ new Map();
    const ownerOf = (element) => element.closest("figure") || element.closest("picture") || element;
    const insideBody = (element) => bodyRoots.some((root) => root.contains(element));
    const before = (left, right) => left !== right && !left.contains(right) && compareDomOrder(left, right) < 0;
    for (const root of bodyRoots) {
      for (const element of [...root.matches(mediaSelector) ? [root] : [], ...Array.from(root.querySelectorAll(mediaSelector))]) {
        const media = ownerOf(element);
        if (root.contains(media)) mediaRoots.add(media);
      }
    }
    for (const root of bodyRoots) {
      const body = root.closest('[itemprop~="articleBody"]');
      const article = body?.parentElement?.closest("[itemscope][itemtype]");
      if (!(article?.getAttribute("itemtype") || "").split(/\s+/).some((type) => /^https?:\/\/schema\.org\/\w*(?:Article|BlogPosting)$/.test(type))) continue;
      for (const declaration of Array.from(article.querySelectorAll('[itemprop~="image"]'))) {
        if (declaration.parentElement?.closest("[itemscope]") !== article) continue;
        for (const source of declaration.matches("img") ? [declaration] : Array.from(declaration.querySelectorAll("img"))) {
          const media = ownerOf(source);
          if (insideBody(media) || !before(media, body)) continue;
          mediaRoots.add(media);
          featuredRoots.add(media);
        }
      }
    }
    const owners = /* @__PURE__ */ new Map();
    for (const root of bodyRoots) {
      const owner = root.closest('article,[itemprop~="articleBody"]');
      if (!owner) continue;
      if (!owners.has(owner)) owners.set(owner, []);
      owners.get(owner).push(root);
    }
    const headerOf = (element, owner) => {
      for (let node = element.parentElement; node && node !== owner; node = node.parentElement) {
        if (node.tagName === "HEADER" || /(?:^|[\s_-])header(?:$|[\s_-])/i.test(node.getAttribute("class") || "")) return node;
      }
      return null;
    };
    for (const [owner, roots] of owners) {
      const ordered = [...roots].sort(compareDomOrder);
      const narrativeStart = roots.flatMap((root) => [...root.matches("p,blockquote,pre,ul,ol,table") ? [root] : [], ...Array.from(root.querySelectorAll("p,blockquote,pre,ul,ol,table"))]).filter((element) => !element.closest("figure,figcaption") && !headerOf(element, owner)).sort(compareDomOrder)[0];
      for (const element of Array.from(owner.querySelectorAll(mediaSelector))) {
        const media = ownerOf(element);
        if (media.closest('article,[itemprop~="articleBody"]') !== owner) continue;
        const outside = !insideBody(media) && !bodyRoots.some((root) => media.contains(root));
        const leading = outside && before(media, ordered[0]);
        const interleaved = outside && ordered.some((root) => before(root, media)) && ordered.some((root) => before(media, root));
        const header = headerOf(media, owner);
        if (leading || interleaved || header && insideBody(media)) mediaRoots.add(media);
        if (leading || header && narrativeStart && before(media, narrativeStart)) featuredRoots.add(media);
      }
    }
    for (const selected of selectedHeroes) {
      if (!selected.matches(mediaSelector) && bodyRoots.some((root) => root !== selected && selected.contains(root))) continue;
      const elements = [...selected.matches(mediaSelector) ? [selected] : [], ...Array.from(selected.querySelectorAll(mediaSelector))];
      const images = elements.filter((element) => element.tagName === "IMG");
      const complementary = selected.closest('aside,[role~="complementary"]');
      if (complementary && selected !== complementary && (selected.matches("img,figure,picture") || images.length === 1)) {
        for (const image of images) {
          selectedIllustrations.set(image, selected);
          const owner = ownerOf(image);
          if (owner !== image && complementary.contains(owner)) selectedIllustrations.set(owner, selected);
        }
      }
      for (const element of elements) {
        const media = ownerOf(element);
        mediaRoots.add(media);
        if (!insideBody(media) && !bodyRoots.some((root) => media.contains(root))) featuredRoots.add(media);
      }
    }
    return { roots: [...mediaRoots], featuredRoots: [...featuredRoots], selectedIllustrations };
  }
  function hasSourceReadingMedia(roots, logoPatterns = []) {
    const selector = "img,svg,canvas,video,audio,iframe";
    return roots.some((root) => [...root.matches(selector) ? [root] : [], ...Array.from(root.querySelectorAll(selector))].some((element) => element.tagName !== "IMG" || !isTrackingPixel(
      element.ownerDocument.defaultView,
      /** @type {HTMLImageElement} */
      element
    ) && !isDecorativeImage(
      element.ownerDocument.defaultView,
      /** @type {HTMLImageElement} */
      element,
      logoPatterns
    )));
  }
  function getEmbeddedMediaItems(element) {
    if (!element || !["IFRAME", "VIDEO", "AUDIO"].includes(element.tagName)) return [];
    const base = element.ownerDocument.baseURI;
    const safeUrl = (value) => {
      if (!value || !value.trim()) return null;
      try {
        const url = new URL(value, base);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
      } catch (_) {
        return null;
      }
    };
    const source = safeUrl(element.getAttribute("src") || element.querySelector("source[src]")?.getAttribute("src"));
    if (!source) return [];
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
    const description = (element.getAttribute("title") || element.getAttribute("aria-label") || "").trim();
    const label = description || source.hostname;
    let preview = element.tagName === "VIDEO" ? safeUrl(element.getAttribute("poster"))?.href : null;
    if (element.tagName === "IFRAME" && source.hostname === "datawrapper.dwcdn.net") {
      const chart = source.pathname.match(/^\/([A-Za-z0-9]{5})\/(?:\d+\/?)?$/);
      if (chart) preview = `https://datawrapper.dwcdn.net/${chart[1]}/full.png`;
    }
    const items = [];
    if (preview) items.push({ type: "image", src: preview, alt: description, caption: "" });
    items.push({
      type: "paragraph",
      text: label,
      html: `<a href="${escape(source.href)}">${escape(label)}</a>`
    });
    return items;
  }

  // scripts/extraction/constants/content-thresholds.js
  var CONTENT_THRESHOLDS = {
    // Minimum length for valid content
    MIN_CONTENT_LENGTH: 100,
    // Length for "substantial" content (main article)
    SUBSTANTIAL_CONTENT_LENGTH: 500,
    // Minimum paragraph length
    MIN_PARAGRAPH_LENGTH: 10,
    // Minimum heading length
    MIN_HEADING_LENGTH: 3,
    // Standfirst/subtitle length range
    MIN_STANDFIRST_LENGTH: 50,
    MAX_STANDFIRST_LENGTH: 500,
    // Short paragraph threshold (for navigation detection)
    SHORT_PARAGRAPH_THRESHOLD: 200,
    // Very short paragraph (likely metadata)
    VERY_SHORT_PARAGRAPH: 100,
    // Author metadata max length
    MAX_AUTHOR_METADATA_LENGTH: 100,
    // Word count metadata max length
    MAX_WORD_COUNT_METADATA_LENGTH: 150
  };
  var IMAGE_THRESHOLDS = {
    // Minimum dimensions for featured image
    FEATURED_IMAGE_MIN_WIDTH: 400,
    FEATURED_IMAGE_MIN_HEIGHT: 300,
    // Author photo dimensions (typically small)
    AUTHOR_PHOTO_MAX_SIZE: 250,
    AUTHOR_PHOTO_SMALL_SIZE: 150,
    // Tracking pixel max size
    TRACKING_PIXEL_MAX_SIZE: 3,
    // Small icon max size
    SMALL_ICON_MAX_SIZE: 50,
    // Very small image (likely decorative)
    VERY_SMALL_IMAGE_SIZE: 100
  };
  var SCORING_THRESHOLDS = {
    // Minimum score for content candidate
    MIN_CONTENT_SCORE: 10,
    // Good enough score (early exit)
    GOOD_ENOUGH_SCORE: 100,
    // Link density thresholds
    HIGH_LINK_DENSITY: 1,
    MEDIUM_LINK_DENSITY: 0.7,
    LOW_LINK_DENSITY: 0.5,
    // Comma count bonuses
    HIGH_COMMA_COUNT: 10,
    MEDIUM_COMMA_COUNT: 5,
    // Sentence count bonus threshold
    MIN_SENTENCE_COUNT: 5
  };
  var CONTENT_SELECTORS = [
    '[role="main"]',
    ".article-content",
    ".post-content",
    ".entry-content",
    ".content",
    ".post-body",
    ".article-body",
    ".entry-body",
    "#content",
    "#main-content",
    "#article-content",
    ".wp-block-post-content",
    ".entry",
    ".post",
    // Additional common patterns
    ".prose",
    ".article-text",
    ".story-body",
    ".article-body-content",
    ".wysiwyg",
    ".wysiwyg--all-content",
    // Al Jazeera uses this
    '[class*="article"]',
    '[class*="content"]',
    '[id*="article"]',
    '[id*="content"]'
  ];
  var STANDFIRST_SELECTORS = [
    ".standfirst",
    ".subtitle",
    ".deck",
    '[class*="excerpt"]',
    ".lede",
    ".intro",
    ".article__subhead",
    '[class*="standfirst"]',
    '[class*="subtitle"]',
    '[class*="deck"]',
    '[class*="intro"]',
    '[class*="summary"]',
    '[class*="subhead"]'
  ];
  var AUTHOR_SELECTORS = [
    'meta[name="author"]',
    'meta[name="citation_author"]',
    // Noema uses this
    'meta[property="article:author"]',
    '[rel="author"]',
    ".author",
    ".byline",
    ".meta-author",
    ".meta-text.meta-author",
    '[itemprop="author"]',
    'a[rel="author"]',
    'a[href*="/author/"]',
    // Link to author page
    'a[href*="/profile/"]'
    // Link to profile page (The Guardian uses this)
  ];
  var DATE_SELECTORS = [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="date"]',
    'meta[name="citation_date"]',
    // Noema uses this
    "time[datetime]",
    "time[pubdate]",
    '[itemprop="datePublished"]',
    ".published",
    ".date",
    ".meta-date",
    ".meta-text.meta-date",
    "span.meta-date"
  ];
  var FEATURED_IMAGE_SELECTORS = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="article:image"]',
    'meta[name="image"]',
    '[itemprop="image"]'
  ];

  // scripts/extraction/extractor/standfirst.js
  function extractStandfirst(mainContent) {
    if (!mainContent) {
      return { text: null, element: null };
    }
    const isNewsletterCandidate = (element) => {
      for (let node = element; node; node = node.parentElement) {
        if (/(?:^|[\s_-])newsletter(?:$|[\s_-])/i.test(`${node.id} ${node.getAttribute("class") || ""}`) && !isEditorialLayoutLabel(node, element, "newsletter")) return true;
        if (node === mainContent) break;
      }
      return false;
    };
    const isInlineCandidate = (element) => {
      if (element.closest(INTERFACE_REGIONS)) return false;
      if (!element.matches("p,div,span") || element.querySelector("h1,h2,h3,h4,h5,h6,p,div,ul,ol,menu,dl,dt,dd,table,pre,blockquote,figure,figcaption,img,picture,svg,canvas,iframe,video,audio,object,embed,details,summary,article,aside,section,header,footer,nav,main,form,hr,address,button,input,select,textarea")) return false;
      for (let node = element; node; node = node.parentElement) {
        if (node.matches('[hidden],[aria-hidden="true"],[inert]')) return false;
        if (node.tagName === "DETAILS" && !node.hasAttribute("open")) return false;
        const style = safeGetComputedStyle(element.ownerDocument.defaultView, node);
        if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") return false;
      }
      return true;
    };
    for (const selector of STANDFIRST_SELECTORS) {
      try {
        const candidates = [...mainContent.matches(selector) ? [mainContent] : [], ...Array.from(mainContent.querySelectorAll(selector))];
        for (const element of candidates) {
          if (!isInlineCandidate(element) || isNewsletterCandidate(element) || selector.includes("excerpt") && isOutsideArticleBody(element, mainContent)) continue;
          const text = (cloneReadingContent(element).textContent || "").trim();
          if (text.length >= 50 && text.length <= 500) {
            return { text, element };
          }
        }
      } catch (e) {
      }
    }
    return { text: null, element: null };
  }

  // scripts/extraction/patterns/exclusion-patterns.js
  var NAVIGATION_PATTERNS = {
    // Patterns that match if text STARTS with them
    startsWith: [
      // English
      /^next:/i,
      /^read\s+more(?:\s*[.!?:;…»›>]+)?\s*$/i,
      /^keep reading/i,
      /^subscribe/i,
      /^sign (in|up)/i,
      /^already have an account/i,
      /^try \d+ days/i,
      /^start (free )?trial/i,
      /^give a gift/i,
      /^manage subscription/i,
      /^essential journalism/i,
      /^support independent journalism/i,
      /^you might also like/i,
      /^you may also like/i,
      /^also in /i,
      /^more in /i,
      /^previous post/i,
      /^next post/i,
      /^related posts?/i,
      /^recommended posts?/i,
      /^subscribe (now|today|for)/i,
      /^support (independent )?journalism/i,
      /^donate (to|now)/i,
      /^give a year of/i,
      /^plus a free/i,
      /^comment on this article/i,
      /^view \/ add comments/i,
      /^published in the print edition/i,
      /^published in the/i,
      /^fuel your wonder/i,
      /^feed your curiosity/i,
      /^expand your mind/i,
      /^access the entire/i,
      /^ad-free/i,
      /^become a member/i,
      /^nautilus members enjoy/i,
      /^log in or join/i,
      // Russian
      /^чтобы прочитать целиком/i,
      /^купите подписку/i,
      /^платный журнал/i,
      /^я уже подписчик/i,
      /^подписка предоставлена/i,
      /^оформить подписку/i,
      /^чтобы читать далее/i,
      /^подпишитесь чтобы/i,
      /^чтобы продолжить/i,
      /^новое и лучшее/i,
      /^первая полоса/i,
      /^рекомендуем/i,
      /^читайте также/i,
      /^похожие статьи/i,
      /^связанные статьи/i,
      /^другие статьи/i,
      /^ещё по теме/i,
      /^по теме/i,
      // Ukrainian
      /^щоб прочитати цілком/i,
      /^купити підписку/i,
      /^платний журнал/i,
      /^я вже передплатник/i,
      /^підписка надана/i,
      /^оформити підписку/i,
      /^щоб читати далі/i,
      /^підпишіться щоб/i,
      /^щоб продовжити/i,
      /^нове і краще/i,
      /^перша смуга/i,
      /^рекомендуємо/i,
      /^читайте також/i,
      /^схожі статті/i,
      /^пов'язані статті/i,
      /^інші статті/i,
      /^ще за темою/i,
      /^за темою/i,
      // German
      /^um weiterzulesen/i,
      /^abonnement kaufen/i,
      /^bezahltes magazin/i,
      /^ich bin bereits abonnent/i,
      /^abonnement bereitgestellt/i,
      /^abonnement abschließen/i,
      /^um weiter zu lesen/i,
      /^abonnieren um/i,
      /^um fortzufahren/i,
      /^neu und besser/i,
      /^erste seite/i,
      /^empfehlen/i,
      /^lesen sie auch/i,
      /^ähnliche artikel/i,
      /^verwandte artikel/i,
      /^andere artikel/i,
      /^mehr zum thema/i,
      /^zum thema/i,
      // French
      /^pour lire en entier/i,
      /^acheter un abonnement/i,
      /^magazine payant/i,
      /^je suis déjà abonné/i,
      /^abonnement fourni/i,
      /^s'abonner/i,
      /^pour continuer à lire/i,
      /^abonnez-vous pour/i,
      /^pour continuer/i,
      /^nouveau et mieux/i,
      /^première page/i,
      /^recommandons/i,
      /^lisez aussi/i,
      /^articles similaires/i,
      /^articles connexes/i,
      /^autres articles/i,
      /^plus sur le sujet/i,
      /^sur le sujet/i,
      // Spanish
      /^para leer completo/i,
      /^comprar suscripción/i,
      /^revista de pago/i,
      /^ya soy suscriptor/i,
      /^suscripción proporcionada/i,
      /^suscribirse/i,
      /^para seguir leyendo/i,
      /^suscríbete para/i,
      /^para continuar/i,
      /^nuevo y mejor/i,
      /^primera página/i,
      /^recomendamos/i,
      /^lee también/i,
      /^artículos similares/i,
      /^artículos relacionados/i,
      /^otros artículos/i,
      /^más sobre el tema/i,
      /^sobre el tema/i,
      // Italian
      /^per leggere completo/i,
      /^acquista abbonamento/i,
      /^rivista a pagamento/i,
      /^sono già abbonato/i,
      /^abbonamento fornito/i,
      /^abbonarsi/i,
      /^per continuare a leggere/i,
      /^abbonati per/i,
      /^per continuare/i,
      /^nuovo e migliore/i,
      /^prima pagina/i,
      /^consigliamo/i,
      /^leggi anche/i,
      /^articoli simili/i,
      /^articoli correlati/i,
      /^altri articoli/i,
      /^altro sull'argomento/i,
      /^sull'argomento/i,
      // Portuguese
      /^para ler completo/i,
      /^comprar assinatura/i,
      /^revista paga/i,
      /^já sou assinante/i,
      /^assinatura fornecida/i,
      /^assinar/i,
      /^para continuar lendo/i,
      /^assine para/i,
      /^para continuar/i,
      /^novo e melhor/i,
      /^primeira página/i,
      /^recomendamos/i,
      /^leia também/i,
      /^artigos similares/i,
      /^artigos relacionados/i,
      /^outros artigos/i,
      /^mais sobre o tema/i,
      /^sobre o tema/i,
      // Chinese
      /^阅读全文/i,
      /^购买订阅/i,
      /^付费杂志/i,
      /^我已经是订阅者/i,
      /^已提供订阅/i,
      /^订阅/i,
      /^继续阅读/i,
      /^订阅以/i,
      /^继续/i,
      /^最新和最佳/i,
      /^头版/i,
      /^推荐/i,
      /^也阅读/i,
      /^相似文章/i,
      /^相关文章/i,
      /^其他文章/i,
      /^更多主题/i,
      /^主题/i,
      // Japanese
      /^全文を読む/i,
      /^購読を購入/i,
      /^有料雑誌/i,
      /^既に購読者です/i,
      /^購読が提供されました/i,
      /^購読する/i,
      /^続きを読む/i,
      /^購読して/i,
      /^続ける/i,
      /^新しくて最高/i,
      /^第一面/i,
      /^おすすめ/i,
      /^こちらも読む/i,
      /^類似記事/i,
      /^関連記事/i,
      /^その他の記事/i,
      /^トピックの詳細/i,
      /^トピック/i,
      // Korean
      /^전체 읽기/i,
      /^구독 구매/i,
      /^유료 잡지/i,
      /^이미 구독자입니다/i,
      /^구독 제공됨/i,
      /^구독하기/i,
      /^계속 읽기/i,
      /^구독하여/i,
      /^계속/i,
      /^새로운 것과 최고/i,
      /^첫 페이지/i,
      /^추천/i,
      /^또한 읽기/i,
      /^유사한 기사/i,
      /^관련 기사/i,
      /^다른 기사/i,
      /^주제에 대해 더/i,
      /^주제/i
    ],
    // Patterns that match if text CONTAINS them
    contains: [
      // English
      /previous\s+post/i,
      /next\s+post/i,
      /related\s+posts?/i,
      /recommended\s+posts?/i,
      /^read\s+more(?:\s*[.!?:;…»›>]+)?\s*$/i,
      /keep\s+reading/i,
      /you\s+might\s+also\s+like/i,
      /you\s+may\s+also\s+like/i,
      /also\s+in\s+/i,
      /^more\s+in\s+/i,
      /next\s+article/i,
      /previous\s+article/i,
      /next:/i,
      /subscribe\s+(now|today|for)/i,
      /sign\s+up/i,
      /start\s+(free\s+)?trial/i,
      /support\s+(independent\s+)?journalism/i,
      /donate\s+(to|now)/i,
      /essential\s+journalism/i,
      /give\s+a\s+gift/i,
      /comment\s+on\s+this\s+article/i,
      /view\s+\/\s+add\s+comments/i,
      /published\s+in\s+the\s+print\s+edition/i,
      // Paywall/subscription messages
      /get\s+access\s+to\s+print\s+and\s+digital/i,
      /subscribe\s+for\s+full\s+access/i,
      /free\s+articles?\s+this\s+month/i,
      /subscribe\s+for\s+less\s+than/i,
      /subscribe\s+or\s+log\s+in\s+to\s+access/i,
      /connect\s+to\s+your\s+subscription/i,
      /you've\s+read\s+(one|your)/i,
      /you've\s+reached\s+your\s+free/i,
      /subscribe\s+or\s+log\s+in\s+to\s+access\s+this\s+pdf/i,
      /download\s+pdf/i,
      // Russian
      /чтобы\s+прочитать\s+целиком/i,
      /купите\s+подписку/i,
      /платный\s+журнал/i,
      /я\s+уже\s+подписчик/i,
      /подписка\s+предоставлена/i,
      /оформить\s+подписку/i,
      /чтобы\s+читать\s+далее/i,
      /подпишитесь\s+чтобы/i,
      /чтобы\s+продолжить/i,
      /новое\s+и\s+лучшее/i,
      /первая\s+полоса/i,
      /рекомендуем/i,
      /читайте\s+также/i,
      /похожие\s+статьи/i,
      /связанные\s+статьи/i,
      /другие\s+статьи/i,
      /ещё\s+по\s+теме/i,
      /по\s+теме/i,
      // Ukrainian
      /щоб\s+прочитати\s+цілком/i,
      /купити\s+підписку/i,
      /платний\s+журнал/i,
      /я\s+вже\s+передплатник/i,
      /підписка\s+надана/i,
      /оформити\s+підписку/i,
      /щоб\s+читати\s+далі/i,
      /підпишіться\s+щоб/i,
      /щоб\s+продовжить/i,
      /нове\s+і\s+краще/i,
      /перша\s+смуга/i,
      /рекомендуємо/i,
      /читайте\s+також/i,
      /схожі\s+статті/i,
      /пов'язані\s+статті/i,
      /інші\s+статті/i,
      /ще\s+за\s+темою/i,
      /за\s+темою/i,
      // German
      /um\s+weiterzulesen/i,
      /abonnement\s+kaufen/i,
      /bezahltes\s+magazin/i,
      /ich\s+bin\s+bereits\s+abonnent/i,
      /abonnement\s+bereitgestellt/i,
      /abonnement\s+abschließen/i,
      /um\s+weiter\s+zu\s+lesen/i,
      /abonnieren\s+um/i,
      /um\s+fortzufahren/i,
      /neu\s+und\s+besser/i,
      /erste\s+seite/i,
      /empfehlen/i,
      /lesen\s+sie\s+auch/i,
      /ähnliche\s+artikel/i,
      /verwandte\s+artikel/i,
      /andere\s+artikel/i,
      /mehr\s+zum\s+thema/i,
      /zum\s+thema/i,
      // French
      /pour\s+lire\s+en\s+entier/i,
      /acheter\s+un\s+abonnement/i,
      /magazine\s+payant/i,
      /je\s+suis\s+déjà\s+abonné/i,
      /abonnement\s+fourni/i,
      /s'abonner/i,
      /pour\s+continuer\s+à\s+lire/i,
      /abonnez-vous\s+pour/i,
      /pour\s+continuer/i,
      /nouveau\s+et\s+mieux/i,
      /première\s+page/i,
      /recommandons/i,
      /lisez\s+aussi/i,
      /articles\s+similaires/i,
      /articles\s+connexes/i,
      /autres\s+articles/i,
      /plus\s+sur\s+le\s+sujet/i,
      /sur\s+le\s+sujet/i,
      // Spanish
      /para\s+leer\s+completo/i,
      /comprar\s+suscripción/i,
      /revista\s+de\s+pago/i,
      /ya\s+soy\s+suscriptor/i,
      /suscripción\s+proporcionada/i,
      /suscribirse/i,
      /para\s+seguir\s+leyendo/i,
      /suscríbete\s+para/i,
      /para\s+continuar/i,
      /nuevo\s+y\s+mejor/i,
      /primera\s+página/i,
      /recomendamos/i,
      /lee\s+también/i,
      /artículos\s+similares/i,
      /artículos\s+relacionados/i,
      /otros\s+artículos/i,
      /más\s+sobre\s+el\s+tema/i,
      /sobre\s+el\s+tema/i,
      // Italian
      /per\s+leggere\s+completo/i,
      /acquista\s+abbonamento/i,
      /rivista\s+a\s+pagamento/i,
      /sono\s+già\s+abbonato/i,
      /abbonamento\s+fornito/i,
      /abbonarsi/i,
      /per\s+continuare\s+a\s+leggere/i,
      /abbonati\s+per/i,
      /per\s+continuare/i,
      /nuovo\s+e\s+migliore/i,
      /prima\s+pagina/i,
      /consigliamo/i,
      /leggi\s+anche/i,
      /articoli\s+simili/i,
      /articoli\s+correlati/i,
      /altri\s+articoli/i,
      /altro\s+sull'argomento/i,
      /sull'argomento/i,
      // Portuguese
      /para\s+ler\s+completo/i,
      /comprar\s+assinatura/i,
      /revista\s+paga/i,
      /já\s+sou\s+assinante/i,
      /assinatura\s+fornecida/i,
      /assinar/i,
      /para\s+continuar\s+lendo/i,
      /assine\s+para/i,
      /para\s+continuar/i,
      /novo\s+e\s+melhor/i,
      /primeira\s+página/i,
      /recomendamos/i,
      /leia\s+também/i,
      /artigos\s+similares/i,
      /artigos\s+relacionados/i,
      /outros\s+artigos/i,
      /mais\s+sobre\s+o\s+tema/i,
      /sobre\s+o\s+tema/i,
      // Chinese
      /阅读全文/i,
      /购买订阅/i,
      /付费杂志/i,
      /我已经是订阅者/i,
      /已提供订阅/i,
      /订阅/i,
      /继续阅读/i,
      /订阅以/i,
      /继续/i,
      /最新和最佳/i,
      /头版/i,
      /推荐/i,
      /也阅读/i,
      /相似文章/i,
      /相关文章/i,
      /其他文章/i,
      /更多主题/i,
      /主题/i,
      // Japanese
      /全文を読む/i,
      /購読を購入/i,
      /有料雑誌/i,
      /既に購読者です/i,
      /購読が提供されました/i,
      /購読する/i,
      /続きを読む/i,
      /購読して/i,
      /続ける/i,
      /新しくて最高/i,
      /第一面/i,
      /おすすめ/i,
      /こちらも読む/i,
      /類似記事/i,
      /関連記事/i,
      /その他の記事/i,
      /トピックの詳細/i,
      /トピック/i,
      // Korean
      /전체\s+읽기/i,
      /구독\s+구매/i,
      /유료\s+잡지/i,
      /이미\s+구독자입니다/i,
      /구독\s+제공됨/i,
      /구독하기/i,
      /계속\s+읽기/i,
      /구독하여/i,
      /계속/i,
      /새로운\s+것과\s+최고/i,
      /첫\s+페이지/i,
      /추천/i,
      /또한\s+읽기/i,
      /유사한\s+기사/i,
      /관련\s+기사/i,
      /다른\s+기사/i,
      /주제에\s+대해\s+더/i,
      /주제/i
    ]
  };
  var PAYWALL_PATTERNS = {
    english: [
      "keep reading",
      "subscribe",
      "sign up",
      "try 30 days",
      "already have an account",
      "start free trial",
      "get access to print and digital",
      "subscribe for full access",
      "free articles this month",
      "subscribe for less than",
      "subscribe or log in to access",
      "connect to your subscription",
      "you've read one",
      "you've read your",
      "you've reached your free"
    ],
    russian: [
      "чтобы прочитать целиком",
      "купите подписку",
      "платный журнал",
      "я уже подписчик",
      "подписка предоставлена",
      "оформить подписку",
      "чтобы читать далее",
      "подпишитесь чтобы",
      "чтобы продолжить"
    ],
    ukrainian: [
      "щоб прочитати цілком",
      "купити підписку",
      "платний журнал",
      "я вже передплатник",
      "підписка надана",
      "оформити підписку",
      "щоб читати далі",
      "підпишіться щоб",
      "щоб продовжити"
    ],
    german: [
      "um weiterzulesen",
      "abonnement kaufen",
      "bezahltes magazin",
      "ich bin bereits abonnent",
      "abonnement bereitgestellt",
      "abonnement abschließen",
      "um weiter zu lesen",
      "abonnieren um",
      "um fortzufahren"
    ],
    french: [
      "pour lire en entier",
      "acheter un abonnement",
      "magazine payant",
      "je suis déjà abonné",
      "abonnement fourni",
      "s'abonner",
      "pour continuer à lire",
      "abonnez-vous pour",
      "pour continuer"
    ],
    spanish: [
      "para leer completo",
      "comprar suscripción",
      "revista de pago",
      "ya soy suscriptor",
      "suscripción proporcionada",
      "suscribirse",
      "para seguir leyendo",
      "suscríbete para",
      "para continuar"
    ],
    italian: [
      "per leggere completo",
      "acquista abbonamento",
      "rivista a pagamento",
      "sono già abbonato",
      "abbonamento fornito",
      "abbonarsi",
      "per continuare a leggere",
      "abbonati per",
      "per continuare"
    ],
    portuguese: [
      "para ler completo",
      "comprar assinatura",
      "revista paga",
      "já sou assinante",
      "assinatura fornecida",
      "assinar",
      "para continuar lendo",
      "assine para",
      "para continuar"
    ],
    chinese: [
      "阅读全文",
      "购买订阅",
      "付费杂志",
      "我已经是订阅者",
      "已提供订阅",
      "订阅",
      "继续阅读",
      "订阅以",
      "继续"
    ],
    japanese: [
      "全文を読む",
      "購読を購入",
      "有料雑誌",
      "既に購読者です",
      "購読が提供されました",
      "購読する",
      "続きを読む",
      "購読して",
      "続ける"
    ],
    korean: [
      "전체 읽기",
      "구독 구매",
      "유료 잡지",
      "이미 구독자입니다",
      "구독 제공됨",
      "구독하기",
      "계속 읽기",
      "구독하여",
      "계속"
    ]
  };
  var RELATED_ARTICLES_PATTERNS = {
    english: [
      "new and best",
      "first page",
      "recommend",
      "read also",
      "similar articles",
      "related articles",
      "other articles",
      "more on topic",
      "on topic"
    ],
    russian: [
      "новое и лучшее",
      "первая полоса",
      "рекомендуем",
      "читайте также",
      "похожие статьи",
      "связанные статьи",
      "другие статьи",
      "ещё по теме",
      "по теме"
    ],
    ukrainian: [
      "нове і краще",
      "перша смуга",
      "рекомендуємо",
      "читайте також",
      "схожі статті",
      "пов'язані статті",
      "інші статті",
      "ще за темою",
      "за темою"
    ],
    german: [
      "neu und besser",
      "erste seite",
      "empfehlen",
      "lesen sie auch",
      "ähnliche artikel",
      "verwandte artikel",
      "andere artikel",
      "mehr zum thema",
      "zum thema"
    ],
    french: [
      "nouveau et mieux",
      "première page",
      "recommandons",
      "lisez aussi",
      "articles similaires",
      "articles connexes",
      "autres articles",
      "plus sur le sujet",
      "sur le sujet"
    ],
    spanish: [
      "nuevo y mejor",
      "primera página",
      "recomendamos",
      "lee también",
      "artículos similares",
      "artículos relacionados",
      "otros artículos",
      "más sobre el tema",
      "sobre el tema"
    ],
    italian: [
      "nuovo e migliore",
      "prima pagina",
      "consigliamo",
      "leggi anche",
      "articoli simili",
      "articoli correlati",
      "altri articoli",
      "altro sull'argomento",
      "sull'argomento"
    ],
    portuguese: [
      "novo e melhor",
      "primeira página",
      "recomendamos",
      "leia também",
      "artigos similares",
      "artigos relacionados",
      "outros artigos",
      "mais sobre o tema",
      "sobre o tema"
    ],
    chinese: [
      "最新和最佳",
      "头版",
      "推荐",
      "也阅读",
      "相似文章",
      "相关文章",
      "其他文章",
      "更多主题",
      "主题"
    ],
    japanese: [
      "新しくて最高",
      "第一面",
      "おすすめ",
      "こちらも読む",
      "類似記事",
      "関連記事",
      "その他の記事",
      "トピックの詳細",
      "トピック"
    ],
    korean: [
      "새로운 것과 최고",
      "첫 페이지",
      "추천",
      "또한 읽기",
      "유사한 기사",
      "관련 기사",
      "다른 기사",
      "주제에 대해 더",
      "주제"
    ]
  };
  var COURSE_AD_PATTERNS = [
    "video + ux training",
    "get video",
    "video training",
    "video course",
    "measure ux & design impact",
    "money-back-guarantee",
    "money back guarantee",
    "get the video course",
    "get video + ux training",
    "use the code",
    "save 20%",
    "save 20% off"
  ];
  var EXCLUDED_CLASSES = [
    "nav",
    "navigation",
    "menu",
    "sidebar",
    "footer",
    "header",
    "ad",
    "advertisement",
    "ads",
    "sponsor",
    "sponsored",
    "advert",
    "comment",
    "comments",
    "disqus",
    "related",
    "related-posts",
    "related-articles",
    "related-articles__title",
    "recommended",
    "also-in",
    "social",
    "share",
    "share-buttons",
    "share-menu",
    "author-bio",
    "author-info",
    "about-author",
    "translation-notice",
    "translation-badge",
    "post-navigation",
    "post-nav",
    "prev",
    "next",
    "previous",
    "read-more",
    "readmore",
    "keep-reading",
    "subscribe",
    "paywall",
    "gate",
    "newsletter",
    "newsletter-signup",
    "subscribe-box",
    "you-might-also-like",
    "you-may-also-like",
    "more-in",
    "next-article",
    "previous-article",
    "article-nav",
    "comment-section",
    "comments-section",
    "view-comments",
    "add-comment",
    "book-cta",
    "course-cta",
    "product-cta",
    "course-ad",
    "product-ad",
    "book-cta__inverted",
    "book-cta__col",
    "component-share-buttons",
    "aria-font-adjusts",
    "font-adjust",
    // Patterns from node-unfluff not previously covered
    "byline",
    "dateline",
    "timestamp",
    "toolbar",
    "toolbox",
    "breadcrumb",
    "breadcrumbs",
    "tag-cloud",
    "tags",
    "tag-list",
    "widget",
    "widgets",
    "promo",
    "promotion",
    "promotional",
    "toc",
    "table-of-contents",
    "contents-nav",
    "modal",
    "popup",
    "overlay",
    "lightbox",
    "cookie",
    "gdpr",
    "consent",
    "tracking"
  ];
  var PAYWALL_CLASSES = [
    "freebie-message",
    "subscribe-text",
    "message--freebie",
    "subscribe-",
    "paywall",
    "subscription",
    "freebie",
    "article-limit",
    "access-message"
  ];
  var LOGO_PATTERNS = [
    "logo",
    "brand",
    "icon",
    "badge",
    "watermark",
    "sprite",
    "spacer",
    "blank",
    "clear",
    "pixel",
    "youtube",
    "facebook",
    "twitter",
    "instagram",
    "linkedin",
    "pinterest",
    "rss",
    "social-media",
    "social-icon",
    "share-icon",
    "share-button",
    "youtube-white-logo",
    "youtube-logo",
    "yt-logo",
    "facebook-logo",
    "twitter-logo",
    "instagram-logo",
    "arrow",
    "chevron",
    "bullet",
    "dot",
    "bg",
    "background",
    "shadow",
    "border",
    "divider",
    "separator",
    "spinner",
    "loader",
    "loading",
    "placeholder",
    "default",
    "avatar",
    "user",
    "profile",
    "gravatar"
  ];
  var TRACKING_PATTERNS = [
    "pixel",
    "tracking",
    "beacon",
    "analytics",
    "facebook.com/tr",
    "doubleclick",
    "googleads"
  ];
  var PLACEHOLDER_PATTERNS = [
    "placeholder",
    "spacer",
    "blank",
    "1x1",
    "pixel.gif"
  ];

  // scripts/extraction/extractor/constants.js
  var CANDIDATE_SELECTOR = "article,section,main,aside,body,h1,h2,h3,h4,h5,h6,p,img,svg,canvas,iframe,video,audio,figure,figcaption,blockquote,pre,code,ul,ol,dl,dt,dd,table,td,th,div,hr";
  function flattenPatterns(patterns) {
    return Object.values(patterns).flat();
  }
  var CONSTANTS = {
    // Content thresholds
    ...CONTENT_THRESHOLDS,
    // Image thresholds
    ...IMAGE_THRESHOLDS,
    // Scoring thresholds
    ...SCORING_THRESHOLDS,
    // Navigation patterns (flattened for direct access)
    NAVIGATION_PATTERNS_CONTAINS: NAVIGATION_PATTERNS.contains,
    NAVIGATION_PATTERNS_STARTS_WITH: NAVIGATION_PATTERNS.startsWith,
    // Paywall patterns (flattened)
    PAYWALL_PATTERNS: flattenPatterns(PAYWALL_PATTERNS),
    // Related articles patterns (flattened)
    RELATED_ARTICLES_PATTERNS: flattenPatterns(RELATED_ARTICLES_PATTERNS),
    // Course ad patterns
    COURSE_AD_PATTERNS,
    // Excluded classes
    EXCLUDED_CLASSES,
    // Paywall classes
    PAYWALL_CLASSES,
    // Logo patterns
    LOGO_PATTERNS,
    // Tracking patterns
    TRACKING_PATTERNS,
    // Placeholder patterns
    PLACEHOLDER_PATTERNS,
    // Selectors
    CONTENT_SELECTORS,
    STANDFIRST_SELECTORS,
    AUTHOR_SELECTORS,
    DATE_SELECTORS,
    FEATURED_IMAGE_SELECTORS
  };

  // scripts/extraction/extractor/atomic-media.js
  function sourceOrder(first, second) {
    if (first === second) return 0;
    return first.compareDocumentPosition(second) & 4 ? -1 : 1;
  }
  function hasReadingContent(fragment) {
    return !!fragment.textContent?.trim() || !!fragment.querySelector("img,svg,canvas");
  }
  function reservedMediaIds(document2) {
    const reserved = new Set(Array.from(document2.querySelectorAll("[id],[name]")).flatMap((element) => [element.id, element.getAttribute("name")]).filter(Boolean));
    const source = new URL(document2.URL);
    source.hash = "";
    for (const link of document2.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href").trim();
      if (!href.includes("#")) continue;
      try {
        const target = new URL(href, document2.baseURI);
        const id = decodeURIComponent(target.hash.slice(1));
        if (!id.startsWith("reading-media-")) continue;
        target.hash = "";
        if (href.startsWith("#") || target.href === source.href) reserved.add(id);
      } catch (_) {
      }
    }
    return reserved;
  }
  function replaceLinkedMedia(copy, reference) {
    const link = copy.closest("a[href]");
    if (!link) {
      copy.replaceWith(reference);
      return null;
    }
    const doc = copy.ownerDocument;
    const afterRange = doc.createRange();
    afterRange.selectNodeContents(link);
    afterRange.setStartAfter(copy);
    const after = afterRange.extractContents();
    const beforeRange = doc.createRange();
    beforeRange.selectNodeContents(link);
    beforeRange.setEndBefore(copy);
    const before = beforeRange.extractContents();
    const linkedContent = hasReadingContent(before) || hasReadingContent(after);
    const parts = [];
    const part = (fragment) => {
      if (!fragment.childNodes.length) return;
      const anchor = link.cloneNode(false);
      anchor.append(fragment);
      parts.push(anchor);
    };
    part(before);
    parts.push(reference);
    part(after);
    if (!linkedContent) {
      const source = link.cloneNode(false);
      source.textContent = "Source";
      parts.push(doc.createTextNode(" "), source);
    }
    const seen = /* @__PURE__ */ new Set();
    for (const element of parts.filter((node) => node.nodeType === 1)) {
      for (const node of [element, ...Array.from(element.querySelectorAll("[id]"))]) {
        if (!node.id) continue;
        if (seen.has(node.id)) node.removeAttribute("id");
        else seen.add(node.id);
      }
    }
    link.replaceWith(...parts);
    return { removed: link, links: parts.filter((node) => node.nodeType === 1 && node !== reference && node.tagName === "A") };
  }
  function projectAtomicMedia(originalElement, admittedElements, state, createImageItem2) {
    const copies = /* @__PURE__ */ new Map();
    const clone = (
      /** @type {Element} */
      cloneReadingContent(originalElement, state.selectionExclusions || [], copies)
    );
    preserveClonedMathInputs(originalElement, copies);
    const admitted = new Set(admittedElements);
    const graphics = [...state.readingGraphics?.keys() || []].filter((owner) => originalElement.contains(owner) && (admitted.has(owner) || [...admitted].some((element) => owner.contains(element))));
    const candidates = [.../* @__PURE__ */ new Set([...graphics, ...Array.from(originalElement.querySelectorAll("img")).filter((image) => admitted.has(image))])].sort(sourceOrder);
    const owners = candidates.filter((owner) => !candidates.some((other) => other !== owner && other.contains(owner)));
    if (!owners.length) return { clone, copies, media: [] };
    state.readingMediaIds ||= /* @__PURE__ */ new Map();
    const reserved = state.readingMediaReservations ||= /* @__PURE__ */ new Set([
      ...reservedMediaIds(originalElement.ownerDocument),
      ...state.readingMediaIds.values()
    ]);
    const media = [];
    const sourceLinks = /* @__PURE__ */ new Map();
    for (const owner of owners) {
      let copy = copies.get(owner), insertion = null;
      if (!copy || !clone.contains(copy)) {
        if (isSourceExcluded(owner, state.selectionExclusions || [])) continue;
        const win = owner.ownerDocument.defaultView;
        if (["hidden", "collapse"].includes(win?.getComputedStyle(owner).visibility)) continue;
        let hidden2 = false;
        for (let node = owner; node; node = node.parentElement) if (win?.getComputedStyle(node).display === "none") {
          hidden2 = true;
          break;
        }
        if (hidden2) continue;
        let originalTextOwner = false;
        for (let ancestor = owner.parentElement; ancestor && originalElement.contains(ancestor); ancestor = ancestor.parentElement) {
          const target = copies.get(ancestor);
          if (ancestor.getAttribute("data-original-text")?.trim() && target && clone.contains(target)) {
            originalTextOwner = true;
            break;
          }
        }
        if (originalTextOwner) for (let ancestor = owner.parentElement; ancestor && originalElement.contains(ancestor); ancestor = ancestor.parentElement) {
          const target = copies.get(ancestor);
          if (ancestor.matches("td,th,li,blockquote") && target && clone.contains(target)) {
            insertion = target;
            break;
          }
        }
        if (!insertion) continue;
      }
      const item = state.readingGraphics?.get(owner) || (owner.tagName === "IMG" ? createImageItem2(owner) : null);
      if (!item) continue;
      let id = state.readingMediaIds.get(owner);
      if (!id) {
        do {
          state.readingMediaCounter = (state.readingMediaCounter || 0) + 1;
          id = `reading-media-${state.readingMediaCounter}`;
        } while (reserved.has(id));
        state.readingMediaIds.set(owner, id);
        reserved.add(id);
      }
      const reference = originalElement.ownerDocument.createElement("a");
      reference.href = "#" + encodeURIComponent(id);
      reference.textContent = item.alt?.trim() || "Image";
      if (owner.id) reference.id = owner.id;
      const sourceLink = owner.closest("a[href]");
      if (insertion) {
        insertion.append(" ", reference);
        if (sourceLink) {
          const link = originalElement.ownerDocument.createElement("a");
          link.setAttribute("href", sourceLink.getAttribute("href"));
          link.textContent = "Source";
          if (sourceLink.id && !Array.from(clone.querySelectorAll("[id]")).some((node) => node.id === sourceLink.id)) link.id = sourceLink.id;
          insertion.append(" ", link);
        }
      } else {
        const control = copy.closest('button,[role="button"]');
        let split = null;
        if (control && clone.contains(control) && control !== clone) control.replaceWith(reference);
        else split = replaceLinkedMedia(copy, reference);
        if (sourceLink && split) {
          if (!sourceLinks.has(sourceLink)) sourceLinks.set(sourceLink, /* @__PURE__ */ new Set());
          const links = sourceLinks.get(sourceLink);
          links.delete(split.removed);
          for (const link of split.links) links.add(link);
        }
      }
      const cell = owner.closest("td,th");
      const tableMedia = originalElement.tagName === "TABLE" && cell && originalElement.contains(cell);
      const image = { ...item, id, ...tableMedia ? { tableMedia: true } : {} };
      const figure = owner.closest("figure");
      const caption = figure && Array.from(figure.querySelectorAll("figcaption")).find((node) => node.closest("figure") === figure);
      const captionCopy = caption && copies.get(caption);
      if (captionCopy && clone.contains(captionCopy)) image.caption = "";
      media.push({ source: owner, item: image });
    }
    for (const links of sourceLinks.values()) {
      const connected = [...links].filter((link) => clone.contains(link));
      if (!connected.length || connected.some((link) => {
        const text = link.cloneNode(true);
        for (const media2 of Array.from(text.querySelectorAll("img,svg,canvas,script,style"))) media2.remove();
        return !!text.textContent?.trim();
      })) continue;
      connected[0].append("Source");
    }
    return { clone, copies, media };
  }

  // scripts/extraction/extractor/parse.js
  function collectCandidateElements(mainContent) {
    return [mainContent, ...Array.from(mainContent.querySelectorAll("*"))].filter((element) => element.matches(CANDIDATE_SELECTOR) || visibleShadowCode(element).length);
  }
  function isComposedLightElement(element) {
    for (let node = element; node.parentElement; node = node.parentElement) {
      if (node.parentElement.shadowRoot && !node.assignedSlot) return false;
    }
    return true;
  }
  function visibleShadowCode(host) {
    if (!host.shadowRoot || host.closest("table,pre,code,[hidden],[inert]")) return [];
    const win = host.ownerDocument.defaultView;
    return Array.from(host.shadowRoot.querySelectorAll("pre:has(> code)")).filter((pre) => !pre.closest('pre pre,[hidden],[inert],form,[role="dialog"],[contenteditable]:not([contenteditable="false"])') && isElementVisible(win, pre));
  }
  function readShadowCode(pre, exclusions) {
    const win = pre.ownerDocument.defaultView;
    const slotted = [];
    const read = (node) => {
      if (node.nodeType === 3) return node.textContent || "";
      if (node.nodeType !== 1 || node.matches('script,style,template,noscript,button,[role~="button"],[aria-hidden="true"],[hidden],[inert]') || isSourceExcluded(node, exclusions)) return "";
      const style = safeGetComputedStyle(win, node);
      if (style?.display === "none" || ["hidden", "collapse"].includes(style?.visibility)) return "";
      if (node.tagName === "BR") return "\n";
      if (node.tagName === "SLOT") {
        const assigned = node.assignedNodes({ flatten: true });
        slotted.push(...assigned.filter((child) => child.nodeType === 1 && child.assignedSlot));
        return assigned.map(read).join("");
      }
      return Array.from((node.shadowRoot || node).childNodes, read).join("");
    };
    const text = Array.from(pre.children).filter((child) => child.tagName === "CODE").map(read).join("\n");
    return { item: text.trim() ? handleCode(pre, text) : null, slotted };
  }
  function collectExplicitFlowRoots(roots) {
    const selected = new Set(roots);
    return new Set(roots.filter((root) => {
      if (root.matches(CANDIDATE_SELECTOR) || root.namespaceURI !== "http://www.w3.org/1999/xhtml" || !root.ownerDocument.body?.contains(root) || root.closest(`${INTERFACE_REGIONS},[inert],script,style,template,noscript,input,textarea,select,option,button,[role~="button"],[role~="menu"],[role~="menubar"]`)) return false;
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (selected.has(parent)) return false;
      }
      return true;
    }));
  }
  function filterCandidateElements(win, allElements, constants, debugInfo, readingRoots = [], tocRoots = [], selectedIllustrations = /* @__PURE__ */ new Map()) {
    let excludedImageCount = 0;
    let excludedByType = {};
    const filteredElements = allElements.filter((el) => {
      const tagName = el.tagName.toLowerCase();
      const isImageOrFigure = tagName === "img" || tagName === "figure";
      if (!isComposedLightElement(el) || isExcluded(win, el, constants, readingRoots, tocRoots, selectedIllustrations.has(el))) {
        if (isImageOrFigure) {
          excludedImageCount++;
        } else excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
        return false;
      }
      return true;
    });
    if (debugInfo) {
      debugInfo.excludedImageCount = excludedImageCount;
    }
    return filteredElements;
  }
  function sortElementsInDomOrder(elements) {
    return [...elements].sort(compareDomOrder);
  }
  function originalFigureContent(element, baseUrl, layers, caption) {
    const document2 = element.ownerDocument;
    const paragraph = document2.createElement("p");
    const original = new URL(baseUrl);
    if (element.id) original.hash = element.id;
    const link = document2.createElement("a");
    link.href = original.href;
    link.textContent = "View the original layered figure";
    paragraph.append("This figure could not be reproduced in the export. ", link, " · ");
    layers.forEach((source, index) => {
      const layer = document2.createElement("a");
      layer.href = source;
      layer.textContent = `Layer ${index + 1}`;
      if (index > 0) paragraph.append(", ");
      paragraph.append(layer);
    });
    return paragraph.innerHTML + (caption ? "<br>" + caption : "");
  }
  function graphicReferences(owner, state, constants, win, baseUrl) {
    const references = [];
    for (const source of Array.from(owner.querySelectorAll("a"))) {
      if (source.closest("figcaption,button,nav,footer") || isSourceExcluded(source, state.selectionExclusions) || isExcluded(win, source, constants, state.referenceRoots, state.tocRoots)) continue;
      const href = source.getAttribute("href") || source.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href) continue;
      let url;
      try {
        url = new URL(href, baseUrl);
      } catch (_) {
        continue;
      }
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) continue;
      const label = readArticleMetadataText(source) || Array.from(source.querySelectorAll("img")).map((image) => image.alt).filter(Boolean).join(" ") || "Source";
      const link = owner.ownerDocument.createElement("a");
      link.setAttribute("href", href.startsWith("#") ? href : url.href);
      link.textContent = label;
      const html = link.outerHTML;
      references.push({
        type: "paragraph",
        text: html,
        html,
        ...source.id && source.id !== owner.id ? { id: source.id } : {}
      });
    }
    return references;
  }
  function cloneFigureText(element) {
    const copies = /* @__PURE__ */ new Map();
    const clone = (
      /** @type {Element} */
      cloneReadingContent(element, [], copies)
    );
    preserveClonedMathInputs(element, copies);
    for (const media of Array.from(clone.querySelectorAll("img,iframe,svg,canvas,video,audio,nav,footer"))) {
      if (!media.closest("math,mjx-container,.MathJax,.katex")) media.remove();
    }
    return clone;
  }
  function hasFigureBodyText(element) {
    const clone = cloneFigureText(element);
    for (const auxiliary of Array.from(clone.querySelectorAll('figcaption,button,[role="button"]'))) auxiliary.remove();
    return !!clone.textContent?.trim();
  }
  function partitionCandidateElements(elements, graphics = /* @__PURE__ */ new Map(), readingBoundaries = [], explicitFlowRoots = /* @__PURE__ */ new Set()) {
    const selected = new Set(elements);
    const visited = /* @__PURE__ */ new Set();
    const shadowHosts = elements.filter((element) => element.shadowRoot && visibleShadowCode(element).length);
    const entries = [];
    const blockSelector = CANDIDATE_SELECTOR.split(",").filter((tag) => tag !== "code").concat(INTERFACE_REGIONS).join(",");
    function append(element) {
      if (visited.has(element)) return;
      visited.add(element);
      if (graphics.has(element)) {
        entries.push({ element });
        for (const child of Array.from(element.querySelectorAll("*"))) visited.add(child);
        return;
      }
      const blockDescendants = Array.from(element.querySelectorAll(blockSelector)).filter((child) => !child.matches("svg,canvas") || graphics.has(child));
      const descendants = [.../* @__PURE__ */ new Set([
        ...blockDescendants,
        ...shadowHosts.filter((host) => host !== element && element.contains(host)),
        ...readingBoundaries.filter((child) => child !== element && element.contains(child))
      ])].sort(compareDomOrder);
      const originalText = element.getAttribute("data-original-text");
      const inlineMedia = element.tagName === "P" && descendants.some((child) => child.matches("img,iframe,video,audio,svg,canvas"));
      const inlineShadowCode = element.tagName === "P" && shadowHosts.some((host) => element.contains(host) && host !== element);
      const inlineBoundary = !/^H[1-6]$/.test(element.tagName) && element.tagName !== "FIGURE" && descendants.some((child) => readingBoundaries.includes(child));
      const richFigure = element.tagName === "FIGURE" && hasFigureBodyText(element);
      const flowContainer = isFlowContainer(element) || explicitFlowRoots.has(element);
      if (!flowContainer && !inlineMedia && !inlineShadowCode && !inlineBoundary && !richFigure || descendants.length === 0 || originalText?.trim()) {
        entries.push({ element });
        for (const child of Array.from(element.querySelectorAll("*"))) {
          if (selected.has(child)) append(child);
        }
        return;
      }
      const boundaries = new Set(descendants);
      const children = descendants.filter((child) => {
        for (let parent = child.parentElement; parent && parent !== element; parent = parent.parentElement) {
          if (boundaries.has(parent)) return false;
        }
        return true;
      });
      const range = element.ownerDocument.createRange();
      range.setStart(element, 0);
      function appendFragment() {
        const fragment = range.cloneContents();
        if (!(fragment.textContent || "").trim() && !fragment.querySelector("img,math,mjx-container")) return;
        preserveRangeMathInputs(element, range, fragment);
        const wrapper = element.cloneNode(false);
        wrapper.appendChild(fragment);
        const owned = Array.from(element.querySelectorAll("code")).filter((child) => range.intersectsNode(child));
        entries.push({ element: (
          /** @type {Element} */
          wrapper
        ), container: element, owned });
      }
      for (const child of children) {
        range.setEndBefore(child);
        appendFragment();
        if (selected.has(child)) append(child);
        else for (const nested of Array.from(child.querySelectorAll("*"))) {
          if (selected.has(nested)) append(nested);
        }
        range.setStartAfter(child);
      }
      range.setEnd(element, element.childNodes.length);
      appendFragment();
    }
    for (const element of elements) append(element);
    return entries;
  }
  function parseElements(win, elements, state, constants, baseUrl, annotationPass = false) {
    const content = [];
    let processedCount = 0;
    let skippedCount = 0;
    const consumed = /* @__PURE__ */ new Set();
    state.captionOwners ||= /* @__PURE__ */ new WeakSet();
    for (const [owner, graphic] of state.readingGraphics || []) {
      if (graphic.type !== "image") continue;
      const caption = Array.from(owner.querySelectorAll("figcaption")).find((node) => node.closest("figure") === owner);
      if (caption) graphic.caption = serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots);
    }
    for (const element of elements) {
      if (element.tagName !== "IMG") continue;
      const image = (
        /** @type {HTMLImageElement} */
        element
      );
      if (!image.closest("figure") && extractBestImageUrl(image) && !isTrackingPixel(win, image) && !isDecorativeImage(win, image, constants.LOGO_PATTERNS || [])) {
        getImageCaption(image, state.captionOwners, state.selectionExclusions, state.selectedIllustrations?.get(image));
      }
    }
    const readingBoundaries = (state.selectionExclusions || []).filter((rule) => typeof rule !== "string");
    if (state.standfirstElement) readingBoundaries.push(state.standfirstElement);
    const graphicOwners = state.originalImageLayers?.size ? /* @__PURE__ */ new Set([...state.readingGraphics?.keys() || [], ...state.originalImageLayers.keys()]) : state.readingGraphics;
    const sourceTitle = state.originalImageLayers?.size && state.mainTitleText ? elements.find((element) => element.tagName === "H1" && normalizeHeadingForDedup(readArticleMetadataText(element)) === state.mainTitleText) : null;
    for (const { element, container, owned } of partitionCandidateElements(elements, graphicOwners, readingBoundaries, state.explicitFlowRoots)) {
      if (consumed.has(element) || container && consumed.has(container)) continue;
      if (state.captionOwners.has(container || element)) continue;
      const tagName = element.tagName.toLowerCase();
      const selectedTitle = element === state.selectedTitleElement && (/^h[1-6]$/.test(tagName) || isFlowContainer(element) && !element.querySelector(CANDIDATE_SELECTOR));
      const declaredHeadline = tagName === "h1" && (element.matches('[itemprop~="headline"],[data-type="document-title"]') || Array.from(element.classList).some((name) => /(?:^|[-_])(?:page|article|post|entry)[-_](?:title|headline)$/i.test(name)));
      const inferredTitle = tagName === "h1" && element === state.titleElement && (declaredHeadline && isDocumentHeadline(element) || content.every((item) => item.type === "subtitle" || item.type === "separator" || item.isStandfirst || item.isFeatured || item.type === "paragraph" && /^<a\b[^>]*>[^<]{1,80}<\/a>$/i.test(item.html?.trim() || "")));
      if (selectedTitle || inferredTitle) {
        for (const child of Array.from(element.querySelectorAll("*"))) consumed.add(child);
        continue;
      }
      if (shouldSkipStronglyExcluded(container || element)) {
        skippedCount++;
        continue;
      }
      let emittedShadowCode = false;
      for (const source of visibleShadowCode(element)) {
        const { item, slotted } = readShadowCode(source, state.selectionExclusions);
        if (!item) continue;
        content.push({ ...item, ...!emittedShadowCode && element.id ? { id: element.id } : {} });
        emittedShadowCode = true;
        for (const slot of slotted) {
          consumed.add(slot);
          for (const child of slot.querySelectorAll("*")) consumed.add(child);
        }
        incrementContentType(state.debugInfo, "code");
        processedCount++;
      }
      if (emittedShadowCode) continue;
      if (element === state.standfirstElement) {
        const html = serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots);
        if (html) content.push({
          type: "subtitle",
          text: html,
          html,
          isStandfirst: true,
          ...element.id ? { id: element.id } : {}
        });
        for (const child of Array.from(element.querySelectorAll("*"))) consumed.add(child);
        continue;
      }
      const graphic = state.readingGraphics?.get(element);
      const originalLayers = state.originalImageLayers?.get(element);
      if (graphic || originalLayers) {
        const caption = Array.from(element.querySelectorAll("figcaption")).find((node) => node.closest("figure") === element);
        const captionHtml = caption ? serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots) : "";
        if (graphic && graphic.type !== "image") {
          content.push(graphic);
        } else if (graphic) {
          content.push({
            ...graphic,
            ...element.id ? { id: element.id } : {},
            ...caption ? { caption: captionHtml } : {},
            ...state.featuredMediaRoots?.some((root) => root === element || root.contains(element)) ? { isFeatured: true } : {}
          });
        } else {
          const html = originalFigureContent(element, baseUrl, originalLayers, captionHtml);
          const leadsTitle = sourceTitle && !element.contains(sourceTitle) && compareDomOrder(element, sourceTitle) < 0;
          content.push({
            type: "paragraph",
            text: html,
            html,
            ...element.id ? { id: element.id } : {},
            ...leadsTitle ? { isFeatured: true } : {}
          });
        }
        content.push(...graphicReferences(element, state, constants, win, baseUrl));
        for (const child of Array.from(element.querySelectorAll("*"))) consumed.add(child);
        incrementContentType(state.debugInfo, graphic?.type === "image" ? "image" : "paragraph");
        processedCount++;
        continue;
      }
      if (container) {
        for (const translated of Array.from(element.querySelectorAll("[data-original-text]"))) {
          const original = translated.getAttribute("data-original-text");
          if (original?.trim()) translated.textContent = original.trim();
        }
        const figure = container.closest("figure");
        const fragment = figure && !container.closest("figcaption") ? cloneFigureText(element) : element;
        const html = serializeReadingHtml(
          fragment,
          state.selectionExclusions,
          state.referenceRoots,
          state.explicitFlowRoots?.has(container) === true
        );
        if (!html) continue;
        content.push({
          type: "paragraph",
          text: container.tagName === "DT" ? `<strong>${html}</strong>` : html,
          html: container.tagName === "DT" ? `<strong>${html}</strong>` : html,
          ...container.id && !content.some((item) => item.id === container.id) ? { id: container.id } : {}
        });
        for (const child of owned || []) consumed.add(child);
        incrementContentType(state.debugInfo, "paragraph");
        processedCount++;
        continue;
      }
      const previousCount = content.length;
      const atomic = ["blockquote", "ul", "ol"].includes(tagName) || tagName === "table" && !isLayoutTable(element) ? projectAtomicMedia(element, elements, state, (source) => {
        const item = createImageItem(win, source, state, constants, baseUrl);
        if (item) item.caption = getImageCaption(
          /** @type {HTMLImageElement} */
          source,
          state.captionOwners,
          state.selectionExclusions
        );
        return item;
      }) : null;
      const unit = atomic?.clone || element;
      if (tagName === "hr") {
        content.push({ type: "separator" });
        processedCount++;
      } else if (["iframe", "video", "audio"].includes(tagName)) {
        for (const item of getEmbeddedMediaItems(element)) {
          if (item.type === "image") {
            const key = normalizeImageUrl(item.src);
            const figure = element.closest("figure");
            if (figure && Array.from(figure.querySelectorAll("img")).some((image) => normalizeImageUrl(toAbsoluteUrl(extractBestImageUrl(image), baseUrl)) === key)) continue;
            if (state.processedImages.size < 1e3) state.processedImages.add(key);
          }
          content.push(element.id && item.type !== "image" ? { ...item, id: element.id } : item);
          incrementContentType(state.debugInfo, item.type);
          processedCount++;
        }
      } else if (tagName.match(/^h[1-6]$/)) {
        const isReal = isReadingOwned(element, state.referenceRoots) || isRealHeading(element, win);
        if (!isReal) {
          skippedCount++;
          continue;
        }
        const item = handleHeading(element, state, constants);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "heading");
          processedCount++;
        } else {
          skippedCount++;
        }
      } else if (tagName === "p" || tagName === "figcaption") {
        const item = handleParagraph(win, element, state, constants);
        if (item) {
          const isLeadingCaption = tagName === "figcaption" && element.closest("figure") && state.titleElement && compareDomOrder(element, state.titleElement) < 0;
          content.push(isLeadingCaption ? { ...item, isFeatured: true } : item);
          incrementContentType(state.debugInfo, "paragraph");
          processedCount++;
        } else {
          skippedCount++;
        }
      } else if (tagName === "figure") {
        if (hasFigureBodyText(element)) {
          const originalText = element.getAttribute("data-original-text")?.trim();
          const html = originalText ? encodeOriginalText(element, originalText) : serializeReadingHtml(cloneFigureText(element), state.selectionExclusions, state.referenceRoots);
          if (html) {
            content.push({ type: "paragraph", text: html, html });
            incrementContentType(state.debugInfo, "paragraph");
            processedCount++;
          }
          if (originalText) {
            for (const child of Array.from(element.querySelectorAll("*"))) {
              if (!child.matches("img,iframe,video,audio")) consumed.add(child);
            }
          }
          continue;
        }
        const mixedContent = Array.from(element.querySelectorAll("h1,h2,h3,h4,h5,h6,p,table,pre,code,blockquote,ul,ol,hr,iframe,video,audio")).some((child) => !child.closest('figcaption,button,[role="button"]'));
        if (mixedContent) continue;
        const images = [];
        for (const image of Array.from(element.querySelectorAll("img")).filter((image2) => image2.closest("figure") === element && elements.includes(image2))) {
          const item = createImageItem(win, image, state, constants, baseUrl);
          if (item) {
            images.push(item);
            consumed.add(image);
          }
        }
        if (images.length) {
          const source = Array.from(element.querySelectorAll("img")).find((image) => image.closest("figure") === element && elements.includes(image));
          images[images.length - 1].caption = getImageCaption(source, state.captionOwners, state.selectionExclusions);
          for (const caption of Array.from(element.querySelectorAll("figcaption")).filter((caption2) => caption2.closest("figure") === element)) {
            consumed.add(caption);
            for (const child of Array.from(caption.querySelectorAll("*"))) consumed.add(child);
          }
          content.push(...images);
          for (const _image of images) incrementContentType(state.debugInfo, "image");
          processedCount += images.length;
        } else skippedCount++;
        continue;
      } else if (tagName === "img") {
        const item = handleImg(win, element, state, constants, baseUrl);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "image");
          processedCount++;
        } else {
          skippedCount++;
        }
      } else if (tagName === "blockquote") {
        const item = handleBlockquote(unit, state.selectionExclusions, state.referenceRoots);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "quote");
          processedCount++;
        }
      } else if (tagName === "pre" || tagName === "code") {
        if (tagName === "code" && element.closest("pre")) {
          skippedCount++;
          continue;
        }
        const item = handleCode(element);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "code");
          processedCount++;
        }
      } else if (tagName === "ul" || tagName === "ol") {
        const item = handleList(unit, state.selectionExclusions, state.referenceRoots, state.tocRoots);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "list");
          processedCount++;
        }
      } else if (tagName === "table") {
        if (isLayoutTable(element)) continue;
        const caption = Array.from(element.children).find((child) => child.tagName === "CAPTION");
        const captionHtml = caption && serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots);
        if (captionHtml) content.push({
          type: "paragraph",
          text: captionHtml,
          html: captionHtml,
          ...caption.id ? { id: caption.id } : {}
        });
        const sourceCells = new Map(Array.from(atomic?.copies || [], ([source, copy]) => [copy, source]));
        const item = handleTable(unit, state.selectionExclusions, state.referenceRoots, sourceCells);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "table");
          processedCount++;
        }
      } else if (isFlowContainer(element) || state.explicitFlowRoots?.has(element)) {
        const item = handleDiv(element, state, constants);
        if (item) {
          content.push(item);
          incrementContentType(state.debugInfo, "paragraph");
          processedCount++;
        } else {
          skippedCount++;
        }
      }
      for (const { source, item } of atomic?.media || []) {
        content.push(item);
        if (item.isGraphic) content.push(...graphicReferences(source, state, constants, win, baseUrl));
      }
      if (content.length > previousCount && !["iframe", "video", "audio"].includes(tagName)) {
        const originalMedia = ["p", "div"].includes(tagName) && element.getAttribute("data-original-text")?.trim();
        for (const child of Array.from(element.querySelectorAll("*"))) {
          if (!originalMedia || !child.matches("img,iframe,video,audio")) consumed.add(child);
        }
      }
    }
    if (state.debugInfo) {
      state.debugInfo.processedCount = processedCount;
      state.debugInfo.skippedCount = skippedCount;
    }
    if (!annotationPass && elements.length) {
      const document2 = elements[0].ownerDocument;
      const dependencies = collectAnnotationTargets(
        elements,
        emittedReadingIds(content, document2),
        state.selectionExclusions,
        (reference) => !isExcluded(win, reference, constants, state.referenceRoots, state.tocRoots)
      );
      const projected = dependencies.map(({ target, clone, label, citation }) => {
        const roots = [...state.referenceRoots || [], clone];
        const candidates = [clone, ...Array.from(clone.querySelectorAll(CANDIDATE_SELECTOR))];
        const selected = filterCandidateElements(win, candidates, constants, null, roots);
        const items = parseElements(win, selected, {
          ...state,
          referenceRoots: roots,
          standfirstElement: null,
          standfirstText: null,
          mainTitleText: ""
        }, constants, baseUrl, true);
        return { target, label, items, citation };
      });
      if (projected.length) reuseAnnotationCitations(content, projected, document2);
    }
    return omitInitialArticleTitle(content, state);
  }
  function omitInitialArticleTitle(content, state) {
    const firstBodyIndex = content.findIndex((item) => item.type !== "subtitle" && item.type !== "separator" && !item.isStandfirst && !item.isFeatured);
    const firstBody = content[firstBodyIndex];
    if (firstBody?.type === "heading" && firstBody.level === 1 && state.mainTitleText && normalizeHeadingForDedup(firstBody.text) === state.mainTitleText) {
      return content.filter((_item, index) => index !== firstBodyIndex);
    }
    return content;
  }
  function handleHeading(element, state, constants) {
    if (state.standfirstElement && element === state.standfirstElement) return null;
    const rawText = readArticleMetadataText(element, state.selectionExclusions);
    const cleanedText = cleanHeadingText(rawText);
    const readingOwned = isReadingOwned(element, state.referenceRoots);
    if (!cleanedText || !readingOwned && cleanedText.length < 3) return null;
    const lowerText = cleanedText.toLowerCase();
    if (!readingOwned && (lowerText.includes("subscribe") || lowerText.includes("sign up") || lowerText.includes("newsletter") || lowerText.includes("promotional") || lowerText.includes("create an account") || lowerText.includes("member-only") || lowerText.includes("sign in") || lowerText.includes("already have an account"))) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("similar post") || lowerText.includes("highlights from our") || lowerText.includes("atavist magazine collection"))) {
      return null;
    }
    const parent = element.parentElement;
    if (parent) {
      const parentClass = String(parent.className || "").toLowerCase();
      const parentId = (parent.id || "").toLowerCase();
      if (parentClass.includes("related") || parentId.includes("related")) {
        return null;
      }
    }
    const level = parseInt(element.tagName.charAt(1));
    const aside = element.closest('aside[id],[role~="complementary"][id]');
    const sectionId = aside?.querySelector("h2,h3,h4,h5,h6") === element && isReferencedReadingAside(aside, state.referenceRoots, state.tocRoots) ? aside.id : void 0;
    const sourceIds = readSourceFragmentIds(element, state.selectionExclusions);
    if (sectionId && !sourceIds.includes(sectionId)) sourceIds.push(sectionId);
    return {
      type: "heading",
      level,
      text: cleanedText,
      format: "text",
      id: sourceIds[0],
      ...sourceIds.length > 1 ? { sourceFragmentIds: sourceIds } : {}
    };
  }
  function handleParagraph(win, element, state, constants) {
    if (element.closest("blockquote")) return null;
    const table = element.closest("table");
    if (table && !isLayoutTable(table) && isReadingOwned(table, state.referenceRoots)) return null;
    if (state.standfirstElement && element === state.standfirstElement) return null;
    const text = (element.textContent || "").trim();
    const readingOwned = isReadingOwned(element, state.referenceRoots) || !!element.closest("figure");
    if (!text || !readingOwned && text.length < 5) return null;
    const lowerText = text.toLowerCase();
    if (!readingOwned && /^\d+\s+words?$/i.test(text)) return null;
    if (!readingOwned && /^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;
    if (!readingOwned && isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
      return null;
    }
    if (!readingOwned && lowerText.includes("newsletter") && lowerText.includes("subscribe")) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("create an account to read") || lowerText.includes("member-only story") || lowerText.includes("sign up to read") || lowerText.includes("subscribe to read") || lowerText.includes("to read the full story") || lowerText.includes("sign up") && lowerText.includes("read") || lowerText.includes("subscribe") && lowerText.includes("read"))) {
      return null;
    }
    if (!readingOwned && lowerText.includes("donate") && (lowerText.includes("support") || lowerText.includes("mission"))) {
      return null;
    }
    if (!readingOwned && lowerText.includes("like what you're reading") && lowerText.includes("subscribe to the atavist magazine")) {
      return null;
    }
    if (!readingOwned && lowerText.includes("the atavist magazine") && lowerText.includes("credits")) {
      return null;
    }
    const originalText = getOriginalTextIfTranslated(element);
    const finalText = originalText ? encodeOriginalText(element, originalText) : serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots);
    return {
      type: "paragraph",
      text: finalText,
      html: finalText,
      ...element.id ? { id: element.id } : {}
    };
  }
  function handleImg(win, element, state, constants, baseUrl) {
    const item = createImageItem(win, element, state, constants, baseUrl);
    if (item && !element.closest("figure")) item.caption = getImageCaption(
      /** @type {HTMLImageElement} */
      element,
      state.captionOwners,
      state.selectionExclusions,
      state.selectedIllustrations?.get(element)
    );
    return item;
  }
  function createImageItem(win, element, state, constants, baseUrl) {
    const img = (
      /** @type {HTMLImageElement} */
      element
    );
    const src = extractBestImageUrl(img);
    if (!src || isCollapsedImageLayer(img)) return null;
    if (isTrackingPixel(win, img)) return null;
    if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || [])) return null;
    const absoluteSrc = toAbsoluteUrl(src, baseUrl);
    const normalizedSrc = normalizeImageUrl(absoluteSrc);
    if (state.processedImages.size < 1e3) {
      state.processedImages.add(normalizedSrc);
    }
    return {
      type: "image",
      src: absoluteSrc,
      alt: img.getAttribute("aria-label") || img.alt || img.title || "",
      caption: "",
      ...element.id ? { id: element.id } : {},
      ...state.featuredMediaRoots?.some((root) => root === element || root.contains(element)) ? { isFeatured: true } : {}
    };
  }
  function handleBlockquote(element, excludedSelectors = [], referenceRoots = null) {
    const text = serializeReadingHtml(element, excludedSelectors, referenceRoots);
    if (!text) return null;
    return {
      type: "quote",
      text,
      html: text
    };
  }
  function handleCode(element, composedText = null) {
    let text = composedText;
    if (text === null && element.tagName === "PRE") {
      const clone = element.cloneNode(true);
      const brs = (
        /** @type {HTMLElement} */
        clone.querySelectorAll("br")
      );
      for (const br of Array.from(brs)) {
        br.replaceWith("\n");
      }
      text = /** @type {HTMLElement} */
      clone.textContent || "";
    } else if (text === null) {
      text = (element.textContent || "").trim();
    }
    if (!text) return null;
    const className = element.className || "";
    const languageMatch = className.match(/(?:^|\s)(?:language-|brush:\s*)([\w+-]+)/);
    const language = languageMatch ? languageMatch[1] : "";
    return {
      type: "code",
      language,
      text,
      format: "text"
    };
  }
  function handleList(element, excludedSelectors = [], referenceRoots = null, tocRoots = []) {
    if (element.closest("blockquote")) return null;
    if (element.closest("table")) return null;
    const sidebar = element.closest(".sidebar");
    if (element.closest(".navbox, .authority-control, .side-box, .sister-box, .sistersitebox, .infobox, .hatnote, .mw-panel-toc, .vector-toc, #toc") || sidebar && !isReferencedReadingAside(sidebar, referenceRoots || [], tocRoots)) {
      return null;
    }
    const children = Array.from(element.querySelectorAll("li")).filter((li) => li.closest("ul, ol") === element);
    const generatedCounterMatches = element.tagName === "OL" && !element.hasAttribute("reversed") && (!element.hasAttribute("start") || element.getAttribute("start")?.trim() === "1") && children.every((li) => !li.hasAttribute("value"));
    const items = children.map((li, index) => {
      let exclusions = excludedSelectors;
      const leading = Array.from(li.childNodes).find((node) => node.nodeType !== 8 && (node.nodeType !== 3 || node.textContent?.trim()));
      if (generatedCounterMatches && leading?.nodeType === 1 && /** @type {Element} */
      leading.tagName === "SUP" && leading.textContent?.trim() === String(index + 1) && li.id) {
        const label = leading.textContent.trim();
        const reciprocal = Array.from(li.querySelectorAll('a[role="doc-backlink"][href]')).some((backlink) => {
          const target = getDocumentFragmentTarget(backlink);
          if (!target || li.contains(target)) return false;
          const references = target.matches("a[href]") ? [target] : Array.from(target.querySelectorAll("a[href]"));
          return references.some((reference) => reference.textContent?.trim() === label && getDocumentFragmentTarget(reference) === li);
        });
        if (reciprocal) exclusions = [...excludedSelectors, leading];
      }
      return { html: serializeReadingHtml(li, exclusions, referenceRoots), ...li.id ? { id: li.id } : {} };
    }).filter((item) => item.html.length > 0);
    if (items.length === 0) return null;
    return {
      type: "list",
      ordered: element.tagName === "OL",
      items
    };
  }
  function handleTable(element, excludedSelectors = [], referenceRoots = null, sourceCells = /* @__PURE__ */ new Map()) {
    if (element.closest("blockquote")) return null;
    const className = String(element.className || "").toLowerCase();
    if (className.includes("navbox") || className.includes("authority-control")) {
      return null;
    }
    const table = (
      /** @type {HTMLTableElement} */
      element
    );
    const win = element.ownerDocument.defaultView;
    const styles = /* @__PURE__ */ new Map();
    const style = (node) => {
      if (!styles.has(node)) styles.set(node, win ? safeGetComputedStyle(win, sourceCells.get(node) || node) : null);
      return styles.get(node);
    };
    const noLayout = (node, includeCollapsed = true) => {
      for (let current = node; current; current = current.parentElement) {
        const value = style(current);
        if (value?.display === "none" || includeCollapsed && ["TR", "THEAD", "TBODY", "TFOOT"].includes(current.tagName) && value?.visibility === "collapse") return true;
      }
      return false;
    };
    const hiddenContent = (node) => ["hidden", "collapse"].includes(style(node)?.visibility);
    if (noLayout(element)) return null;
    const ownedRows = Array.from(table.rows).filter((row) => !noLayout(row, false));
    const cells = ownedRows.map((row) => noLayout(row) ? [] : Array.from(row.cells).filter((cell) => !noLayout(cell)));
    const color = (node) => (style(node)?.color || "").match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)?.slice(1).map(Number);
    const defaultColor = color(table);
    const muted = (cell) => {
      const rgb = color(cell);
      return cell.tagName === "TD" && defaultColor && rgb && Math.max(...rgb) - Math.min(...rgb) <= 30 && Math.abs(rgb[0] - defaultColor[0]) >= 30 && rgb[0] > 45 && rgb[0] < 210;
    };
    const grid = ownedRows.map(() => []);
    const physicalRows = ownedRows.map(() => []);
    const remainingRows = [];
    let groupEnd = ownedRows.length;
    for (let index = ownedRows.length - 1; index >= 0; index--) {
      if (ownedRows[index + 1]?.parentElement !== ownedRows[index].parentElement) groupEnd = index + 1;
      remainingRows[index] = groupEnd - index;
    }
    for (const [rowIndex, row] of ownedRows.entries()) {
      let column = 0;
      for (const cell of cells[rowIndex]) {
        const width = cell.colSpan;
        const remaining = remainingRows[rowIndex];
        const height = Math.min(cell.rowSpan || remaining, remaining);
        let free = 0;
        while (free < width) {
          if (grid[rowIndex][column + free]) {
            column += free + 1;
            free = 0;
          } else free++;
        }
        const visible = !hiddenContent(cell);
        const html = visible ? serializeReadingHtml(cell, excludedSelectors, referenceRoots) : "";
        const sourceCell = sourceCells.get(cell) || cell;
        const id2 = visible && sourceCell.id && sourceCell.ownerDocument.getElementById(sourceCell.id) === sourceCell ? sourceCell.id : "";
        const headers = sourceCell.getAttribute("headers");
        const scope = cell.tagName === "TH" ? cell.scope : "";
        physicalRows[rowIndex].push({
          column,
          rowSpan: height,
          colSpan: width,
          header: cell.tagName === "TH",
          ...muted(cell) ? { muted: true } : {},
          ...["row", "col", "rowgroup", "colgroup"].includes(scope) ? { scope } : {},
          ...id2 ? { id: id2 } : {},
          ...headers !== null ? { headerIds: headers.split(/[\t\n\f\r ]+/).filter(Boolean) } : {}
        });
        let repeated = html;
        if (width * height > 1 && html) {
          const template = element.ownerDocument.createElement("template");
          template.innerHTML = html;
          for (const target of Array.from(template.content.querySelectorAll("[id], [name]"))) {
            target.removeAttribute("id");
            target.removeAttribute("name");
          }
          repeated = template.innerHTML;
        }
        for (let down = 0; down < height; down++) {
          for (let across = 0; across < width; across++) {
            grid[rowIndex + down][column + across] = { html: down || across ? repeated : html, visible };
          }
        }
        column += width;
      }
    }
    const columns = grid.reduce((width, row) => Math.max(width, row.length), 0);
    if (!columns) return null;
    const visibleRows = ownedRows.map((row, index) => ({ row, index })).filter(({ row, index }) => !noLayout(row) && (grid[index].some((cell) => cell.visible) || !row.cells.length && !hiddenContent(row)));
    if (!visibleRows.length) return null;
    const firstCells = cells[visibleRows[0].index];
    const hasHeaders = firstCells.length > 0 && firstCells.every((cell) => cell.tagName === "TH");
    const rows = visibleRows.map(({ index }) => Array.from({ length: columns }, (_, column) => grid[index][column]?.html || ""));
    const layoutRows = visibleRows.map(({ row, index }, visibleIndex) => ({
      group: row.parentElement?.tagName === "THEAD" ? "head" : row.parentElement?.tagName === "TFOOT" ? "foot" : "body",
      ...visibleIndex === 0 || visibleRows[visibleIndex - 1].row.parentElement !== row.parentElement ? { groupStart: true } : {},
      cells: physicalRows[index].map((cell) => ({
        ...cell,
        rowSpan: visibleRows.filter((entry) => entry.index >= index && entry.index < index + cell.rowSpan).length
      }))
    }));
    const headingIds = new Set(layoutRows.flatMap((row) => row.cells.filter((cell) => cell.header && cell.id).map((cell) => cell.id)));
    for (const row of layoutRows) for (const cell of row.cells) {
      if (cell.headerIds) cell.headerIds = [...new Set(cell.headerIds.filter((id2) => headingIds.has(id2) && id2 !== cell.id))];
    }
    const columnGroups = [];
    let unassignedColumns = columns;
    const groups = (
      /** @type {HTMLTableColElement[]} */
      Array.from(table.children).filter((child) => child.tagName === "COLGROUP")
    );
    for (const group of groups) {
      if (!unassignedColumns) break;
      const cols = (
        /** @type {HTMLTableColElement[]} */
        Array.from(group.children).filter((child) => child.tagName === "COL")
      );
      const span = cols.length ? cols.reduce((count, col) => count + col.span, 0) : group.span;
      const assigned = Math.min(span, unassignedColumns);
      columnGroups.push(assigned);
      unassignedColumns -= assigned;
    }
    const sourceTable = sourceCells.get(table) || table;
    const id = sourceTable.id && sourceTable.ownerDocument.getElementById(sourceTable.id) === sourceTable ? sourceTable.id : "";
    return {
      type: "table",
      cellFormat: "html",
      hasHeaders,
      layoutRows,
      ...id ? { id } : {},
      ...columnGroups.length ? { columnGroups } : {},
      ...hasHeaders ? { headers: rows[0] } : {},
      rows: hasHeaders ? rows.slice(1) : rows
    };
  }
  function handleDiv(element, state, constants) {
    const preserveRoot = state.explicitFlowRoots?.has(element) === true;
    if (element.closest("blockquote")) return null;
    const table = element.closest("table");
    if (table && !isLayoutTable(table) && isReadingOwned(table, state.referenceRoots)) return null;
    const figure = element.closest("figure");
    if (figure && !element.closest("figcaption") && hasFigureBodyText(figure)) {
      const clone = cloneFigureText(element);
      if (!clone.textContent?.trim()) return null;
      const original = getOriginalTextIfTranslated(element);
      const html = original ? encodeOriginalText(element, original) : serializeReadingHtml(clone, state.selectionExclusions, state.referenceRoots, preserveRoot);
      return html ? { type: "paragraph", text: html, html } : null;
    }
    const text = (element.textContent || "").trim();
    if (element === state.standfirstElement) return null;
    const readingOwned = isReadingOwned(element, state.referenceRoots);
    if (!text || !readingOwned && text.length < 10) return null;
    const className = semanticClassNames(element);
    const id = (element.id || "").toLowerCase();
    if (/(?:^|[\s_-])(?:nav|button|icon|menu|sidebar|widget|modal|popup|tooltip)(?:$|[\s_-])/.test(`${className} ${id}`)) {
      return null;
    }
    if (className.includes("jw-") || className.includes("video-player") || className.includes("player") || className.includes("shortcuts") || id.includes("video") || id.includes("player")) {
      return null;
    }
    const lowerText = text.toLowerCase();
    if (/^(?:volume|shortcut|caption|fullscreen|mute|unmute|play|pause)$/i.test(text) || /^\d+\s+of\s+\d+\s+(?:minute|second|hour)s?$/i.test(text)) {
      return null;
    }
    if (element.querySelector("input, select, textarea") || !readingOwned && element.querySelector('button, a[role="button"]')) {
      return null;
    }
    if (!readingOwned && isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
      return null;
    }
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 15);
    if (!readingOwned && sentences.length < 1) return null;
    if (!readingOwned && lowerText.startsWith("by ") && text.length < 150) return null;
    if (!readingOwned && lowerText.startsWith("edited by") && text.length < 150) return null;
    if (!readingOwned && /^\d+\s+words?$/i.test(text)) return null;
    if (!readingOwned && /^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;
    if (!readingOwned && lowerText.includes("newsletter") && lowerText.includes("subscribe")) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("create an account to read") || lowerText.includes("member-only story") || lowerText.includes("sign up to read") || lowerText.includes("subscribe to read") || lowerText.includes("to read the full story") || lowerText.includes("sign up") && lowerText.includes("read") || lowerText.includes("subscribe") && lowerText.includes("read"))) {
      return null;
    }
    if (!readingOwned && lowerText.includes("donate") && (lowerText.includes("support") || lowerText.includes("mission"))) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("advertisement") || lowerText.includes("advertising") || lowerText.includes("scroll to continue") || lowerText.includes("continue reading"))) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("reporting by") || lowerText.includes("reported by")) && (lowerText.includes("editing by") || lowerText.includes("edited by"))) {
      return null;
    }
    if (!readingOwned && (lowerText.includes("item ") && lowerText.includes(" of ") && /\d+ of \d+/.test(text) || lowerText.includes("reuters/") || lowerText.includes("associated press") || lowerText.includes("photo by") || lowerText.includes("caption:"))) {
      return null;
    }
    const originalText = getOriginalTextIfTranslated(element);
    let finalText = originalText ? encodeOriginalText(element, originalText) : serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots, preserveRoot);
    if (preserveRoot && !finalText) return null;
    if (element.tagName === "DT") finalText = `<strong>${finalText}</strong>`;
    return {
      type: "paragraph",
      text: finalText,
      html: finalText,
      ...element.id ? { id: element.id } : {}
    };
  }

  // scripts/extraction/extractor/selectors.js
  function selectorValues(value) {
    return (Array.isArray(value) ? value : [value]).filter((item) => typeof item === "string" && item.trim());
  }
  function resolveContentSelection(doc, selectors) {
    try {
      for (const name of ["articleContainer", "content", "title", "subtitle", "heroImage", "toc", "exclude"]) {
        for (const selector of selectorValues(selectors[name])) doc.querySelector(selector);
      }
    } catch (error) {
      if (error?.name === "SyntaxError") return { matched: false, containers: [], roots: [], elements: [], exclusions: [], tocRoots: [] };
      throw error;
    }
    const containers = selectorValues(selectors.articleContainer).flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
    if (selectorValues(selectors.articleContainer).length && !containers.length) {
      return { matched: false, containers: [], roots: [], elements: [], exclusions: [], tocRoots: [] };
    }
    const scopes = containers.length ? containers : [doc];
    const queries = selectorValues(selectors.content);
    const roots = /* @__PURE__ */ new Set();
    for (const scope of scopes) {
      if (!queries.length && scope.nodeType === 1) roots.add(scope);
      for (const selector of queries) {
        if (scope.nodeType === 1 && scope.matches(selector)) roots.add(scope);
        for (const node of Array.from(scope.querySelectorAll(selector))) roots.add(node);
      }
    }
    const rootsList = [...roots];
    const editorialContainers = containers.filter(isEditorialOwner);
    const hasBodyWrapper = rootsList.some((root) => root.matches("div,section,article") && root.querySelector("p,blockquote,pre,table,ul,ol"));
    const exclusions = [...new Set(selectorValues(selectors.exclude).flatMap((selector) => Array.from(doc.querySelectorAll(selector))))].filter((node) => {
      if (containers.some((container) => node.contains(container))) return false;
      return !(hasBodyWrapper && !node.closest(INTERFACE_REGIONS) && editorialContainers.some((container) => container.contains(node)) && rootsList.every((root) => node !== root && node.contains(root)));
    });
    const elements = /* @__PURE__ */ new Set();
    for (const root of roots) {
      if (root.matches(CANDIDATE_SELECTOR)) elements.add(root);
      for (const node of Array.from(root.querySelectorAll(CANDIDATE_SELECTOR))) elements.add(node);
    }
    const tocRoots = selectorValues(selectors.toc).flatMap((selector) => containers.flatMap((container) => [...container.querySelectorAll(selector)])).filter((node) => !isSelectedContentExcluded(node, exclusions));
    return { matched: roots.size > 0, containers: [...new Set(containers)], roots: rootsList, elements: [...elements], exclusions, tocRoots };
  }
  function isSelectedContentExcluded(element, exclusions) {
    return exclusions.some((node) => {
      if (!node.contains(element)) return false;
      if (node === element && node.matches("blockquote.twitter-tweet") && node.textContent?.trim()) return false;
      return true;
    });
  }
  function findSelectedTextElement(doc, value, exclusions = []) {
    for (const selector of selectorValues(value)) {
      const node = doc.querySelector(selector);
      if (node && readArticleMetadataText(node, exclusions)) return node;
    }
    return null;
  }

  // scripts/extraction/extractor/fallbacks.js
  function findSocialReadingRoot(baseUrl, doc) {
    let hostname;
    try {
      hostname = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (!["x.com", "twitter.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
    const readView = doc.querySelector('div[data-testid="twitterArticleReadView"]');
    if (readView) return readView;
    const article = doc.querySelector('article[data-testid="tweet"]');
    return article?.querySelector('div[data-testid="tweetText"]') || article;
  }
  function findFallbackReadingRoots(win, doc, constants, attempted = []) {
    const seen = new Set(attempted);
    const roots = [];
    const excluded2 = (element) => isExcluded(win, element, constants, isSemanticReadingScope(element) ? [element] : []);
    const admit = (element) => {
      if (!element || seen.has(element) || excluded2(element) || isWidget(win, element)) return;
      seen.add(element);
      roots.push(element);
    };
    for (const element of Array.from(doc.querySelectorAll('article,main,[role~="article"],[role~="main"],[itemprop~="articleBody"]'))) admit(element);
    let best = null;
    let bestParagraphs = 0;
    let bestLength = 0;
    for (const element of Array.from(doc.querySelectorAll("div, section, article, main"))) {
      if (seen.has(element) || excluded2(element) || isWidget(win, element)) continue;
      const paragraphs = element.querySelectorAll("p").length;
      const length = element.textContent?.length || 0;
      if (paragraphs > bestParagraphs || paragraphs === bestParagraphs && length > bestLength) {
        best = element;
        bestParagraphs = paragraphs;
        bestLength = length;
      }
    }
    if (bestParagraphs >= 3) admit(best);
    admit(doc.body);
    return roots;
  }

  // scripts/extraction/extractor/index.js
  async function runExtraction(baseUrl, enableDebugInfo = false, selectors = null) {
    const extractionDeadline = Date.now() + CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT;
    const win = window;
    const doc = document;
    const requestedUrl = new URL(baseUrl || win.location.href);
    const currentUrl = new URL(win.location.href);
    requestedUrl.hash = currentUrl.hash = "";
    if (requestedUrl.href !== currentUrl.href) throw new Error("The page changed before extraction started.");
    const debugInfo = enableDebugInfo ? createDebugInfo(win, doc, baseUrl) : null;
    if (enableDebugInfo) {
      logExtractionStart(baseUrl, enableDebugInfo);
      logHtmlState(doc);
    }
    try {
      try {
        if (!selectors) await waitForContentLoad(doc);
      } catch (e) {
        pushDebugLog(debugInfo, "WAIT_FOR_CONTENT_SKIPPED", { error: String(e) });
      }
      const googleTranslateState = detectGoogleTranslateState(doc);
      const firstParagraphCheck = checkFirstParagraph(doc);
      if (debugInfo) {
        debugInfo.googleTranslateState = googleTranslateState;
        debugInfo.firstParagraphCheck = firstParagraphCheck;
        pushDebugLog(debugInfo, "GOOGLE_TRANSLATE_STATE", googleTranslateState);
      }
      const constants = {
        EXCLUDED_CLASSES: CONSTANTS.EXCLUDED_CLASSES,
        PAYWALL_CLASSES: CONSTANTS.PAYWALL_CLASSES,
        NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS,
        NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH,
        COURSE_AD_PATTERNS: CONSTANTS.COURSE_AD_PATTERNS,
        PAYWALL_PATTERNS: CONSTANTS.PAYWALL_PATTERNS,
        LOGO_PATTERNS: CONSTANTS.LOGO_PATTERNS
      };
      let titleElement = findArticleTitleElement(doc);
      let selectedTitleElement = null;
      const metadata = extractMetadata(doc, baseUrl, titleElement);
      const selection = selectors ? resolveContentSelection(doc, selectors) : null;
      const editorialScopes = selection?.containers.filter(isEditorialOwner) || [];
      const editorialScope = editorialScopes.length === 1 ? editorialScopes[0] : null;
      let selectorRecovered = false;
      if (selectors) {
        if (!selection.matched && !editorialScope) return { ...metadata, content: [], selectorMatched: false, debugInfo };
        const selectedTitle = findSelectedTextElement(doc, selectors.title, selection.exclusions);
        selectorRecovered = !selection.matched && !!selectedTitle && editorialScope?.contains(selectedTitle) === true;
        if (!selection.matched && !selectorRecovered) return { ...metadata, content: [], selectorMatched: false, debugInfo };
        if (selectedTitle) {
          metadata.title = readArticleMetadataText(selectedTitle, selection.exclusions);
          const heading = selectedTitle.closest("h1,h2,h3,h4,h5,h6");
          const headingTitle = heading ? readArticleMetadataText(heading, selection.exclusions) : "";
          titleElement = heading && normalizeHeadingForDedup(headingTitle) === normalizeHeadingForDedup(metadata.title) ? heading : selectedTitle;
          selectedTitleElement = titleElement;
        }
      }
      const language = (doc.documentElement.lang || "").trim().toLowerCase().split(/[-_]/)[0];
      const detectedLanguage = /^[a-z]{2,3}$/.test(language) ? language === "ua" ? "uk" : language : void 0;
      const mainTitleText = normalizeHeadingForDedup(metadata.title);
      pushDebugLog(debugInfo, "METADATA_EXTRACTED", metadata);
      const socialRoot = selectors ? null : findSocialReadingRoot(baseUrl, doc);
      const primaryRoot = (selectorRecovered ? editorialScope : selection?.roots[0]) || socialRoot || findMainContent(win, doc, (el) => isExcluded(win, el, constants, isSemanticReadingScope(el) ? [el] : []));
      const extractReadingRoots = async (bodyRoots) => {
        const mainContent = bodyRoots[0];
        const bodyTitle = readLeadingDeclaredTitle(mainContent, titleElement, mainTitleText, selection?.exclusions);
        const selectedHeroes = selectorValues(selectors?.heroImage).flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
        const media = discoverReadingMedia(bodyRoots, selectedHeroes);
        const selectedSubtitle = selectorValues(selectors?.subtitle).flatMap((selector) => Array.from(doc.querySelectorAll(selector))).find((element) => !isSelectedContentExcluded(element, selection.exclusions));
        const standfirst = selection ? { element: selectedSubtitle || null, text: selectedSubtitle ? readArticleMetadataText(selectedSubtitle) : null } : extractStandfirst(mainContent);
        const readingRoots = [.../* @__PURE__ */ new Set([...bodyRoots, ...media.roots, ...standfirst.element ? [standfirst.element] : []])];
        const recommendationRegions = bodyRoots.flatMap(findRecommendationRegions);
        const publisherIgnores = bodyRoots.flatMap((root) => Array.from(root.querySelectorAll(".instapaper_body .instapaper_ignore")));
        const interfaceRegions = bodyRoots.flatMap(findPublisherFormRegions).concat(recommendationRegions, publisherIgnores);
        const explicitFlowRoots = selection ? collectExplicitFlowRoots(bodyRoots) : void 0;
        const state = {
          processedImages: /* @__PURE__ */ new Set(),
          addedHeadings: /* @__PURE__ */ new Set(),
          mainTitleText,
          titleElement,
          selectedTitleElement: bodyTitle || selectedTitleElement,
          standfirstElement: standfirst.element,
          standfirstText: standfirst.text,
          content: [],
          selectionExclusions: [...selection?.exclusions || [], ...interfaceRegions],
          explicitFlowRoots,
          referenceRoots: readingRoots,
          tocRoots: selection?.tocRoots,
          featuredMediaRoots: media.featuredRoots,
          selectedIllustrations: media.selectedIllustrations,
          extractionDeadline,
          debugInfo
        };
        const allElements = [.../* @__PURE__ */ new Set([
          ...readingRoots.flatMap((root) => collectCandidateElements(root)),
          ...explicitFlowRoots || [],
          ...standfirst.element ? [standfirst.element] : []
        ])].filter((element) => (!selection || !isSelectedContentExcluded(element, selection.exclusions)) && !isSourceExcluded(element, interfaceRegions));
        const filteredElements = filterCandidateElements(win, allElements, constants, debugInfo, readingRoots, state.tocRoots, media.selectedIllustrations);
        const sortedElements = sortElementsInDomOrder(filteredElements);
        if (debugInfo) {
          debugInfo.foundElements = allElements.length;
          debugInfo.filteredElements = filteredElements.length;
        }
        pushDebugLog(debugInfo, "READING_ROOTS_FOUND", {
          bodyRoots: bodyRoots.length,
          mediaRoots: media.roots.length,
          candidates: sortedElements.length
        });
        state.readingGraphics = await captureReadingGraphics(win, sortedElements, state, constants);
        const content2 = parseElements(win, sortedElements, state, constants, baseUrl);
        const hasReadingContent2 = content2.some((item) => !["heading", "separator"].includes(item.type));
        if (hasReadingContent2 && !selection && !content2.some((item) => item.type === "image") && !hasSourceReadingMedia(readingRoots, constants.LOGO_PATTERNS)) {
          const image = extractMetadataImage(doc, baseUrl, constants.LOGO_PATTERNS);
          if (image) content2.unshift({ type: "image", ...image, isFeatured: true });
        }
        return { content: content2, hasReadingContent: hasReadingContent2, bodyTitle };
      };
      let attempt = primaryRoot ? await extractReadingRoots(selection?.matched ? selection.roots : [primaryRoot]) : null;
      if (selectorRecovered && !attempt?.content.some(hasArticleBodyContent)) attempt = null;
      if (selection?.roots.length && selection.roots.every((root) => !isSelectedContentExcluded(root, selection.exclusions) && isMediaOnlySelectionRoot(root))) {
        if (editorialScope && !selection.roots.includes(editorialScope)) {
          const wider = await extractReadingRoots(editorialScopes);
          if (wider.content.some(hasArticleBodyContent)) {
            attempt = wider;
            selectorRecovered = true;
          }
        }
      }
      if (!selection && !attempt?.hasReadingContent && !isEditorialOwner(primaryRoot)) {
        for (const root of findFallbackReadingRoots(win, doc, constants, primaryRoot ? [primaryRoot] : [])) {
          pushDebugLog(debugInfo, "FALLBACK_READING_ROOT", { tagName: root.tagName, className: root.className });
          const alternative = await extractReadingRoots([root]);
          if (alternative.hasReadingContent) {
            attempt = alternative;
            break;
          }
          if (!attempt?.content.length) attempt = alternative;
        }
      }
      const content = attempt?.hasReadingContent ? attempt.content : [];
      const titleFragmentIds = content.length && metadata.title ? [...new Set(
        [titleElement, attempt?.bodyTitle].flatMap((element) => readTitleFragmentIds(element, mainTitleText, selection?.exclusions))
      )] : [];
      if (debugInfo) {
        const contentTypes = {};
        for (const item of content) {
          contentTypes[item.type] = (contentTypes[item.type] || 0) + 1;
        }
        debugInfo.contentTypes = contentTypes;
      }
      pushDebugLog(debugInfo, "EXTRACTION_COMPLETE", { itemCount: content.length });
      return {
        title: metadata.title,
        ...titleFragmentIds.length ? { titleFragmentIds } : {},
        author: metadata.author,
        publishDate: metadata.publishDate,
        detectedLanguage,
        ...selection ? { selectorMatched: content.length > 0 } : {},
        ...selectorRecovered && content.length ? { selectorRecovered: true } : {},
        content,
        debugInfo
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      pushDebugLog(debugInfo, "EXTRACTION_ERROR", {
        message: err.message,
        stack: err.stack
      });
      return {
        title: doc.title || "",
        author: "",
        publishDate: "",
        content: [],
        debugInfo,
        error: err.message,
        errorStack: err.stack
      };
    }
  }
  function hasArticleBodyContent(item) {
    return !item.isFeatured && !item.isStandfirst && !["heading", "separator", "subtitle", "image"].includes(item.type);
  }
  function isMediaOnlySelectionRoot(root) {
    const media = "figure,figcaption,picture,img,video,audio,iframe,svg,canvas";
    if (root.matches(media)) return true;
    if (!root.querySelector(media)) return false;
    const copy = root.cloneNode(true);
    if (!(copy instanceof root.ownerDocument.defaultView.Element)) return false;
    for (const child of copy.querySelectorAll(media)) child.remove();
    return !copy.textContent?.trim();
  }
  function readLeadingDeclaredTitle(root, outerTitle, titleText, exclusions) {
    if (!root || !outerTitle || !titleText || root.contains(outerTitle)) return null;
    for (let owner = root; owner?.matches("article,main,section,div,header"); owner = owner.firstElementChild) {
      const heading = owner.firstElementChild;
      if (!heading) break;
      for (let node = owner.firstChild; node && node !== heading; node = node.nextSibling) {
        if (node.nodeType === 3 && node.textContent?.trim()) return null;
      }
      if (!heading.matches("h1,h2,h3,h4,h5,h6")) continue;
      return heading.matches('[itemprop~="headline"],[data-type="document-title"]') && normalizeHeadingForDedup(readArticleMetadataText(heading, exclusions)) === titleText ? heading : null;
    }
    return null;
  }
  function readTitleFragmentIds(element, titleText, exclusions) {
    if (!element || isSourceExcluded(element, exclusions)) return [];
    const heading = element.closest("h1");
    if (heading && heading !== element && normalizeHeadingForDedup(readArticleMetadataText(heading)) === titleText) element = heading;
    return readSourceFragmentIds(element, exclusions);
  }
  return __toCommonJS(extractor_entry_exports);
})();

return clipaibleArticleExtractor.runExtraction(baseUrl, enableDebugInfo, selectors);
}
