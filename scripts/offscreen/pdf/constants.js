// @ts-check
// Constants for PDF extraction v3

/**
 * Paragraph length thresholds (characters)
 * @readonly
 * @const {{
 *   VERY_SHORT: number,
 *   SHORT: number,
 *   MEDIUM: number,
 *   LONG: number,
 *   VERY_LONG: number
 * }}
 */
export const PARAGRAPH_LENGTH = {
  VERY_SHORT: 100,      // Very short text (likely heading, not paragraph body)
  SHORT: 300,           // Short continuation text
  MEDIUM: 500,          // Medium paragraph length
  LONG: 1000,           // Long paragraph (likely multi-page)
  VERY_LONG: 1500       // Very long paragraph (almost certainly multi-page)
};

/**
 * Single word detection
 * Maximum length for single word continuation
 * @readonly
 * @const {number}
 */
export const SINGLE_WORD_MAX_LENGTH = 20;

/**
 * Heading detection thresholds
 * @readonly
 * @const {{
 *   MAX_LENGTH_WITH_COLON: number,
 *   MAX_LENGTH_CAPITAL: number,
 *   MIN_WORD_LENGTH: number,
 *   MAX_WORD_LENGTH: number,
 *   MAX_OBJECT_LENGTH: number
 * }}
 */
export const HEADING_DETECTION = {
  MAX_LENGTH_WITH_COLON: 100,  // Max length for heading ending with colon
  MAX_LENGTH_CAPITAL: 80,      // Max length for capital letter heading
  MIN_WORD_LENGTH: 3,          // Min word length for object detection
  MAX_WORD_LENGTH: 15,         // Max word length for object detection
  MAX_OBJECT_LENGTH: 20        // Max length for likely object
};

/**
 * Word fragment detection
 * @readonly
 * @const {{
 *   MAX_INCOMPLETE_LENGTH: number,
 *   MAX_COMPLETE_WORD_LENGTH: number,
 *   MIN_COMPLETE_WORD_LENGTH: number
 * }}
 */
export const WORD_FRAGMENT = {
  MAX_INCOMPLETE_LENGTH: 30,   // Max length for incomplete word
  MAX_COMPLETE_WORD_LENGTH: 40, // Max length for complete word when merged
  MIN_COMPLETE_WORD_LENGTH: 2   // Min length for complete word
};

/**
 * Clustering tolerances (defaults, will be adapted per PDF)
 * @readonly
 * @const {{
 *   DEFAULT_X_TOLERANCE: number,
 *   DEFAULT_Y_TOLERANCE: number,
 *   X_TOLERANCE_MULTIPLIER: number,
 *   Y_TOLERANCE_MULTIPLIER: number
 * }}
 */
export const CLUSTERING = {
  DEFAULT_X_TOLERANCE: 3,       // Default X tolerance for spacing
  DEFAULT_Y_TOLERANCE: 3,       // Default Y tolerance for line grouping
  X_TOLERANCE_MULTIPLIER: 0.25, // X tolerance = fontSize * multiplier
  Y_TOLERANCE_MULTIPLIER: 0.15  // Y tolerance = fontSize * multiplier
};

/**
 * Classification confidence thresholds
 * @readonly
 * @const {{
 *   HIGH: number,
 *   MEDIUM: number,
 *   LOW: number,
 *   MINIMUM: number
 * }}
 */
export const CONFIDENCE = {
  HIGH: 0.8,      // High confidence threshold
  MEDIUM: 0.6,    // Medium confidence threshold
  LOW: 0.4,       // Low confidence threshold
  MINIMUM: 0.3    // Minimum confidence to consider
};

/**
 * Element type decision thresholds
 * @readonly
 * @const {Object}
 */
