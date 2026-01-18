// @ts-check
// Universal TOC (Table of Contents) builder for all formats
// This module provides a unified algorithm for building nested TOC structures

/**
 * Build nested TOC structure from headings
 * Returns a structure that can be rendered in different formats
 * @param {Array<{text: string, level: number, id?: string}>} headings - Array of headings with level and text
 * @returns {{minLevel: number, items: Array<{text: string, level: number, id?: string, children?: Array}>}}
 */
export function buildTocStructure(headings) {
  if (!headings || headings.length === 0) {
    return { minLevel: 1, items: [] };
  }

  const minLevel = Math.min(...headings.map(h => h.level));
  
  // Build nested structure using stack-based approach
  const root = { items: [] };
  const stack = [{ level: minLevel - 1, items: root.items }]; // Stack of parent containers

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const level = heading.level;
    
    // Pop stack until we find the correct parent level
    // Parent level must be less than current level
    // CRITICAL: We pop until we find a parent with level < current level
    const popsBefore = stack.length;
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const popsAfter = stack.length;
    
    // Create item for this heading
    const item = {
      text: heading.text,
      level: heading.level,
      id: heading.id,
      children: []
    };
    
    // Add to current parent (top of stack)
    const parent = stack[stack.length - 1];
    parent.items.push(item);
    
    // Push this item onto stack as potential parent for next items
    // Always push, regardless of level (up to 6)
    // This ensures proper nesting for all heading levels
    if (level < 6) {
      stack.push({ level, items: item.children });
    }
  }
  
  // Clean up empty children arrays
  function cleanEmptyChildren(items) {
    for (const item of items) {
      if (item.children && item.children.length === 0) {
        delete item.children;
      } else if (item.children) {
        cleanEmptyChildren(item.children);
      }
    }
  }
  
  cleanEmptyChildren(root.items);
  
  return { minLevel, items: root.items };
}

/**
 * Render TOC as HTML nested lists (for PDF/EPUB)
 * @param {Array<{text: string, level: number, id?: string, children?: Array}>} items - TOC items
 * @param {function(string): string} escapeHtml - Function to escape HTML
 * @param {function(string): string} escapeAttr - Function to escape attributes
 * @param {string} listTag - HTML tag for list ('ul' or 'ol')
 * @param {string} listClass - CSS class for list
 * @param {function(string, string): string} linkFormatter - Function to format links (id, text) -> HTML
 * @returns {string} HTML string
 */
export function renderTocAsHtml(items, escapeHtml, escapeAttr, listTag = 'ul', listClass = 'toc-list', linkFormatter = null) {
  if (!items || items.length === 0) return '';
  
  const defaultLinkFormatter = (id, text) => {
    if (id) {
      return `<a href="#${escapeAttr(id)}">${escapeHtml(text)}</a>`;
    }
    return escapeHtml(text);
  };
  
  const formatter = linkFormatter || defaultLinkFormatter;
  
  function renderItems(items, indent = '') {
    let html = `${indent}<${listTag}${listClass ? ` class="${escapeAttr(listClass)}"` : ''}>\n`;
    
    for (const item of items) {
      const hasChildren = item.children && item.children.length > 0;
      const linkHtml = formatter(item.id || '', item.text);
      
      if (hasChildren) {
        html += `${indent}  <li>${linkHtml}\n`;
        html += renderItems(item.children, indent + '    ');
        html += `${indent}  </li>\n`;
      } else {
        html += `${indent}  <li>${linkHtml}</li>\n`;
      }
    }
    
    html += `${indent}</${listTag}>\n`;
    return html;
  }
  
  return renderItems(items, '').trim();
}

/**
 * Render TOC as Markdown nested list
 * @param {Array<{text: string, level: number, id?: string, children?: Array}>} items - TOC items
 * @param {number} minLevel - Minimum heading level
 * @returns {string} Markdown string
 */
export function renderTocAsMarkdown(items, minLevel) {
  if (!items || items.length === 0) return '';
  
  function renderItems(items, baseIndent = 0) {
    let markdown = '';
    
    for (const item of items) {
      const indent = '  '.repeat(baseIndent);
      const hasChildren = item.children && item.children.length > 0;
      
      if (hasChildren) {
        markdown += `${indent}- ${item.text}\n`;
        markdown += renderItems(item.children, baseIndent + 1);
      } else {
        markdown += `${indent}- ${item.text}\n`;
      }
    }
    
    return markdown;
  }
  
  return renderItems(items).trim();
}

/**
 * Render TOC as FB2 XML with proper hierarchical structure
 * CRITICAL: Uses simple paragraphs with indentation, NOT nested sections
 * Nested sections in TOC cause each item to appear on a new page in FB2 readers
 * @param {Array<{text: string, level: number, id?: string, children?: Array}>} items - TOC items
 * @param {function(string): string} escapeXml - Function to escape XML
 * @returns {string} FB2 XML string
 */
export function renderTocAsFb2(items, escapeXml) {
  if (!items || items.length === 0) return '';
  
  function renderItems(items, baseIndent = 0) {
    let xml = '';
    // Use non-breaking spaces (&#160;) for indentation - more reliable than regular spaces
    // Each level uses 3 non-breaking spaces for visible indentation
    const indentStr = '&#160;&#160;&#160;'.repeat(baseIndent);
    
    for (const item of items) {
      const hasChildren = item.children && item.children.length > 0;
      const linkHref = item.id ? `#${escapeXml(item.id)}` : '';
      const bullet = '• ';
      
      // Use simple paragraph with non-breaking space indentation for hierarchy
      // NOT nested sections - that causes page breaks in FB2 readers
      // Non-breaking spaces are more likely to be preserved by readers
      if (linkHref) {
        xml += `      <p>${indentStr}${bullet}<a l:href="${linkHref}">${escapeXml(item.text)}</a></p>\n`;
      } else {
        xml += `      <p>${indentStr}${bullet}${escapeXml(item.text)}</p>\n`;
      }
      
      // Render children with increased indentation
      if (hasChildren) {
        xml += renderItems(item.children, baseIndent + 1);
      }
    }
    
    return xml;
  }
  
  return renderItems(items).trim();
}
