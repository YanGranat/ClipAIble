// DOCX generation module for ClipAIble extension
// DOCX is a ZIP archive with Office Open XML structure

import { log, logError } from '../utils/logging.js';
import { escapeAttr, stripHtml } from '../utils/html.js';
import { imageToBase64, processImagesInBatches } from '../utils/images.js';
import JSZip from '../../lib/jszip-wrapper.js';
import { PDF_LOCALIZATION, formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES } from '../state/processing.js';

/**
 * Generate DOCX file from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
 */
export async function generateDocx(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'auto', apiKey, model
  } = data;
  
  log('=== DOCX GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc, sourceUrl: sourceUrl || 'EMPTY' });
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate DOCX');
  }
  
  if (updateState) updateState({ status: 'Building DOCX structure...', progress: 82 });
  
  const zip = new JSZip();
  
  // Generate unique identifier for the document
  const docId = generateUUID();
  const langCode = language === 'auto' ? 'en' : language;
  const safeTitle = title || 'Article';
  const safeAuthor = author || 'Unknown';
  
  // Format ISO date to readable format before translation
  let translatedDate = formatDateForDisplay(publishDate, langCode) || new Date().toLocaleDateString();
  
  // Translate date if language is not auto and API key is available
  if (language !== 'auto' && apiKey && translatedDate) {
    try {
      const translated = await translateMetadata(translatedDate, language, apiKey, model, 'date');
      if (translated) translatedDate = translated;
    } catch (error) {
      log('Failed to translate date, using formatted original', error);
    }
  }
  
  // Collect headings for TOC
  const headings = [];
  content.forEach((item, index) => {
    if (item.type === 'heading' && item.level >= 2) {
      const text = stripHtml(item.text || '');
      if (text) {
        const originalId = item.id || `heading-${index}`;
        headings.push({ text, level: item.level, id: originalId });
      }
    }
  });
  
  // Embed images FIRST (sets _docxSrc on items)
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, status: loadingStatus, progress: 85 });
  }
  const imageManifest = await embedDocxImages(zip, content, updateState);
  
  // Generate main document XML
  if (updateState) updateState({ status: 'Converting content...', progress: 90 });
  const documentXml = generateDocumentXml(content, safeTitle, safeAuthor, translatedDate, sourceUrl, headings, language, generateAbstract, abstract, generateToc, imageManifest);
  
  // Log hyperlink section for debugging
  const hyperlinkMatch = documentXml.match(/<w:hyperlink[^>]*>[\s\S]*?<\/w:hyperlink>/);
  if (hyperlinkMatch) {
    log('Hyperlink found in document.xml', { hyperlinkXml: hyperlinkMatch[0].substring(0, 200) });
  } else {
    log('WARNING: No hyperlink found in document.xml', { 
      hasSourceUrl: !!sourceUrl, 
      sourceUrl, 
      documentXmlLength: documentXml.length,
      metadataSection: documentXml.substring(documentXml.indexOf('<w:p>'), documentXml.indexOf('</w:p>') + 6).substring(0, 500)
    });
  }
  
  zip.file('word/document.xml', documentXml);
  
  // Generate document relationships
  const documentRelsXml = generateDocumentRelsXml(imageManifest, sourceUrl);
  
  // Log relationship section for debugging
  const relationshipMatch = documentRelsXml.match(/<Relationship[^>]*Id="rId1"[^>]*Type="[^"]*hyperlink"[^>]*>/);
  if (relationshipMatch) {
    log('Relationship rId1 (hyperlink) found in document.xml.rels', { relationshipXml: relationshipMatch[0] });
  } else {
    log('WARNING: No relationship rId1 (hyperlink) found in document.xml.rels', { 
      hasSourceUrl: !!sourceUrl, 
      sourceUrl,
      documentRelsXml 
    });
  }
  
  zip.file('word/_rels/document.xml.rels', documentRelsXml);
  
  // Generate styles
  zip.file('word/styles.xml', generateStylesXml());
  
  // Generate main relationships
  zip.file('_rels/.rels', generateMainRelsXml());
  
  // Generate content types
  zip.file('[Content_Types].xml', generateContentTypesXml(imageManifest));
  
  // Generate app properties (optional but recommended)
  zip.file('docProps/app.xml', generateAppXml());
  
  // Generate core properties
  zip.file('docProps/core.xml', generateCoreXml(safeTitle, safeAuthor, translatedDate));
  
  if (updateState) updateState({ status: 'Creating DOCX file...', progress: 95 });
  
  // Generate the ZIP file as ArrayBuffer (better for Service Worker)
  log('Generating ZIP...');
  const zipArrayBuffer = await zip.generateAsync({ 
    type: 'arraybuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  
  log('ZIP generated', { size: zipArrayBuffer.byteLength });
  
  // Generate safe filename
  const safeFilename = (safeTitle || 'article')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  const filename = `${safeFilename}.docx`;
  
  // Create blob from ArrayBuffer
  const blob = new Blob([zipArrayBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
  });
  
  // Download using object URL (preferred method)
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);
  
  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
      const downloadId = await chrome.downloads.download({
        url: objectUrl,
        filename: filename,
        saveAs: true
      });
      log('DOCX download started', { downloadId, filename, size: zipArrayBuffer.byteLength });
    } catch (error) {
      logError('Failed to download DOCX with object URL', error);
      // Fallback to data URL if object URL fails
      throw error;
    } finally {
      // Revoke URL immediately - Chrome downloads API handles the download asynchronously
      // The URL is only needed to initiate the download, not to complete it
      urlApi.revokeObjectURL(objectUrl);
    }
  } else {
    // Fallback: Convert ArrayBuffer to base64 data URL
    // This is needed for Service Worker environments where createObjectURL may not work
    // Use chunked conversion to avoid "Maximum call stack size exceeded" for large files
    const uint8Array = new Uint8Array(zipArrayBuffer);
    const chunkSize = 0x8000; // 32KB chunks
    let base64 = '';
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      base64 += String.fromCharCode.apply(null, chunk);
    }
    
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${btoa(base64)}`;
    
    try {
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      });
      log('Downloading DOCX (data URL fallback)...', { downloadId, filename, size: zipArrayBuffer.byteLength });
    } catch (error) {
      logError('Failed to download DOCX with data URL', error);
      throw error;
    }
  }
  
  log('=== DOCX GENERATION END ===');
  if (updateState) updateState({ status: 'Done!', progress: 100 });
}

/**
 * Embed images into DOCX ZIP and return manifest
 */
async function embedDocxImages(zip, content, updateState) {
  const images = [];
  let imageIndex = 0;
  
  // Collect all images from content
  function collectImages(items) {
    for (const item of items) {
      if (item.type === 'image' && item.src && !item.src.startsWith('data:image/svg')) {
        images.push({ ...item, _imageIndex: imageIndex++ });
      }
    }
  }
  
  collectImages(content);
  
  if (images.length === 0) {
    return [];
  }
  
  log('Embedding images into DOCX', { count: images.length });
  
  const manifest = [];
  
  // Process images in batches
  await processImagesInBatches(
    images,
    5, // concurrency
    updateState,
    async (img, index) => {
      try {
        const base64 = await imageToBase64(img.src);
        if (!base64) {
          log('Failed to convert image to base64', { src: img.src });
          return null;
        }
        
        // Determine image format from base64 or src
        let ext = 'png';
        let mimeType = 'image/png';
        if (base64.startsWith('data:image/')) {
          const match = base64.match(/data:image\/(\w+);base64/);
          if (match) {
            ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            mimeType = `image/${match[1]}`;
          }
        } else if (img.src.match(/\.(jpg|jpeg)$/i)) {
          ext = 'jpg';
          mimeType = 'image/jpeg';
        } else if (img.src.match(/\.gif$/i)) {
          ext = 'gif';
          mimeType = 'image/gif';
        } else if (img.src.match(/\.webp$/i)) {
          ext = 'webp';
          mimeType = 'image/webp';
        }
        
        const imageId = img._imageIndex + 1;
        const imagePath = `word/media/image${imageId}.${ext}`;
        const imageData = base64.split(',')[1] || base64;
        
        // Add to ZIP
        zip.file(imagePath, imageData, { base64: true });
        
        // Store relationship info
        img._docxSrc = `word/media/image${imageId}.${ext}`;
        // RelId will be assigned sequentially in generateDocumentRelsXml
        img._docxImageId = imageId;
        
        manifest.push({
          path: imagePath,
          imageId: imageId,
          mimeType: mimeType
        });
        
        return { img, success: true };
      } catch (error) {
        logError('Failed to embed image', { error: error.message, src: img.src });
        return { img, success: false, error: error.message };
      }
    }
  );
  
  log('Images embedded', { count: manifest.length });
  return manifest;
}

/**
 * Generate main document XML
 */
function generateDocumentXml(content, title, author, date, sourceUrl, headings, language, generateAbstract, abstract, generateToc, imageManifest) {
  log('generateDocumentXml called', { sourceUrl: sourceUrl || 'EMPTY', hasSourceUrl: !!sourceUrl });
  const langCode = language === 'auto' ? 'en' : language;
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
  
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>`;
  
  // Title - properly formatted with large, bold, centered text
  xml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="360"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="40"/>
          <w:szCs w:val="40"/>
        </w:rPr>
        <w:t>${escapeXml(title || 'Untitled')}</w:t>
      </w:r>
    </w:p>`;
  
  // Metadata
  if (author || date || sourceUrl) {
    xml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
      </w:pPr>`;
    
    if (author) {
      xml += `
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(l10n.author || 'Author')}:</w:t>
      </w:r>
      <w:r>
        <w:t xml:space="preserve"> ${escapeXml(author)}</w:t>
      </w:r>`;
    }
    
    if (date) {
      if (author) xml += `<w:r><w:t xml:space="preserve">  •  </w:t></w:r>`;
      xml += `
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(l10n.date || 'Date')}:</w:t>
      </w:r>
      <w:r>
        <w:t xml:space="preserve"> ${escapeXml(date)}</w:t>
      </w:r>`;
    }
    
    if (sourceUrl) {
      log('Adding source URL hyperlink to document', { sourceUrl, sourceUrlLength: sourceUrl.length });
      if (author || date) xml += `<w:r><w:t xml:space="preserve">  •  </w:t></w:r>`;
      xml += `
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(l10n.source || 'Source')}: </w:t>
      </w:r>
      <w:hyperlink r:id="rId1" w:history="1">
        <w:r>
          <w:rPr>
            <w:rStyle w:val="Hyperlink"/>
          </w:rPr>
          <w:t>${escapeXml(sourceUrl)}</w:t>
        </w:r>
      </w:hyperlink>`;
      log('Hyperlink XML added', { hyperlinkXml: `<w:hyperlink r:id="rId1" w:history="1">...</w:hyperlink>`, urlInText: sourceUrl });
    } else {
      log('WARNING: sourceUrl is falsy in generateDocumentXml', { sourceUrl, type: typeof sourceUrl });
    }
    
    xml += `
    </w:p>`;
  }
  
  // Abstract
  if (generateAbstract && abstract) {
    const abstractLabel = l10n.abstract || 'Abstract';
    xml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(abstractLabel)}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(abstract)}</w:t>
      </w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>`;
  }
  
  // Table of Contents
  if (generateToc && headings.length > 0) {
    const tocTitle = l10n.contents || 'Contents';
    xml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(tocTitle)}</w:t>
      </w:r>
    </w:p>`;
    
    for (const h of headings) {
      const indent = Math.max(0, h.level - 2);
      xml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:ind w:left="${indent * 360}"/>
      </w:pPr>
      <w:hyperlink w:anchor="${escapeXml(h.id)}" w:history="1">
        <w:r>
          <w:rPr>
            <w:rStyle w:val="Hyperlink"/>
          </w:rPr>
          <w:t>${escapeXml(h.text)}</w:t>
        </w:r>
      </w:hyperlink>
    </w:p>`;
    }
    
    xml += `
    <w:p><w:r><w:t></w:t></w:r></w:p>`;
  }
  
  // Content
  // Create a map of image index to relId for quick lookup
  // Note: imageIdOffset should match the offset used in generateDocumentRelsXml
  const imageRelIdMap = new Map();
  const imageIdOffset = sourceUrl ? 1 : 0; // Images start from rId2 (if sourceUrl uses rId1) or rId1 (if no sourceUrl)
  imageManifest.forEach((img, index) => {
    const relId = `rId${index + 1 + imageIdOffset}`;
    imageRelIdMap.set(img.imageId, relId);
  });
  
  for (const item of content) {
    xml += contentItemToDocx(item, imageRelIdMap);
  }
  
  xml += `
  </w:body>
</w:document>`;
  
  return xml;
}

/**
 * Convert content item to DOCX XML
 */
function contentItemToDocx(item, imageRelIdMap) {
  if (!item || !item.type) return '';
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const text = stripHtml(item.text || '');
      if (!text) return '';
      
      const headingStyle = level === 1 ? 'Heading1' : `Heading${level}`;
      const idAttr = item.id ? ` w:anchor="${escapeXml(item.id)}"` : '';
      
      return `
    <w:p${idAttr}>
      <w:pPr>
        <w:pStyle w:val="${headingStyle}"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>`;
    }
    
    case 'paragraph': {
      const text = stripHtml(item.text || '');
      if (!text.trim()) return '';
      
      // Convert basic HTML formatting
      const formattedText = convertHtmlToDocxRuns(text);
      
      return `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
      </w:pPr>
      ${formattedText}
    </w:p>`;
    }
    
    case 'image': {
      if (!item._docxImageId) return '';
      
      // Get relId from map
      const relId = imageRelIdMap.get(item._docxImageId);
      if (!relId) return '';
      
      const width = 5000000; // 5 inches in EMU (English Metric Units)
      const height = 3750000; // 3.75 inches (maintains 4:3 ratio)
      
      return `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${width}" cy="${height}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${item._docxImageId}" name="Picture ${item._docxImageId}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${item._docxImageId}" name="Picture ${item._docxImageId}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${relId}"/>
                    <a:stretch>
                      <a:fillRect/>
                    </a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${width}" cy="${height}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect">
                      <a:avLst/>
                    </a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = stripHtml(item.text || '');
      if (!text.trim()) return '';
      
      return `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Quote"/>
        <w:ind w:left="720" w:right="720"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>`;
    }
    
    case 'list': {
      const items = item.items || [];
      const isOrdered = item.ordered || false;
      let listXml = '';
      
      items.forEach((listItem, index) => {
        const itemText = typeof listItem === 'string' ? listItem : (listItem.html || listItem.text || '');
        const text = stripHtml(itemText);
        const numId = isOrdered ? 1 : 2; // Different numbering for ordered/unordered
        
        listXml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="ListParagraph"/>
        <w:numPr>
          <w:ilvl w:val="0"/>
          <w:numId w:val="${numId}"/>
        </w:numPr>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>`;
      });
      
      return listXml;
    }
    
    case 'code': {
      const code = stripHtml(item.text || item.code || '');
      
      return `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Code"/>
        <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
        <w:ind w:left="360" w:right="360"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>
          <w:sz w:val="20"/>
        </w:rPr>
        <w:t>${escapeXml(code)}</w:t>
      </w:r>
    </w:p>`;
    }
    
    case 'table': {
      return tableToDocx(item);
    }
    
    case 'separator':
    case 'hr': {
      return `
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/>
        </w:pBdr>
      </w:pPr>
      <w:r><w:t></w:t></w:r>
    </w:p>`;
    }
    
    default:
      if (item.text) {
        const text = stripHtml(item.text);
        return text ? `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
      </w:pPr>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>` : '';
      }
      return '';
  }
}

/**
 * Convert HTML to DOCX runs (basic formatting)
 */
function convertHtmlToDocxRuns(text) {
  // Simple conversion - just escape XML for now
  // Could be enhanced to support bold, italic, links, etc.
  return `<w:r><w:t>${escapeXml(text)}</w:t></w:r>`;
}

/**
 * Convert table to DOCX
 */
function tableToDocx(item) {
  if (!item.rows || !item.rows.length) return '';
  
  let xml = `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="2000"/>
        <w:gridCol w:w="2000"/>
      </w:tblGrid>`;
  
  // First row is header
  if (item.rows.length > 0) {
    xml += `
      <w:tr>`;
    for (const cell of item.rows[0]) {
      xml += `
        <w:tc>
          <w:tcPr>
            <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="TableHeading"/>
            </w:pPr>
            <w:r>
              <w:t>${escapeXml(stripHtml(cell))}</w:t>
            </w:r>
          </w:p>
        </w:tc>`;
    }
    xml += `
      </w:tr>`;
  }
  
  // Data rows
  for (let i = 1; i < item.rows.length; i++) {
    xml += `
      <w:tr>`;
    for (const cell of item.rows[i]) {
      xml += `
        <w:tc>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="TableBody"/>
            </w:pPr>
            <w:r>
              <w:t>${escapeXml(stripHtml(cell))}</w:t>
            </w:r>
          </w:p>
        </w:tc>`;
    }
    xml += `
      </w:tr>`;
  }
  
  xml += `
    </w:tbl>`;
  
  return xml;
}

/**
 * Generate document relationships XML
 */
function generateDocumentRelsXml(imageManifest, sourceUrl) {
  log('generateDocumentRelsXml called', { sourceUrl: sourceUrl || 'EMPTY', hasSourceUrl: !!sourceUrl, imageCount: imageManifest.length });
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  
  // Add source URL relationship FIRST - use rId1 for first relationship
  // External hyperlinks can use any numeric ID, but using rId1 is standard
  if (sourceUrl) {
    log('Adding hyperlink relationship', { sourceUrl, urlLength: sourceUrl.length });
    // For URL in Target attribute:
    // 1. URLs may already contain percent-encoded characters (e.g., %D0%91)
    // 2. We must escape XML special characters: & < > "
    // 3. BUT: if URL contains & that is NOT part of &amp; or other entity, escape it
    // 4. If URL already has &amp; (double-encoded), we should NOT escape it again
    // 5. Word expects the URL as-is, with only XML attribute escaping
    let escapedUrl = sourceUrl;
    
    // First, check if URL contains unescaped & that is not part of an entity
    // Replace & only if it's not followed by valid entity characters
    escapedUrl = escapedUrl.replace(/&(?![a-zA-Z0-9#]{1,8};)/g, '&amp;');
    
    // Then escape other XML special characters
    escapedUrl = escapedUrl
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    log('URL escaping', { original: sourceUrl, escaped: escapedUrl, originalLength: sourceUrl.length, escapedLength: escapedUrl.length });
    
    xml += `
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapedUrl}" TargetMode="External"/>`;
  }
  
  // Images use IDs starting from rId2 (if sourceUrl exists) or rId1 (if not)
  const imageIdOffset = sourceUrl ? 1 : 0;
  for (let i = 0; i < imageManifest.length; i++) {
    const img = imageManifest[i];
    // Use sequential IDs: rId2, rId3, rId4... (if sourceUrl) or rId1, rId2... (if not)
    const relId = `rId${i + 1 + imageIdOffset}`;
    // Store relId back in manifest for use in contentItemToDocx
    img.relId = relId;
    xml += `
  <Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.path}"/>`;
  }
  
  xml += `
</Relationships>`;
  
  log('Complete document.xml.rels XML', { xml, xmlLength: xml.length });
  
  return xml;
}

