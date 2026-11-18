# PDF processing

This module parses PDF text and layout and renders PDF pages in the extension's offscreen document. It uses the bundled PDF.js library and resources under `lib/pdfjs/`.

## Entry points

Service worker callers use `scripts/api/pdf-offscreen.js`:

- `extractPdfViaOffscreen` returns structured content for Automatic extraction.
- `getPdfMetadata` returns the page count and document metadata.
- `renderAllPdfPages` renders the document once and returns owned page references. `readRenderedPdfPage` consumes a rendered page for the AI pipeline.

`scripts/processing/pdf.js` acquires and validates PDF bytes before calling these APIs. It reads an online PDF from its source URL. For local files, it tries direct access when Chrome permits it, then available tab data, and finally a file selection in the popup. The selected bytes accompany subsequent requests.

## Native extraction

`extract.js` exports `extractPdfContent`. The pipeline:

1. Loads one PDF.js document and reads its metadata.
2. Collects page text, font information, and graphics used for layout analysis.
3. Computes document-wide font metrics, repeated running margins, and spacing information.
4. Groups text into lines, columns, and blocks in reading order.
5. Classifies and merges headings, paragraphs, lists, tables, and other content.
6. Returns the document title, author, publication date, and structured content.

Native extraction uses the PDF text layer. Rendered-page AI processing is a separate path for interpreting page images.

## Main modules

- `core/` loads and disposes PDF.js documents, collates text, groups lines, and assembles content.
- `analyzers/` computes layout metrics, columns, heading hierarchy, gaps, and running margins.
- `classifiers/` identifies content roles from text, geometry, and formatting.
- `processors/` groups and merges elements, tables, lists, and cross-page continuations.
- `utils/` contains text, font, coordinate, metadata, graphics, and PDF acquisition helpers.
- `render-operations.js` owns rendering cancellation; `render-viewport.js` computes render dimensions within the image budget.

## Data and lifecycle

Native text remains plain text with optional line and font metadata. Native table cells declare `cellFormat: 'text'`; consumers must escape them rather than interpret comparisons or technical notation as HTML. `scripts/types.js` defines the shared content representation.

PDF requests carry an operation ID and, for document workflows, a `processingRunId`. Input bytes and rendered pages use extension-origin IndexedDB references rather than one large base64 message. A rendered page is consumed by its owner, and the workflow releases remaining records on completion or failure.

PDF.js documents, loading tasks, and render tasks are disposed or cancelled by their owning operation. Page errors propagate to the caller; an incomplete document is not returned as a successful extraction. Rendering progress and terminal errors carry localized message descriptors.

Build the extension before running the PDF tests; the resource tests check generated bundles as well as source modules. See [test commands](../../../tests/README.md).