export const ELEMENT_DECISION = {
  // Text length thresholds for type classification
  SHORT_TEXT_MAX: 150,           // Max length for short text (possible heading)
  LONG_TEXT_MIN: 200,            // Min length for long text (definitely paragraph)
  VERY_LONG_TEXT_MIN: 300,       // Min length for very long text (always paragraph)
  
  // Confidence differences for type selection
  HEADING_VS_PARAGRAPH_MIN_DIFF: 0.1,  // Min confidence difference to prefer heading over paragraph
  HEADING_VS_PARAGRAPH_LARGE_DIFF: 0.2, // Large confidence difference for homogeneous docs
  
  // Heading detection thresholds
  HEADING_MAX_LENGTH: 100,       // Max length for heading to be used as title
  IMPLICIT_HEADING_MAX_LENGTH: 150, // Max length for implicit heading detection
  
  // Title extraction
  TITLE_MAX_LENGTH: 30,          // Max length for extracted title
  TITLE_MIN_WORD_BREAK: 15,      // Min position for word break in title truncation
  TITLE_TRUNCATE_TOLERANCE: 10,  // Tolerance for title truncation (maxLength + tolerance)
  
  // Implicit heading detection
  IMPLICIT_HEADING_MIN_CONFIDENCE: 0.5,  // Min confidence for implicit heading in homogeneous docs
  
  // List detection
  LIST_MIN_CONFIDENCE: 0.5,  // Min confidence for list classification
  
  // Table detection
  TABLE_MIN_CONFIDENCE: 0.6,  // Min confidence for table classification
  TABLE_MIN_COLUMNS: 2,       // Minimum number of columns for table
  TABLE_MIN_ROWS: 2,          // Minimum number of rows for table
  
  // List heading detection
  LIST_HEADING_MAX_LENGTH: 100,  // Max length for list heading (text ending with colon)
  LIST_HEADING_SHORT_LENGTH: 50,  // Very short text threshold for list heading detection
  LIST_HEADING_BOOSTED_CONFIDENCE: 0.8,  // Boosted confidence for list headings (when recognized as heading)
  LIST_HEADING_MIN_CONFIDENCE: 0.6,  // Minimum confidence to force heading type for list headings
  
  // Text length thresholds (for consistency across modules)
  VERY_SHORT_TEXT: 50,   // Very short text threshold
  SHORT_TEXT: 100,       // Short text threshold
  MEDIUM_TEXT: 200       // Medium text threshold
};

/**
 * Text continuation scoring system
 * PRIORITY: Visual > Structural > Contextual > Semantic
 * Based on DEEP_VISUAL_ANALYSIS.md: Visual 40%, Font size 25%, Style 15%, Semantic 3%
 * @readonly
 * @const {Object}
 */
export const CONTINUATION_SCORES = {
  // VISUAL INDICATORS (high priority - 40% weight)
  FONT_SIZE_MATCH: 2,              // Next line font size matches base/median (VISUAL - 25% weight, reduced from 3)
  FONT_SIZE_SIMILAR: 1,             // Current and next font sizes are similar (VISUAL, only for long blocks)
  LONG_BLOCK: 2,                    // Current block is long (>200 chars) (VISUAL - indicates paragraph)
  BLOCK_LENGTH_SIMILAR: 0.5,        // Current and next blocks have similar lengths (VISUAL, only for long blocks)
  
  // STRUCTURAL INDICATORS (medium priority - 15% weight)
  PAGE_BREAK: 1,                    // It's a page break (contextual)
  PUNCTUATION_END: 1,                // Current ends with comma/semicolon/colon/dash (structural)
  
  // SEMANTIC INDICATORS (low priority - 3% weight, only for edge cases)
  LOWERCASE_START: 1,               // Next line starts with lowercase (SEMANTIC - reduced weight)
  NO_SENTENCE_END: 0.5,             // Current doesn't end with sentence punctuation (SEMANTIC - reduced)
  SHORT_CONTINUATION: 0.5,          // Next line is short (<100) and starts with lowercase (SEMANTIC)
  
  // NEGATIVE INDICATORS
  FONT_SIZE_DIFF_LARGE: -4,         // Font size significantly different (>50%) (VISUAL - very strong negative)
  FONT_SIZE_DIFF_MEDIUM: -1,        // Font size moderately different (VISUAL)
  SENTENCE_END_CAPITAL: -1,         // Current ends with sentence end AND next starts with capital (SEMANTIC - reduced)
  SHORT_CAPITAL: -0.5,              // Next line is very short (<50) and starts with capital (SEMANTIC - reduced)
  SHORT_BLOCK: -0.5,                // Current block is very short (<100) (VISUAL - reduced)
  
  // Threshold
  THRESHOLD: 3                      // Minimum score to merge blocks (requires multiple positive indicators)
};

/**
 * Font size comparison thresholds
 * @readonly
 * @const {{
 *   LARGER_THAN_BASE_MULTIPLIER: number,
 *   SIMILARITY_TOLERANCE: number,
 *   DIFFERENCE_LARGE_MULTIPLIER: number,
 *   DEFAULT_FONT_SIZE: number
 * }}
 */