/**
 * Generate main relationships XML
 */
function generateMainRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

/**
 * Generate content types XML
 */
function generateContentTypesXml(imageManifest) {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`;
  
  // Add image content types
  const imageTypes = new Set();
  for (const img of imageManifest) {
    imageTypes.add(img.mimeType);
  }
  
  for (const mimeType of imageTypes) {
    const ext = mimeType === 'image/jpeg' ? 'jpeg' : mimeType.split('/')[1];
    xml += `
  <Default Extension="${ext}" ContentType="${mimeType}"/>`;
  }
  
  xml += `
</Types>`;
  
  return xml;
}

/**
 * Generate styles XML
 */
function generateStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="360"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="44"/>
      <w:szCs w:val="44"/>
      <w:b/>
      <w:color w:val="000000"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="28"/>
      <w:b/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="180" w:after="100"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="24"/>
      <w:b/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="120" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="22"/>
      <w:b/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:ind w:left="720" w:right="720"/>
    </w:pPr>
    <w:rPr>
      <w:i/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Code">
    <w:name w:val="Code"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>
    </w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Hyperlink">
    <w:name w:val="Hyperlink"/>
    <w:rPr>
      <w:color w:val="0000FF"/>
      <w:u w:val="single"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;
}

/**
 * Generate app properties XML
 */
function generateAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ClipAIble</Application>
  <TotalTime>0</TotalTime>
</Properties>`;
}

/**
 * Generate core properties XML
 */
function generateCoreXml(title, author, date) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(author)}</dc:creator>
  <dc:subject>Article</dc:subject>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

