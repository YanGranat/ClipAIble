# PDF Extraction - Multi-level Classification System

## Philosophy

The system is designed with the need to build a complex multi-level classification system for PDF elements. The architecture is designed for gradual complexity: starting with simple proven algorithms, gradually adding new levels of analysis.

## Architecture

```
pdf/
├── extract.js              # Main coordinator - entry point
├── types.js                # Data types and interfaces
├── constants.js            # Constants and thresholds
│
├── core/                   # Core algorithms (proven, from v1)
│   ├── clustering.js       # Object clustering (pdfplumber)
│   ├── line-grouping.js    # Grouping items → lines
│   └── text-collation.js   # Text merging into strings
│
├── classifiers/            # Element classifiers (multiple algorithms)
│   ├── paragraph.js        # Paragraph classification
│   ├── heading.js          # Heading classification
│   ├── subheading.js       # Subheading classification
│   ├── list.js             # List classification
│   ├── table.js            # Table classification (stub)
│   ├── image.js            # Image classification (stub)
│   ├── formula.js          # Formula classification (stub)
│   └── index.js            # Export all classifiers
│
├── analyzers/              # Context and metrics analyzers
│   ├── metrics.js          # PDF metrics analysis (font sizes, spacing)
│   ├── context.js          # Element context analysis
│   ├── structure.js        # Document structure analysis
│   ├── page-context.js     # Page context
│   ├── cross-page-context.js # Cross-page context
│   └── index.js            # Export all analyzers
│
├── processors/             # Processing processors
│   ├── cross-page.js       # Cross-page processing
│   ├── element-grouper.js  # Grouping lines into elements
│   ├── element-decider.js  # Element type decision making
│   ├── list-grouper.js     # List element grouping
│   ├── list-splitter.js    # Heading and list separation
│   ├── page-processor.js   # Page processing
│   ├── post-processing.js  # Post-processing
│   └── index.js            # Export all processors
│
└── utils/                  # Utilities
    ├── array-helpers.js    # Array manipulation utilities
    ├── text-helpers.js     # Text manipulation utilities
    ├── font-detection.js   # Bold/italic detection
    ├── image-extraction.js # Image extraction
    ├── coordinate-transform.js # Coordinate transformation
    ├── regex-patterns.js   # Regular expressions
    ├── statistics.js      # Statistical functions
    └── index.js           # Export all utilities
```

## Principles

1. **Multiple classification algorithms**: Each element is evaluated by multiple independent algorithms
2. **Weighted voting**: Decisions are made based on algorithm consensus
3. **Contextual analysis**: Elements are analyzed in the context of page, neighbors, document
4. **Adaptive thresholds**: Thresholds adapt to specific PDF
5. **Detailed logging**: Every decision is logged for debugging

## Current Implementation

### Implemented Features (v7)
- ✅ Items → lines clustering (pdfplumber algorithm)
- ✅ Lines → elements grouping (paragraphs, headings, lists)
- ✅ Heading level detection (font size clustering, outline, numbering)
- ✅ List processing (ordered/unordered, nested lists)
- ✅ Cross-page merging (paragraphs, headings, lists)
- ✅ Multi-column layout detection
- ✅ Gap analysis for element boundary detection
- ✅ Universal algorithms without hardcoding
- ✅ Modular architecture with separation of concerns
- ✅ Centralized utilities (validation, formatting, statistics)

### Architectural Improvements (v7)
- ✅ Refactoring large functions into subfunctions
- ✅ Eliminating code duplication through utilities
- ✅ Performance optimization (merging array iterations)
- ✅ Improved error handling (try-catch in critical places)

### Planned Improvements
- [ ] Multiple paragraph detection algorithms
- [ ] Multiple heading detection algorithms
- [ ] Contextual analysis (neighboring elements, page, document)
- [ ] Adaptive thresholds based on PDF metrics
- [ ] Table processing
- [ ] Formula processing
- [ ] Unit tests for critical functions

## Usage

```javascript
import { extractPdfContent } from './extract.js';
import { log } from '../../utils/logging.js';

const result = await extractPdfContent(pdfUrl);
log('Extracted content', { contentItems: result.content.length });
```