export const FONT_SIZE_THRESHOLDS = {
  LARGER_THAN_BASE_MULTIPLIER: 1.1,    // 10% larger than base (for heading detection)
  SIMILARITY_TOLERANCE: 0.1,            // 10% tolerance for similar font sizes
  DIFFERENCE_LARGE_MULTIPLIER: 0.5,     // 50% difference (large difference)
  DEFAULT_FONT_SIZE: 12                 // Default font size fallback
};

/**
 * Default values for metrics (fallbacks when analysis fails)
 * @readonly
 * @const {{
 *   BASE_FONT_SIZE: number,
 *   MEDIAN_FONT_SIZE: number,
 *   MODE_SPACING: number,
 *   PARAGRAPH_GAP_THRESHOLD: number
 * }}
 */
export const DEFAULT_METRICS = {
  BASE_FONT_SIZE: 12,                    // Default base font size
  MEDIAN_FONT_SIZE: 12,                  // Default median font size
  MODE_SPACING: 12,                      // Default mode spacing
  PARAGRAPH_GAP_THRESHOLD: 18            // Default paragraph gap threshold
};

/**
 * Text continuation thresholds
 * @readonly
 * @const {{
 *   SHORT_BLOCK_MAX_LENGTH: number,
 *   LONG_BLOCK_MIN_LENGTH: number,
 *   VERY_SHORT_LINE_MAX_LENGTH: number,
 *   SHORT_LINE_MAX_LENGTH: number
 * }}
 */
export const CONTINUATION_THRESHOLDS = {
  SHORT_BLOCK_MAX_LENGTH: 150,          // Max length for "short" block
  LONG_BLOCK_MIN_LENGTH: 200,           // Min length for "long" block
  VERY_SHORT_LINE_MAX_LENGTH: 50,       // Max length for "very short" line
  SHORT_LINE_MAX_LENGTH: 100            // Max length for "short" line
};

/**
 * PDF processing limits
 * @readonly
 * @const {{
 *   MAX_FILE_SIZE: number,
 *   MAX_PAGES_FOR_ANALYSIS: number,
 *   MAX_ELEMENTS_TO_LOG: number
 * }}
 */
export const LIMITS = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500 MB (increased from 50 MB to support very large PDFs up to 1000 pages)
  MAX_PAGES_FOR_ANALYSIS: 2,         // Pages to analyze for metrics
  MAX_ELEMENTS_TO_LOG: 10            // Max elements to log in detail
};

/**
 * Gap analysis thresholds and ratios
 * @readonly
 * @const {Object}
 */
export const GAP_ANALYSIS = {
  // Threshold multipliers for paragraph boundary detection
  PARAGRAPH_GAP_MIN_MULTIPLIER: 1.5,      // Minimum gap multiplier for paragraph boundary
  NORMAL_GAP_MAX_MULTIPLIER: 1.3,        // Maximum gap multiplier for normal (intra-paragraph) gap
  
  // Ratio thresholds for ambiguous zone decisions
  RATIO_BREAK_THRESHOLD: 0.7,            // If gapRatio > this, likely paragraph break
  RATIO_CONTINUATION_THRESHOLD: 0.3,     // If gapRatio < this, likely continuation
  RATIO_STRONG_BREAK_THRESHOLD: 0.85,    // Strong break indicator in ambiguous zone
  RATIO_MODERATE_BREAK_THRESHOLD: 0.6,   // Moderate break indicator
  RATIO_DEFAULT_THRESHOLD: 0.5,          // Default threshold for ambiguous cases
  
  // Special case multipliers
  HEADING_GAP_MULTIPLIER: 0.9,           // Gap after heading (relative to paragraphGapMin)
  SPLIT_HEADING_GAP_MIN: 0.7,            // Minimum gap for split heading detection
  SPLIT_HEADING_GAP_MAX: 1.3,             // Maximum gap for split heading (above = different elements)
  LIST_ITEM_GAP_MULTIPLIER: 0.9,         // Gap for list item continuation
  LIST_ITEM_BREAK_MULTIPLIER: 0.8,       // Gap for new element after list
  
  // Block length thresholds for special cases
  LONG_BLOCK_MIN_LENGTH: 500              // Minimum length for "long block" special handling
};

/**
 * Cross-page break marker
 * Special value to indicate cross-page break (cannot use actual gap size between pages)
 * @readonly
 * @const {number}
 */
export const CROSS_PAGE_BREAK_MARKER = Number.MAX_SAFE_INTEGER;

/**
 * Page break context analysis constants
 * @readonly
 * @const {Object}
 */
export const PAGE_BREAK_CONTEXT = {
  PREV_PAGE_END_LENGTH: 20,              // Characters to analyze from end of previous page
  NEXT_PAGE_START_LENGTH: 50,             // Characters to analyze from start of next page
  SUBSTANTIAL_TEXT_RATIO: 0.3,            // Ratio of avg paragraph length for substantial text
  VERY_LONG_BLOCK_MULTIPLIER: 2,          // Multiplier for very long block (>2x avg)
  GAP_RATIO_THRESHOLD: 0.5,               // Threshold for gap ratio in ambiguous zone
  PARAGRAPH_GAP_MULTIPLIER: 2,            // Multiplier for very large gap (>2x paragraphGapMin)
  OUTLIER_GAP_MULTIPLIER: 1.5,            // Multiplier for outlier gap detection
  SPLIT_BOUNDARY_MIN_LENGTH: 20           // Minimum length after boundary for split detection
};

/**
 * Continuation score multipliers
 * @readonly
 * @const {Object}
 */
export const CONTINUATION_MULTIPLIERS = {
  STRONG_SEMANTIC_BOUNDARY: 3,            // Triple penalty for strong semantic boundary
  INCOMPLETE_SENTENCE: 1.5,               // Strong positive for incomplete sentence
  DASH_CONTINUATION: 2,                   // Very strong positive for dash continuation
  FONT_SIZE_TOLERANCE_MULTIPLIER: 2,      // Multiplier for font size tolerance
  VERY_LONG_BLOCK_MULTIPLIER: 2.5,        // Multiplier for very long block detection
  BLOCK_LENGTH_SIMILARITY_THRESHOLD: 0.5  // Threshold for similar block lengths
};

/**
 * Heading scoring system (improved from v2 with negative scores and adaptive thresholds)
 * @readonly
 * @const {Object}
 */
export const HEADING_SCORES = {
  // Very strong positive indicators (+5)
  NUMBERED_HEADING: 5,                     // Numbered heading (e.g., "1.", "2.1.")
  SHORT_LARGE_FONT: 5,                     // Short text (<100) with large font (>=1.2x) - VERY STRONG
  
  // Strong positive indicators (+4)
  HEADING_BY_SIZE: 4,                      // Font size significantly larger (>=1.3x) - INCREASED
  MULTI_WORD_CAPITAL: 4,                   // Multi-word capital heading - INCREASED
  HEADING_AFTER_LIST: 3,                   // Heading after list
  
  // Moderate positive indicators (+3)
  HEADING_BY_STYLE: 3,                     // Bold or italic style - INCREASED
  HEADING_BY_COLON: 2,                     // Ends with colon
  HEADING_BY_GAP_AFTER: 3,                 // Large gap after - INCREASED
  
  // Weak positive indicators (+2)
  HEADING_BY_SHORT_CAPITAL: 2,             // Short capital text - INCREASED
  HEADING_BY_POSITION: 2,                  // First element or after heading - INCREASED
  FIRST_ELEMENT_SHORT: 2,                   // First element with short text - NEW
  
  // Strong negative indicators (penalties)
  VERY_LONG_TEXT: -3,                      // Text > 300 chars (almost certainly not heading)
  MANY_WORDS: -2,                          // Word count > 15 (likely paragraph)
  LONG_TEXT_MANY_WORDS: -2,                // Text > 200 chars AND word count > 10
  
  // Moderate negative indicators
  SENTENCE_IN_MIDDLE: -1,                  // Contains '.' in middle (sentence, not heading)
  LONG_WITHOUT_FORMATTING: -1              // Long text without bold and small font
};

// Adaptive threshold calculation for heading detection
export const HEADING_THRESHOLDS = {
  // Base thresholds (will be adjusted based on document)
  BASE_THRESHOLD: 3,                       // Base threshold for normal documents
  HOMOGENEOUS_BONUS: 1,                    // Additional threshold for homogeneous documents
  
  // Font size adjustments
  SMALL_FONT_ADJUSTMENT: 1,                // +1 for small fonts (<10pt)
  LARGE_FONT_ADJUSTMENT: -1,               // -1 for large fonts (>16pt)
  
  // Variability adjustments
  HIGH_VARIABILITY_THRESHOLD: 3,           // Lower threshold for high variability (clear hierarchy)
  LOW_VARIABILITY_THRESHOLD: 4,            // Higher threshold for low variability (homogeneous)
  
  // Font size ratio thresholds
  MIN_FONT_SIZE_RATIO: 1.3,                // Minimum ratio for heading by size
  STRONG_FONT_SIZE_RATIO: 1.35,            // Strong indicator ratio
  VERY_LARGE_FONT_RATIO: 2.0,              // Very large font (2x+)
  
  // Heading level font size ratios (for fallback level determination)
  H1_FONT_RATIO: 1.5,                      // H1: >= 1.5x base font
  H2_FONT_RATIO: 1.3,                      // H2: >= 1.3x base font
  H3_FONT_RATIO: 1.2,                      // H3: >= 1.2x base font
  H4_FONT_RATIO: 1.1,                      // H4: >= 1.1x base font
  H5_FONT_RATIO: 1.05,                     // H5: >= 1.05x base font
  H6_FONT_RATIO: 1.0,                      // H6: >= 1.0x base font
  
  // Text length thresholds (adaptive based on document)
  MAX_HEADING_LENGTH: 100,                 // Max length for typical heading
  DEFINITELY_NOT_HEADING_LENGTH: 300,      // Definitely not heading if longer
  MAX_WORD_COUNT: 15,                      // Max word count for heading
  MAX_WORD_COUNT_FOR_LARGE_FONT: 5         // Max word count for large font heading
};

// Gap after analysis for heading detection
export const HEADING_GAP_ANALYSIS = {
  MIN_GAP_FOR_HEADING: 20,                 // Minimum gap after to consider heading
  SIGNIFICANT_GAP_MULTIPLIER: 1.5,         // Gap > 1.5x paragraphGapMin = significant
  NEXT_ELEMENT_LONG_THRESHOLD: 200         // Next element length to consider "long"
};

// Table detection and extraction constants
export const TABLE_DETECTION = {
  // Tolerance multipliers (relative to baseFontSize)
  Y_TOLERANCE_MULTIPLIER: 0.3,            // For grouping rows by Y-coordinate
  ROW_TOLERANCE_MULTIPLIER: 0.15,         // For grouping lines into rows
  COLUMN_TOLERANCE_MULTIPLIER: 0.1,       // For clustering X-coordinates (columns)
  CELL_TOLERANCE_MULTIPLIER: 0.2,         // For matching cells to columns
  ROW_GAP_MULTIPLIER: 2.5,                // Max gap between rows in table (relative to baseFontSize)
  
  // Graphics line detection thresholds
  LINE_THICKNESS_THRESHOLD: 5,            // Minimum thickness threshold (pixels)
  LINE_THICKNESS_MULTIPLIER: 0.4,         // Thickness threshold = baseFontSize * multiplier (40% of font size)
  LINE_LENGTH_THRESHOLD: 20,              // Minimum length threshold (pixels)
  LINE_LENGTH_MULTIPLIER: 1.5,            // Length threshold = baseFontSize * multiplier (150% of font size)
  
  // Gap pattern analysis
  GAP_CV_THRESHOLD: 0.3,                  // Coefficient of variation threshold for regular gaps (30%)
  GAP_SIZE_MULTIPLIER: 2.0,                // Gap size multiplier for small gaps (2x font size)
  
  // Element filtering thresholds
  PARAGRAPH_TEXT_LENGTH_THRESHOLD: 200,   // Text length threshold for paragraph filtering
  PARAGRAPH_LINE_COUNT_THRESHOLD: 10,      // Line count threshold for paragraph filtering
  PARAGRAPH_AVG_LINE_LENGTH_THRESHOLD: 50, // Average line length threshold for paragraph filtering
  
  // Table validation thresholds
  MAX_AVG_CELL_LENGTH: 150,                // Maximum average cell length (chars)
  MAX_LONG_CELL_LENGTH: 100,               // Maximum length for a single cell to be considered "long" (chars)
  MAX_LONG_CELL_RATIO: 0.5,                // Maximum ratio of rows with long cells (50%)
  MIN_ROW_LENGTH_VARIANCE: 0.2,            // Minimum row length variance (20%)
  
  // Graphics area checking
  GRAPHICS_TOLERANCE_DEFAULT: 10,          // Default tolerance for graphics area checking (pixels)
  GRAPHICS_TOLERANCE_MULTIPLIER: 0.8,      // Tolerance multiplier based on font size (80% of font size)
  MIN_GRAPHICS_LINES_FOR_TABLE: 2,         // Minimum number of graphics lines to indicate table
  
  // Thresholds
  BLOCK_MIN_LENGTH: 200,                  // Min block length to check for tables
  ROW_GAP_RATIO: 0.7,                     // Row gaps should be < 70% of paragraph gap
  HEADER_BOLD_RATIO: 0.5,                 // >50% bold lines = header row
  HEADER_EMPTY_CELL_RATIO: 0.7,           // Header has <70% empty cells than average
  CELL_OVERLAP_RATIO: 0.3,                // Cell overlaps column if >30% of cell width
  COLUMN_MIN_OCCURRENCE_RATIO: 0.3,       // Column must appear in >30% of lines
  
  // Line length validation
  MAX_AVG_LINE_LENGTH: 100,                // Maximum average line length for table detection (chars)
  LINE_LENGTH_PENALTY_DIVISOR: 50,        // Divisor for line length penalty calculation
  
  // Column alignment scoring
  COLUMN_SCORE_MAX_COLUMNS: 5,             // Maximum columns for column score normalization
  ALIGNMENT_SCORE_WEIGHT: 0.8,             // Weight for alignment score in column alignment
  COLUMN_SCORE_WEIGHT: 0.2,                // Weight for column score in column alignment
  
  // Grid confidence calculation
  GRID_ALIGNMENT_WEIGHT: 0.7,              // Weight for alignment ratio in grid confidence
  GRID_SIZE_WEIGHT: 0.3,                   // Weight for size score in grid confidence
  GRID_MAX_COLUMNS: 5,                     // Maximum columns for size score normalization
  GRID_MAX_ROWS: 5,                        // Maximum rows for size score normalization
  GRID_CONFIDENCE_CAP: 0.95,               // Maximum confidence cap for grid pattern
  
  // Row structure detection
  ROW_STRUCTURE_SMALL_GAP_WEIGHT: 0.6,     // Weight for small gap ratio
  ROW_STRUCTURE_REGULARITY_WEIGHT: 0.4,    // Weight for gap regularity
  ROW_STRUCTURE_CONFIDENCE_CAP: 0.85,      // Maximum confidence cap for row structure
  ROW_STRUCTURE_SMALL_GAP_RATIO: 0.7,      // Small gap threshold ratio (70% of paragraph gap)
  
  // Header detection words (heuristic for common table headers)
  HEADER_WORDS: [
    'parameter', 'value', 'compound', 'type', 'found',
    'name', 'description', 'quantity', 'price', 'amount',
    'title', 'label', 'item', 'data', 'result'
  ]
};

// Text formatting detection constants
export const TEXT_FORMATTING = {
  // Bold detection thresholds
  ABSOLUTE_BOLD_THRESHOLD: 28,            // If widthHeightRatio > 28, likely bold (increased from 20 to reduce false positives)
  HIGH_RATIO_THRESHOLD: 30,               // Individual item ratio threshold for bold (increased from 25)
  MIN_COMPARISON_MULTIPLIER: 1.6,         // 1.6x minimum ratio for bold detection (increased from 1.5)
  MEDIAN_COMPARISON_MULTIPLIER: 1.3,      // 1.3x median ratio for bold detection (increased from 1.2)
  BASE_FONT_PERCENTAGE: 50,               // Font used for >50% items is base font
  HIGH_RATIO_PERCENTAGE: 50,              // Less than 50% of group has high ratio
  
  // Underline detection constants
  HORIZONTAL_LINE_TOLERANCE: 2,           // dy < 2px for horizontal lines
  VIEWPORT_Y_MIN_FACTOR: 0.2,             // 20% above text for underline range
  VIEWPORT_Y_MAX_FACTOR: 0.3,             // 30% below text for underline range
  VIEWPORT_BASELINE_FACTOR: 0.8,          // 80% of font height (baseline position)
  VIEWPORT_UNDERLINE_OFFSET: 0.1,         // 10% below baseline for underline
  VIEWPORT_STRICT_MAX_DISTANCE: 5,        // Maximum 5px distance
  VIEWPORT_STRICT_DISTANCE_FACTOR: 0.2,   // 20% of font size for strict distance
  VIEWPORT_ABSOLUTE_MAX_DISTANCE: 100,     // Absolute maximum 100px
  VIEWPORT_ABSOLUTE_DISTANCE_FACTOR: 5,    // 5x font size for absolute distance
  VIEWPORT_MIN_COVERAGE: 0.05,             // Minimum 5% coverage for underline
  VIEWPORT_MAX_COVERAGE: 0.8,              // Maximum 80% coverage for underline (prevents table borders)
  VIEWPORT_WIDE_ITEM_THRESHOLD: 200,      // Wide item threshold (pixels)
  VIEWPORT_RIGHT_PART_FACTOR: 0.7,         // Right 30% of item
  VIEWPORT_RIGHT_QUARTER_FACTOR: 0.75,    // Rightmost 25% of item
  
  // PDF native coordinate constants
  PDF_UNDERLINE_OFFSET_FACTOR: 0.15,      // 15% below baseline in PDF coordinates
  PDF_STRICT_TOLERANCE: 5,                 // Maximum 5px tolerance
  PDF_STRICT_TOLERANCE_FACTOR: 0.2,       // 20% of font size for strict tolerance
  PDF_RELATIVE_TOLERANCE_FACTOR: 0.5,     // 50% of font size for relative coordinates
  
  // Range calculation constants
  RANGE_MIN_COVERAGE: 0.05,                // Minimum 5% coverage for range
  RANGE_MIN_OVERLAP_WIDTH: 10,            // Minimum 10px overlap width
  
  // Font format types
  FORMAT_BOLD: 'bold',
  FORMAT_ITALIC: 'italic',
  FORMAT_BOLD_ITALIC: 'bold-italic',
  
  // Regex patterns for font name detection
  BOLD_FONT_PATTERN: /bold|black|heavy|demi|semi/i,
  ITALIC_FONT_PATTERN: /italic|oblique/i,
  
  // Contextual formatting thresholds
  CONTEXTUAL_BOLD_RATIO_THRESHOLD: 30,    // Base threshold for bold detection (increased from 25)
  CONTEXTUAL_RATIO_DIFF_HIGH: 2.2,         // 2.2x ratio difference for bold (increased from 2.0)
  CONTEXTUAL_RATIO_DIFF_LOW: 0.4,          // 0.4x ratio difference threshold (decreased from 0.5 for stricter italic detection)
  CONTEXTUAL_RATIO_DIFF_VERY_LOW: 0.08,     // 0.08x ratio difference for italic (stricter to reduce false positives, decreased from 0.1)
  CONTEXTUAL_RATIO_DIFF_EXTREME: 3.5,      // 3.5x ratio difference for extreme bold (increased from 3.0)
  CONTEXTUAL_FONT_USAGE_RARE: 3,           // <3% usage = rare font (stricter to reduce false positives, decreased from 5)
  CONTEXTUAL_FONT_USAGE_MODERATE: 25,      // <25% usage = moderate usage (decreased from 30)
  CONTEXTUAL_FONT_SIZE_RATIO_MIN: 0.85,     // Minimum font size ratio (increased from 0.8)
  CONTEXTUAL_FONT_SIZE_RATIO_MAX: 1.08,     // Maximum font size ratio (decreased from 1.1)
  CONTEXTUAL_RATIO_DIFF_MODERATE: 0.7,     // Moderate ratio difference threshold (decreased from 0.8)
  CONTEXTUAL_NEIGHBOR_RATIO_MULTIPLIER: 1.7, // 1.7x neighbor ratio for bold (increased from 1.4 to reduce false positives)
  
  // Anti-false-positive filters
  MIN_TEXT_LENGTH_FOR_FORMATTING: 3,        // Minimum text length (chars) to apply formatting (reduces false positives for single chars/short fragments)
  MIN_TEXT_LENGTH_FOR_RATIO_FORMATTING: 4,  // Minimum text length for ratio-based formatting (stricter, requires 4+ chars)
  MAX_PUNCTUATION_RATIO: 0.5,              // If >50% of text is punctuation/digits, don't format (reduces false positives)
  REQUIRED_METHODS_FOR_RATIO_FORMATTING: 2  // Require at least 2 independent methods to agree for ratio-based formatting (reduces false positives)
};

