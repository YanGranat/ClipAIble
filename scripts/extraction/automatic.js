// Automatic content extraction without AI
// Uses heuristics and DOM analysis to extract article content

// Note: This function uses modular helper functions that are inlined at build time
// All modules are in scripts/extraction/modules/ and are assembled by builder.js
// The function runs in page context via executeScript where imports are not available

/**
 * Inlined automatic extraction function for chrome.scripting.executeScript
 * This runs in the page's main world context
 * 
 * CRITICAL: DO NOT REFACTOR OR SPLIT THIS FUNCTION!
 * 
 * This function is ~4084 lines long and MUST remain as a single, monolithic function.
 * It is injected as a complete code block via chrome.scripting.executeScript into
 * the page's main world context where ES modules and imports are NOT available.
 * 
 * Reasons why this function cannot be split:
 * 1. It runs in page context (not service worker) where imports don't work
 * 2. chrome.scripting.executeScript requires a single function reference
 * 3. Helper functions are inlined at build time from modules (see scripts/extraction/modules/)
 * 4. The inlining process (builder.js) assembles all modules into this single function
 * 5. Breaking it into smaller functions would break the build process
 * 
 * The function uses modular helper functions that are inlined at build time.
 * All modules are in scripts/extraction/modules/ and are assembled by builder.js.
 * The function runs in page context via executeScript where imports are not available.
 * 
 * See systemPatterns.md "Design Decisions" section for more details.
 * 
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @param {boolean} enableDebugInfo - Whether to collect debug information (default: false)
 * @returns {Object} Extraction result with content, title, author, publishDate, debugInfo
 */
export function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false) {
  // Log start (this will appear in page console, not service worker)
  // CRITICAL: This runs in MAIN world where modules are not available
  // console.log is acceptable here as logging module cannot be imported
  try {
    console.log('[ClipAIble] extractAutomaticallyInlined: START', { baseUrl, enableDebugInfo, timestamp: Date.now() });
  } catch (e) {}
  
  const content = [];
  
  // Collect debug info to return to service worker (only if enabled)
  // Performance optimization: skip debug info collection when LOG_LEVEL > DEBUG
  const debugInfo = enableDebugInfo ? {
    foundElements: 0,
    filteredElements: 0,
    imageCount: 0,
    excludedImageCount: 0,
    processedCount: 0,
    skippedCount: 0,
    contentTypes: {}
  } : null;
  
  try {
    // ============================================
    // INLINED CONSTANTS AND PATTERNS
    // (Generated from scripts/extraction/constants/ and scripts/extraction/patterns/)
    // (Cannot use imports in executeScript context)
    // ============================================
    
    // Content thresholds
    const MIN_CONTENT_LENGTH = 100;
    const SUBSTANTIAL_CONTENT_LENGTH = 500;
    const MIN_PARAGRAPH_LENGTH = 10;
    const MIN_HEADING_LENGTH = 3;
    const MIN_STANDFIRST_LENGTH = 50;
    const MAX_STANDFIRST_LENGTH = 500;
    const SHORT_PARAGRAPH_THRESHOLD = 200;
    const VERY_SHORT_PARAGRAPH = 100;
    const MAX_AUTHOR_METADATA_LENGTH = 100;
    const MAX_WORD_COUNT_METADATA_LENGTH = 150;
    
    // Image thresholds
    const FEATURED_IMAGE_MIN_WIDTH = 400;
    const FEATURED_IMAGE_MIN_HEIGHT = 300;
    const AUTHOR_PHOTO_MAX_SIZE = 250;
    const AUTHOR_PHOTO_SMALL_SIZE = 150;
    const TRACKING_PIXEL_MAX_SIZE = 3;
    
    // Scoring thresholds
    const MIN_CONTENT_SCORE = 10;
    const GOOD_ENOUGH_SCORE = 100;
    
    // Navigation patterns (contains) - used in isExcluded and isNavigationParagraph
    const NAV_PATTERNS_CONTAINS = [
      /previous\s+post/i,
      /next\s+post/i,
      /related\s+posts?/i,
      /recommended\s+posts?/i,
      /read\s+more/i,
      /keep\s+reading/i,
      /you\s+might\s+also\s+like/i,
      /you\s+may\s+also\s+like/i,
      /also\s+in\s+/i,
      /more\s+in\s+/i,
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
    ];
    
    // Navigation patterns (starts with) - used in isNavigationParagraph
    const NAV_PATTERNS_STARTS_WITH = [
      /^next:/i,
      /^read more/i,
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
    ];
    
    // Paywall patterns (all languages flattened)
    const PAYWALL_PATTERNS = [
      'keep reading',
      'subscribe',
      'sign up',
      'try 30 days',
      'already have an account',
      'start free trial',
      'get access to print and digital',
      'subscribe for full access',
      'free articles this month',
      'subscribe for less than',
      'subscribe or log in to access',
      'connect to your subscription',
      'you\'ve read one',
      'you\'ve read your',
      'you\'ve reached your free',
      'чтобы прочитать целиком',
      'купите подписку',
      'платный журнал',
      'я уже подписчик',
      'подписка предоставлена',
      'оформить подписку',
      'чтобы читать далее',
      'подпишитесь чтобы',
      'чтобы продолжить',
      'щоб прочитати цілком',
      'купити підписку',
      'платний журнал',
      'я вже передплатник',
      'підписка надана',
      'оформити підписку',
      'щоб читати далі',
      'підпишіться щоб',
      'щоб продовжити',
      'um weiterzulesen',
      'abonnement kaufen',
      'bezahltes magazin',
      'ich bin bereits abonnent',
      'abonnement bereitgestellt',
      'abonnement abschließen',
      'um weiter zu lesen',
      'abonnieren um',
      'um fortzufahren',
      'pour lire en entier',
      'acheter un abonnement',
      'magazine payant',
      'je suis déjà abonné',
      'abonnement fourni',
      's\'abonner',
      'pour continuer à lire',
      'abonnez-vous pour',
      'pour continuer',
      'para leer completo',
      'comprar suscripción',
      'revista de pago',
      'ya soy suscriptor',
      'suscripción proporcionada',
      'suscribirse',
      'para seguir leyendo',
      'suscríbete para',
      'para continuar',
      'per leggere completo',
      'acquista abbonamento',
      'rivista a pagamento',
      'sono già abbonato',
      'abbonamento fornito',
      'abbonarsi',
      'per continuare a leggere',
      'abbonati per',
      'per continuare',
      'para ler completo',
      'comprar assinatura',
      'revista paga',
      'já sou assinante',
      'assinatura fornecida',
      'assinar',
      'para continuar lendo',
      'assine para',
      'para continuar',
      '阅读全文',
      '购买订阅',
      '付费杂志',
      '我已经是订阅者',
      '已提供订阅',
      '订阅',
      '继续阅读',
      '订阅以',
      '继续',
      '全文を読む',
      '購読を購入',
      '有料雑誌',
      '既に購読者です',
      '購読が提供されました',
      '購読する',
      '続きを読む',
      '購読して',
      '続ける',
      '전체 읽기',
      '구독 구매',
      '유료 잡지',
      '이미 구독자입니다',
      '구독 제공됨',
      '구독하기',
      '계속 읽기',
      '구독하여',
      '계속'
    ];
    
    // Related articles patterns (all languages flattened)
    const RELATED_PATTERNS = [
      'new and best',
      'first page',
      'recommend',
      'read also',
      'similar articles',
      'related articles',
      'other articles',
      'more on topic',
      'on topic',
      'новое и лучшее',
      'первая полоса',
      'рекомендуем',
      'читайте также',
      'похожие статьи',
      'связанные статьи',
      'другие статьи',
      'ещё по теме',
      'по теме',
      'нове і краще',
      'перша смуга',
      'рекомендуємо',
      'читайте також',
      'схожі статті',
      'пов\'язані статті',
      'інші статті',
      'ще за темою',
      'за темою',
      'neu und besser',
      'erste seite',
      'empfehlen',
      'lesen sie auch',
      'ähnliche artikel',
      'verwandte artikel',
      'andere artikel',
      'mehr zum thema',
      'zum thema',
      'nouveau et mieux',
      'première page',
      'recommandons',
      'lisez aussi',
      'articles similaires',
      'articles connexes',
      'autres articles',
      'plus sur le sujet',
      'sur le sujet',
      'nuevo y mejor',
      'primera página',
      'recomendamos',
      'lee también',
      'artículos similares',
      'artículos relacionados',
      'otros artículos',
      'más sobre el tema',
      'sobre el tema',
      'nuovo e migliore',
      'prima pagina',
      'consigliamo',
      'leggi anche',
      'articoli simili',
      'articoli correlati',
      'altri articoli',
      'altro sull\'argomento',
      'sull\'argomento',
      'novo e melhor',
      'primeira página',
      'recomendamos',
      'leia também',
      'artigos similares',
      'artigos relacionados',
      'outros artigos',
      'mais sobre o tema',
      'sobre o tema',
      '最新和最佳',
      '头版',
      '推荐',
      '也阅读',
      '相似文章',
      '相关文章',
      '其他文章',
      '更多主题',
      '主题',
      '新しくて最高',
      '第一面',
      'おすすめ',
      'こちらも読む',
      '類似記事',
      '関連記事',
      'その他の記事',
      'トピックの詳細',
      'トピック',
      '새로운 것과 최고',
      '첫 페이지',
      '추천',
      '또한 읽기',
      '유사한 기사',
      '관련 기사',
      '다른 기사',
      '주제에 대해 더',
      '주제'
    ];
    
    // Course ad patterns
    const COURSE_AD_PATTERNS = [
      'video + ux training',
      'get video',
      'video training',
      'video course',
      'measure ux & design impact',
      'money-back-guarantee',
      'money back guarantee',
      'get the video course',
      'get video + ux training',
      'use the code',
      'save 20%',
      'save 20% off'
    ];
    
    // Excluded classes
    const EXCLUDED_CLASSES = [
      'nav',
      'navigation',
      'menu',
      'sidebar',
      'footer',
      'header',
      'ad',
      'advertisement',
      'ads',
      'sponsor',
      'sponsored',
      'advert',
      'comment',
      'comments',
      'discussion',
      'thread',
      'disqus',
      'related',
      'related-posts',
      'related-articles',
      'related-articles__title',
      'recommended',
      'also-in',
      'article-section-title',
      'entry-wrapper',
      'c-accordion',
      'accordion',
      'social',
      'share',
      'share-buttons',
      'share-menu',
      'author-bio',
      'author-info',
      'about-author',
      'translation-notice',
      'translation-badge',
      'post-navigation',
      'post-nav',
      'prev',
      'next',
      'previous',
      'read-more',
      'readmore',
      'keep-reading',
      'subscribe',
      'paywall',
      'gate',
      'newsletter',
      'newsletter-signup',
      'subscribe-box',
      'support',
      'donate',
      'donation',
      'corrections',
      'correction',
      'you-might-also-like',
      'you-may-also-like',
      'more-in',
      'next-article',
      'previous-article',
      'article-nav',
      'comment-section',
      'comments-section',
      'view-comments',
      'add-comment',
      'book-cta',
      'course-cta',
      'product-cta',
      'course-ad',
      'product-ad',
      'content-tabs',
      'content-tab',
      'book-cta__inverted',
      'book-cta__col',
      'useful-resources',
      'further-reading',
      'resources-section',
      'component-share-buttons',
      'aria-font-adjusts',
      'font-adjust'
    ];
    
    // Paywall classes
    const PAYWALL_CLASSES = [
      'freebie-message',
      'subscribe-text',
      'message--freebie',
      'subscribe-',
      'paywall',
      'subscription',
      'freebie',
      'article-limit',
      'access-message'
    ];
    
    // ============================================
    // END OF INLINED CONSTANTS
    // ============================================
    
    // ============================================
    // INLINED MODULE FUNCTIONS
    // Functions from scripts/extraction/modules/
    // ============================================
    
    // Utils module functions
    function toAbsoluteUrl(url, baseUrl) {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
      try { return new URL(url, baseUrl).href; } catch (e) { return url; }
    }
    
    function isFootnoteLink(element) {
      if (element.tagName.toLowerCase() !== 'a') return false;
      const href = element.getAttribute('href') || '';
      if (href === '#' || (href.startsWith('#') && href.length > 1) || href.includes('#note')) {
        const text = element.textContent.trim();
        if (/^[\d\s]+$/.test(text) || /^[←→↑↓↗↘↩]+$/.test(text) || text.toLowerCase().includes('open these')) {
          return true;
        }
        const img = element.querySelector('img');
        if (img && (img.alt === '↩' || img.src.includes('emoji') || String(img.className || '').includes('emoji'))) {
          return true;
        }
      }
      return false;
    }
    
    function isIcon(element) {
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'svg') return true;
      const className = String(element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      if (className.includes('icon-') || className.includes('icon') || id.includes('icon')) {
        return true;
      }
      if (tagName === 'span' || tagName === 'i' || tagName === 'em' || tagName === 'sup') {
        const text = element.textContent.trim();
        if (text.length <= 3 && /[←→↑↓↗↘◀▶▲▼↩]/.test(text)) {
          return true;
        }
        if (tagName === 'sup' && text.toLowerCase().includes('open these')) {
          return true;
        }
      }
      if (tagName === 'img') {
        const alt = (element.alt || '').trim();
        const src = (element.src || '').toLowerCase();
        if (alt === '↩' || /[←→↑↓↗↘↩]/.test(alt) || (src.includes('emoji') && alt.includes('arrow'))) {
          return true;
        }
      }
      return false;
    }
    
    function normalizeImageUrl(url) {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        return urlObj.origin + urlObj.pathname;
      } catch (e) {
        return url.split('?')[0].split('#')[0];
      }
    }
    
    // Image processor module functions (inlined)
    function isPlaceholderUrlModule(url) {
      if (!url) return true;
      if (url.startsWith('data:image')) {
        if (url.includes('1x1') || url.includes('transparent') || url.length < 100) {
          return true;
        }
      }
      const placeholderPatterns = ['placeholder', 'spacer', 'blank', '1x1', 'pixel.gif'];
      const urlLower = url.toLowerCase();
      return placeholderPatterns.some(pattern => urlLower.includes(pattern));
    }
    
    function getBestSrcsetUrlModule(srcset, isPlaceholderUrl) {
      if (!srcset) return null;
      const sources = srcset.split(',').map(s => s.trim());
      let bestUrl = null;
      let bestSize = 0;
      for (const source of sources) {
        const parts = source.trim().split(/\s+/);
        if (parts.length < 1) continue;
        const url = parts[0];
        if (isPlaceholderUrl(url)) continue;
        if (parts.length > 1) {
          const descriptor = parts[1];
          if (descriptor.endsWith('x')) {
            const multiplier = parseFloat(descriptor);
            if (multiplier > bestSize) {
              bestSize = multiplier;
              bestUrl = url;
            }
          } else if (descriptor.endsWith('w')) {
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
    
    function extractBestImageUrlModule(imgElement, isPlaceholderUrl, getBestSrcsetUrl) {
      if (!imgElement) return null;
      let src = null;
      if (imgElement.currentSrc && imgElement.currentSrc.length > 0 && !isPlaceholderUrl(imgElement.currentSrc)) {
        src = imgElement.currentSrc;
      }
      if (!src) {
        const imgSrc = imgElement.src || imgElement.getAttribute('src');
        if (imgSrc && imgSrc.length > 0 && !isPlaceholderUrl(imgSrc)) {
          src = imgSrc;
        }
      }
      if (!src) {
        const srcset = imgElement.getAttribute('srcset');
        if (srcset) {
          src = getBestSrcsetUrl(srcset);
        }
      }
      if (!src) {
        const picture = imgElement.closest('picture');
        if (picture) {
          for (const source of picture.querySelectorAll('source[srcset]')) {
            const srcset = source.getAttribute('srcset');
            if (srcset) {
              const candidate = getBestSrcsetUrl(srcset);
              if (candidate) {
                src = candidate;
                break;
              }
            }
          }
        }
      }
      if (!src) {
        const dataAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 
                           'data-full-src', 'data-high-res', 'data-srcset', 'data-original-src'];
        for (const attr of dataAttrs) {
          const val = imgElement.getAttribute(attr);
          if (val && !val.includes('data:') && !isPlaceholderUrl(val)) {
            if (attr === 'data-srcset') {
              src = getBestSrcsetUrl(val);
            } else {
              src = val;
            }
            if (src) break;
          }
        }
      }
      if (!src) {
        const parentLink = imgElement.closest('a[href]');
        if (parentLink) {
          const href = parentLink.getAttribute('href');
          if (href && (href.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || href.includes('image'))) {
            src = href;
          }
        }
      }
      return src;
    }
    
    function isTrackingPixelModule(img) {
      try {
        const style = window.getComputedStyle(img);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          const naturalWidth = img.naturalWidth || 0;
          const naturalHeight = img.naturalHeight || 0;
          const cssWidth = parseInt(style.width) || img.width || 0;
          const cssHeight = parseInt(style.height) || img.height || 0;
          if (naturalWidth > 0 && naturalHeight > 0) {
            if (naturalWidth <= 3 && naturalHeight <= 3) return true;
          } else if (cssWidth > 0 && cssHeight > 0) {
            if (cssWidth <= 3 && cssHeight <= 3) return true;
          }
        }
      } catch (e) {}
      const naturalWidth = img.naturalWidth || 0;
      const naturalHeight = img.naturalHeight || 0;
      const cssWidth = img.width || 0;
      const cssHeight = img.height || 0;
      if (naturalWidth > 0 && naturalHeight > 0) {
        if (naturalWidth <= 3 && naturalHeight <= 3) return true;
      } else if (cssWidth > 0 && cssHeight > 0) {
        if (cssWidth <= 1 && cssHeight <= 1) return true;
      }
      const src = (img.src || '').toLowerCase();
      const trackingPatterns = ['pixel', 'tracking', 'beacon', 'analytics', 'facebook.com/tr', 'doubleclick', 'googleads'];
      return trackingPatterns.some(pattern => src.includes(pattern));
    }
    
    function isDecorativeImageModule(img, constants) {
      if (!img) return false;
      const { LOGO_PATTERNS } = constants;
      const src = (img.src || '').toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      const className = String(img.className || '').toLowerCase();
      const id = (img.id || '').toLowerCase();
      if (className.includes('headshot') || id.includes('headshot') ||
          className.includes('author-photo') || className.includes('author-image') ||
          className.includes('author-avatar') || id.includes('author-photo') ||
          id.includes('author-image') || id.includes('author-avatar') ||
          className.includes('byline-thumbnail') || className.includes('byline-thumb') ||
          className.includes('contributor-thumbnail') || className.includes('contributor-thumb') ||
          className.includes('rich-byline') || className.includes('wp-post-image') ||
          id.includes('byline-thumbnail') || id.includes('contributor-thumbnail')) {
        return true;
      }
      let checkParent = img.parentElement;
      for (let i = 0; i < 5 && checkParent; i++) {
        const parentClass = String(checkParent.className || '').toLowerCase();
        const parentId = (checkParent.id || '').toLowerCase();
        const parentTag = checkParent.tagName.toLowerCase();
        if (parentClass.includes('contributor') || parentClass.includes('contributors') ||
            parentClass.includes('byline') || parentClass.includes('author-info') ||
            parentClass.includes('author-bio') || parentClass.includes('author-meta') ||
            parentId.includes('contributor') || parentId.includes('contributors') ||
            parentId.includes('byline') || parentId.includes('author-info') ||
            parentTag === 'address' || parentClass.includes('vcard')) {
          const naturalWidth = img.naturalWidth || img.width || 0;
          const naturalHeight = img.naturalHeight || img.height || 0;
          if (naturalWidth > 0 && naturalHeight > 0) {
            if (naturalWidth <= 150 && naturalHeight <= 150) {
              return true;
            }
          } else {
            const cssWidth = parseInt(img.style.width) || img.width || 0;
            const cssHeight = parseInt(img.style.height) || img.height || 0;
            if (cssWidth > 0 && cssHeight > 0 && cssWidth <= 150 && cssHeight <= 150) {
              return true;
            }
          }
          if (!alt || alt.length === 0) {
            return true;
          }
        }
        checkParent = checkParent.parentElement;
      }
      if (!alt || alt.length === 0) {
        let parent = img.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          if (parentClass.includes('contributor') || parentClass.includes('contributors') ||
              parentClass.includes('byline') || parentClass.includes('author-info') ||
              parentClass.includes('author-bio') || parentClass.includes('author-meta') ||
              parentId.includes('contributor') || parentId.includes('byline')) {
            const naturalWidth = img.naturalWidth || img.width || 0;
            const naturalHeight = img.naturalHeight || img.height || 0;
            if (naturalWidth > 0 && naturalHeight > 0) {
              if (naturalWidth <= 150 && naturalHeight <= 150) {
                return true;
              }
            } else {
              const cssWidth = parseInt(img.style.width) || img.width || 0;
              const cssHeight = parseInt(img.style.height) || img.height || 0;
              if (cssWidth > 0 && cssHeight > 0 && cssWidth <= 150 && cssHeight <= 150) {
                return true;
              }
            }
          }
          parent = parent.parentElement;
        }
      } else if (alt.length > 0 && alt.length < 100) {
        const namePattern = /^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/;
        if (namePattern.test(alt.trim())) {
          if (className.includes('headshot') || id.includes('headshot') ||
              className.includes('byline-thumbnail') || className.includes('contributor-thumbnail')) {
            return true;
          }
          let parent = img.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const parentClass = String(parent.className || '').toLowerCase();
            const parentId = (parent.id || '').toLowerCase();
            const parentTag = parent.tagName.toLowerCase();
            if (parentClass.includes('author') || parentId.includes('author') ||
                parentClass.includes('byline') || parentId.includes('byline') ||
                parentClass.includes('headshot') || parentId.includes('headshot') ||
                parentClass.includes('contributor') || parentId.includes('contributor') ||
                parentTag === 'address' || parentClass.includes('vcard') ||
                parentClass.includes('author-info') || parentClass.includes('author-bio')) {
              return true;
            }
            parent = parent.parentElement;
          }
          const naturalWidth = img.naturalWidth || img.width || 0;
          const naturalHeight = img.naturalHeight || img.height || 0;
          if (naturalWidth > 0 && naturalHeight > 0) {
            if ((naturalWidth <= 250 && naturalHeight <= 250) && 
                (naturalWidth === naturalHeight || Math.abs(naturalWidth - naturalHeight) < 50)) {
              return true;
            }
          }
        }
      }
      const naturalWidth = img.naturalWidth || img.width || 0;
      const naturalHeight = img.naturalHeight || img.height || 0;
      if (naturalWidth > 0 && naturalHeight > 0) {
        if ((naturalWidth <= 250 && naturalHeight <= 250) && 
            (naturalWidth === naturalHeight || Math.abs(naturalWidth - naturalHeight) < 50)) {
          let parent = img.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            const parentClass = String(parent.className || '').toLowerCase();
            const parentId = (parent.id || '').toLowerCase();
            if (parentClass.includes('author') || parentId.includes('author') ||
                parentClass.includes('byline') || parentId.includes('byline')) {
              return true;
            }
            parent = parent.parentElement;
          }
        }
      }
      let checkParentForFacepile = img.parentElement;
      for (let i = 0; i < 6 && checkParentForFacepile; i++) {
        const parentClass = String(checkParentForFacepile.className || '').toLowerCase();
        const parentId = (checkParentForFacepile.id || '').toLowerCase();
        const parentText = checkParentForFacepile.textContent || '';
        if (parentClass.includes('facepile') || parentId.includes('facepile') ||
            parentClass.includes('likes') || parentClass.includes('restacks') ||
            parentClass.includes('engagement') || parentClass.includes('reactions') ||
            parentText.includes('Likes') || parentText.includes('Restacks') ||
            parentText.includes('likes') || parentText.includes('restacks')) {
          const naturalWidth = img.naturalWidth || img.width || 0;
          const naturalHeight = img.naturalHeight || img.height || 0;
          const cssWidth = parseInt(img.style.width) || img.width || 0;
          const cssHeight = parseInt(img.style.height) || img.height || 0;
          if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 100 && naturalHeight <= 100) ||
              (cssWidth > 0 && cssHeight > 0 && cssWidth <= 100 && cssHeight <= 100)) {
            return true;
          }
        }
        checkParentForFacepile = checkParentForFacepile.parentElement;
      }
      if (alt && (alt.includes("'s avatar") || alt.includes("'s avatar") || 
                  alt.includes(' avatar') || alt === 'avatar' || alt.endsWith('avatar'))) {
        const naturalWidth = img.naturalWidth || img.width || 0;
        const naturalHeight = img.naturalHeight || img.height || 0;
        const cssWidth = parseInt(img.style.width) || img.width || 0;
        const cssHeight = parseInt(img.style.height) || img.height || 0;
        if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) ||
            (cssWidth > 0 && cssHeight > 0 && cssWidth <= 50 && cssHeight <= 50)) {
          return true;
        }
        if (alt.toLowerCase().includes("'s avatar") || alt.toLowerCase().endsWith(' avatar')) {
          return true;
        }
      }
      if (LOGO_PATTERNS.some(pattern => src.includes(pattern))) {
        return true;
      }
      if (alt && (alt.includes('logo') || alt.includes('icon') || alt.includes('brand') || 
                  alt.includes('social') || alt.includes('share') || alt.includes('button'))) {
        if (alt.length > 30 && (alt.includes('photo') || alt.includes('image') || alt.includes('picture'))) {
          return false;
        }
        return true;
      }
      if (className.includes('logo') || className.includes('icon') || className.includes('brand') ||
          className.includes('social') || className.includes('share') || className.includes('button') ||
          id.includes('logo') || id.includes('icon') || id.includes('brand') ||
          id.includes('social') || id.includes('share') || id.includes('button')) {
        return true;
      }
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
        if (!className.includes('author-avatar') && !className.includes('profile-pic') &&
            !className.includes('author') && !id.includes('author') &&
            !className.includes('headshot') && !id.includes('headshot') &&
            (src.includes('icon') || src.includes('logo') || src.includes('social') || 
             alt.includes('icon') || alt.includes('logo') || alt.includes('social'))) {
          return true;
        }
      }
      try {
        const style = window.getComputedStyle(img);
        if (style.backgroundImage !== 'none' && style.backgroundImage.includes(src)) {
          return true;
        }
      } catch (e) {}
      if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth < 100 && naturalHeight < 100) &&
          !alt && !img.closest('figure') && !img.closest('a')) {
        let parent = img.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          if (parentClass.includes('social') || parentClass.includes('share') || 
              parentClass.includes('icon') || parentClass.includes('logo') ||
              parentId.includes('social') || parentId.includes('share') ||
              parentId.includes('icon') || parentId.includes('logo')) {
            return true;
          }
          parent = parent.parentElement;
        }
      }
      return false;
    }
    
    function getImageCaptionModule(img) {
      const figure = img.closest('figure');
      if (figure) {
        const figcaption = figure.querySelector('figcaption');
        if (figcaption) return figcaption.textContent.trim();
      }
      const ariaLabel = img.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
      const title = img.getAttribute('title');
      if (title && title.trim() && title !== img.alt) return title.trim();
      const nextSibling = img.nextElementSibling;
      if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
        return nextSibling.textContent.trim();
      }
      const parent = img.parentElement;
      if (parent) {
        const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
        if (captionEl) {
          const captionText = captionEl.textContent.trim();
          if (captionText && captionText !== img.alt) return captionText;
        }
      }
      return '';
    }
    
    // Content finder module functions (inlined)
    function isLikelyContentContainerModule(element) {
      const className = String(element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const contentIndicators = [
        'article', 'content', 'post', 'entry', 'main', 'story', 'text'
      ];
      for (const indicator of contentIndicators) {
        if (className.includes(indicator) || id.includes(indicator)) {
          return true;
        }
      }
      return false;
    }
    
    function calculateContentScoreModule(element, isLikelyContentContainer) {
      const paragraphs = element.querySelectorAll('p');
      const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const links = element.querySelectorAll('a');
      const text = element.textContent || '';
      const textLength = text.length;
      let score = paragraphs.length * 10;
      score += headings.length * 5;
      score += Math.min(textLength / 100, 50);
      const linkDensity = paragraphs.length > 0 
        ? links.length / Math.max(paragraphs.length, 1)
        : links.length / Math.max(textLength / 100, 1);
      if (linkDensity > 1.0) {
        score *= 0.5;
      } else if (linkDensity > 0.7) {
        score *= 0.75;
      } else if (linkDensity > 0.5) {
        score *= 0.9;
      }
      const commaCount = (text.match(/,/g) || []).length;
      if (commaCount > 10) {
        score *= 1.2;
      } else if (commaCount > 5) {
        score *= 1.1;
      }
      const sentenceCount = (text.match(/[.!?]+\s+/g) || []).length;
      if (sentenceCount > 5) {
        score += Math.min(sentenceCount * 2, 30);
      }
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'article') {
        score *= 2.0;
      } else if (tagName === 'main') {
        score *= 1.5;
      } else if (tagName === 'section' && paragraphs.length >= 3) {
        score *= 1.2;
      }
      if (isLikelyContentContainer(element)) {
        score += 100;
      }
      if (textLength < 100) {
        score *= 0.5;
      } else if (textLength < 200) {
        score *= 0.8;
      }
      const lists = element.querySelectorAll('ul, ol');
      if (lists.length > paragraphs.length * 3 && paragraphs.length < 3) {
        score *= 0.6;
      } else if (lists.length > paragraphs.length * 2 && paragraphs.length < 5) {
        score *= 0.8;
      }
      const textLower = text.toLowerCase();
      if (textLower.includes('get the latest') && textLower.includes('inbox') ||
          textLower.includes('email powered by') ||
          textLower.includes('salesforce marketing cloud') ||
          textLower.includes('marketing cloud')) {
        score -= 1000;
      }
      const emailInputs = element.querySelectorAll('input[type="email"]');
      if (emailInputs.length > 0) {
        const hasNewsletterText = textLower.includes('newsletter') || 
                                textLower.includes('subscribe') ||
                                textLower.includes('get the latest') ||
                                textLower.includes('inbox') ||
                                textLower.includes('marketing cloud');
        if (hasNewsletterText) {
          score -= 1000;
        } else {
          score -= 50;
        }
      }
      if (textLower.includes('marketing cloud') || textLower.includes('salesforce')) {
        score -= 500;
      }
      const images = element.querySelectorAll('img');
      if (images.length > 0 && images.length < 20) {
        score += Math.min(images.length * 3, 20);
      }
      let longParagraphs = 0;
      for (const p of paragraphs) {
        if (p.textContent.trim().length > 200) {
          longParagraphs++;
        }
      }
      if (longParagraphs > 3) {
        score += longParagraphs * 5;
      }
      return score;
    }
    
    function hasSubstantialContentModule(element) {
      const text = element.textContent.trim();
      const paragraphs = element.querySelectorAll('p');
      return text.length > 100 && (paragraphs.length >= 1 || text.length > 300);
    }
    
    function findMainContentModule(isExcluded, isLikelyContentContainer, calculateContentScore) {
      const article = document.querySelector('article');
      if (article) {
        const articleScore = calculateContentScore(article);
        if (articleScore > 0 && hasSubstantialContentModule(article)) {
          return article;
        }
      }
      const main = document.querySelector('main');
      if (main) {
        const mainScore = calculateContentScore(main);
        if (mainScore > 0 && hasSubstantialContentModule(main)) {
          return main;
        }
      }
      let bestElement = null;
      let bestScore = 0;
      const candidates = document.querySelectorAll('div, section, article, main');
      for (const candidate of Array.from(candidates)) {
        if (isExcluded(candidate)) continue;
        const score = calculateContentScore(candidate);
        if (score > bestScore && hasSubstantialContentModule(candidate)) {
          bestScore = score;
          bestElement = candidate;
        }
      }
      return bestElement;
    }
    
    // Element filter module functions (inlined)
    function isNavigationParagraphModule(text, NAV_PATTERNS_STARTS_WITH, PAYWALL_PATTERNS) {
      const textTrimmed = text.trim();
      const textLength = textTrimmed.length;
      if (textLength > 200) {
        return false;
      }
      const linkCount = (textTrimmed.match(/<a\s+/gi) || []).length;
      const textWithoutLinks = textTrimmed.replace(/<[^>]+>/g, '').trim();
      const linkDensity = textWithoutLinks.length > 0 ? linkCount / (textWithoutLinks.length / 50) : linkCount;
      if (linkCount >= 2 && textLength < 100) {
        return true;
      }
      if (NAV_PATTERNS_STARTS_WITH.some(pattern => pattern.test(textTrimmed))) {
        return true;
      }
      const textLower = text.toLowerCase();
      if (PAYWALL_PATTERNS.some(pattern => textLower.includes(pattern))) {
        return true;
      }
      return false;
    }
    
    function isExcludedModule(element, constants, helpers) {
      const {
        EXCLUDED_CLASSES,
        PAYWALL_CLASSES,
        NAV_PATTERNS_CONTAINS,
        COURSE_AD_PATTERNS
      } = constants;
      
      const {
        isFootnoteLink,
        isIcon
      } = helpers;
      
      const tagName = element.tagName.toLowerCase();
      const isSemanticContainer = tagName === 'article' || tagName === 'main';
      const className = String(element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const isImageOrFigure = tagName === 'img' || tagName === 'figure';
      
      let style = null;
      try {
        style = window.getComputedStyle(element);
      } catch (e) {
        return false;
      }
      
      if (style) {
        if (isImageOrFigure) {
          if (style.display === 'none' || style.visibility === 'hidden') {
            const hasLazySrc = element.hasAttribute('data-src') || 
                              element.hasAttribute('data-lazy-src') ||
                              element.hasAttribute('data-original') ||
                              element.hasAttribute('data-srcset');
            if (hasLazySrc) {
              return false;
            }
            if (tagName === 'figure') {
              const img = element.querySelector('img');
              if (img) {
                const imgHasLazySrc = img.hasAttribute('data-src') || 
                                     img.hasAttribute('data-lazy-src') ||
                                     img.hasAttribute('data-original') ||
                                     img.hasAttribute('data-srcset');
                if (imgHasLazySrc) {
                  return false;
                }
              }
            }
            return true;
          }
        } else {
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return true;
          }
        }
      }
      
      if (tagName === 'iframe') {
        const src = (element.src || '').toLowerCase();
        const adPatterns = ['ad', 'ads', 'advertisement', 'doubleclick', 'googleads', 'pubmatic', 'openx', 'adsystem'];
        if (adPatterns.some(pattern => src.includes(pattern))) {
          return true;
        }
        const parent = element.parentElement;
        if (parent) {
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          if (parentClass.includes('ad') || parentId.includes('ad') || 
              parentClass.includes('advertisement') || parentId.includes('advertisement')) {
            return true;
          }
        }
        return true;
      }
      
      if (isFootnoteLink(element)) return true;
      if (isIcon(element)) return true;
      if (tagName === 'aside' || element.getAttribute('role') === 'complementary') {
        return true;
      }
      if (element.querySelector && element.querySelector('input[type="email"]')) {
        return true;
      }
      
      const adClasses = ['book-cta', 'course-cta', 'product-cta', 'course-ad', 'product-ad'];
      if (adClasses.some(adClass => className.includes(adClass) || id.includes(adClass))) {
        return true;
      }
      
      const paywallClasses = [
        'freebie-message', 'subscribe-text', 'message--freebie', 'subscribe-',
        'paywall', 'subscription', 'freebie', 'article-limit', 'access-message'
      ];
      if (paywallClasses.some(paywallClass => className.includes(paywallClass) || id.includes(paywallClass))) {
        return true;
      }
      
      const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
      const text = element.textContent || '';
      const textLower = text.toLowerCase();
      const textTrimmed = text.trim();
      
      if (isParagraphOrHeading) {
        if (textTrimmed.length < 100 && 
            (/^\d+[,\s]\d+\s+words?$/i.test(textTrimmed) || /^\d+\s+words?$/i.test(textTrimmed))) {
          return true;
        }
        if (textTrimmed.length < 150 && 
            (/^original\s+article\s*[•·]\s*\d+[,\s]?\d*\s*words?$/i.test(textTrimmed) ||
             (/^original\s+article\s*[•·]/i.test(textTrimmed) && /\d+\s*words?/i.test(textTrimmed)))) {
          return true;
        }
        if (textTrimmed.toLowerCase().startsWith('edited by') && textTrimmed.length < 100) {
          return true;
        }
      } else {
        if (/^\d+[,\s]\d+\s+words?$/i.test(textTrimmed) || /^\d+\s+words?$/i.test(textTrimmed)) {
          return true;
        }
        if (/^original\s+article\s*[•·]\s*\d+[,\s]?\d*\s*words?$/i.test(textTrimmed) ||
            /^original\s+article\s*[•·]/i.test(textTrimmed) && /\d+\s*words?/i.test(textTrimmed)) {
          return true;
        }
        if (textTrimmed.toLowerCase().startsWith('edited by') && textTrimmed.length < 200) {
          return true;
        }
      }
      
      if (tagName === 'a' && textLower.includes('syndicate this essay')) {
        return true;
      }
      
      if ((textLower.includes('donate') || textLower.includes('donation')) && 
          (textLower.includes('support') || textLower.includes('mission') || 
           textLower.includes('select amount') || textLower.includes('per month'))) {
        return true;
      }
      
      const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
      const hasPrice = pricePattern.test(text);
      const isCourseAd = COURSE_AD_PATTERNS.some(pattern => textLower.includes(pattern));
      if (hasPrice && isCourseAd) {
        return true;
      }
      
      if ((className.includes('summary') || id.includes('summary') || 
           className.includes('quick-summary') || id.includes('quick-summary')) &&
          (textLower.includes('measure ux & design impact') || 
           textLower.includes('use the code') || textLower.includes('save 20%') ||
           textLower.includes('save') && textLower.includes('off'))) {
        return true;
      }
      
      if (tagName.match(/^h[1-6]$/)) {
        const headingText = textLower;
        if (headingText.startsWith('meet ') && 
            (headingText.includes('course') || headingText.includes('book') || 
             headingText.includes('training') || headingText.includes('product') ||
             headingText.includes('measure ux'))) {
          let parent = element.parentElement;
          let nextSibling = element.nextElementSibling;
          for (let i = 0; i < 3 && (parent || nextSibling); i++) {
            const checkText = ((parent ? parent.textContent : '') + 
                             (nextSibling ? nextSibling.textContent : '')).toLowerCase();
            if (checkText.includes('$') || checkText.includes('price') || 
                checkText.includes('money-back') || checkText.includes('guarantee') ||
                checkText.includes('495') || checkText.includes('799') ||
                checkText.includes('250') || checkText.includes('395')) {
              return true;
            }
            if (parent) parent = parent.parentElement;
            if (nextSibling) nextSibling = nextSibling.nextElementSibling;
          }
        }
        if (headingText.includes('video') && 
            (headingText.includes('training') || headingText.includes('course'))) {
          let parent = element.parentElement;
          let nextSibling = element.nextElementSibling;
          for (let i = 0; i < 3 && (parent || nextSibling); i++) {
            const checkText = ((parent ? parent.textContent : '') + 
                             (nextSibling ? nextSibling.textContent : '')).toLowerCase();
            if (checkText.includes('$') || checkText.includes('price') || 
                checkText.includes('money-back') || checkText.includes('guarantee')) {
              return true;
            }
            if (parent) parent = parent.parentElement;
            if (nextSibling) nextSibling = nextSibling.nextElementSibling;
          }
        }
        if (headingText.includes('useful resources') || headingText.includes('further reading')) {
          let nextSibling = element.nextElementSibling;
          let linkCount = 0;
          let textLength = 0;
          for (let i = 0; i < 5 && nextSibling; i++) {
            const links = nextSibling.querySelectorAll('a');
            linkCount += links.length;
            const siblingText = nextSibling.textContent.replace(/<[^>]+>/g, '').trim();
            textLength += siblingText.length;
            nextSibling = nextSibling.nextElementSibling;
          }
          if (linkCount >= 3 && textLength < 500) {
            return true;
          }
        }
        if (headingText.trim() === 'tags') {
          return true;
        }
        if (headingText.includes('more from')) {
          return true;
        }
        if (headingText.trim().toLowerCase() === 'related') {
          return true;
        }
        if (headingText.includes('from the archive')) {
          return true;
        }
      }
      
      if (tagName === 'hr' || tagName === 'separator' || 
          element.getAttribute('role') === 'separator' ||
          className.includes('separator') || id.includes('separator')) {
        return true;
      }
      
      if (className.includes('share-buttons') || className.includes('component-share-buttons') ||
          className.includes('aria-font-adjusts') || className.includes('font-adjust') ||
          id.includes('share-buttons') || id.includes('font-adjust')) {
        return true;
      }
      
      if (tagName === 'button') {
        const buttonText = text.trim().toLowerCase();
        if (buttonText === 'email' || buttonText === 'save' || buttonText === 'post' || 
            buttonText === 'share' || buttonText.includes('syndicate')) {
          return true;
        }
      }
      
      if (tagName === 'a') {
        const href = (element.getAttribute('href') || '').toLowerCase();
        const hasImage = element.querySelector('img');
        const linkText = text.trim();
        if (href.includes('/essay/') && hasImage && linkText.length > 30) {
          const parent = element.parentElement;
          if (parent) {
            const siblingLinks = parent.querySelectorAll('a[href*="/essay/"]');
            if (siblingLinks.length >= 2) {
              return true;
            }
          }
        }
        const linkText2 = text.trim();
        if (linkText2.startsWith('[') && linkText2.endsWith(']') && linkText2.length < 50) {
          return true;
        }
      }
      
    if (textLower.includes('sign up to our newsletter') || 
        textLower.includes('join more than') && textLower.includes('newsletter subscribers') ||
        (textLower.includes('newsletter') && textLower.includes('subscribe') && 
         element.querySelector('input[type="email"]'))) {
      return true;
    }
    
    if (/get\s+the\s+latest\s+.+\s+stories?\s+in\s+your\s+inbox/i.test(text)) {
      return true;
    }
    
    if (textLower.includes('email powered by') ||
        textLower.includes('powered by salesforce') ||
        textLower.includes('salesforce marketing cloud') ||
        textLower.includes('marketing cloud') ||
        (textLower.includes('privacy notice') && textLower.includes('terms')) ||
        (textLower.includes('privacy') && textLower.includes('terms') && textLower.includes('conditions'))) {
      return true;
    }
    
    if (element.querySelector('input[type="email"]') || 
        element.querySelector('input[name*="email"]') ||
        element.querySelector('input[id*="email"]')) {
      if (textLower.includes('newsletter') || textLower.includes('subscribe') ||
          textLower.includes('signup') || textLower.includes('sign-up') ||
          textLower.includes('get the latest') || textLower.includes('inbox') ||
          textLower.includes('marketing cloud')) {
        return true;
      }
    }
    
    const navTextPatterns = NAV_PATTERNS_CONTAINS;
    if (!isSemanticContainer && !isImageOrFigure) {
        const isParagraphOrHeading2 = tagName === 'p' || tagName.match(/^h[1-6]$/);
        if (isParagraphOrHeading2) {
        if (textTrimmed.length < 200 && navTextPatterns.some(pattern => pattern.test(text))) {
          return true;
        }
      } else {
        if (navTextPatterns.some(pattern => pattern.test(text))) {
          return true;
        }
      }
    }
    
    if (!isImageOrFigure) {
      if (textLower.includes('email newsletter') || 
          (textLower.includes('newsletter') && textLower.includes('email')) ||
          textLower.includes('weekly tips') ||
          (textLower.includes('trusted by') && textLower.includes('folks'))) {
        let checkEl = element;
        for (let i = 0; i < 3 && checkEl; i++) {
          if (checkEl.querySelector && checkEl.querySelector('input[type="email"]')) {
            return true;
          }
          checkEl = checkEl.parentElement;
        }
      }
    }
    
    if (text.includes('$') || text.includes('€') || text.includes('£')) {
      const adKeywords = ['video', 'training', 'course', 'get', 'buy', 'purchase', 
                          'money-back', 'guarantee', 'enroll', 'sign up'];
      const hasAdKeywords = adKeywords.some(keyword => textLower.includes(keyword));
      if (hasAdKeywords && (text.includes('$') || text.match(/\$\s*\d+/))) {
        return true;
      }
    }
    
    if (textLower.startsWith('meet ') && 
        (textLower.includes('course') || textLower.includes('book') || 
         textLower.includes('training') || textLower.includes('product'))) {
      return true;
    }
    
    if (isImageOrFigure) {
      let hasExcludedClass = false;
      for (const excluded of EXCLUDED_CLASSES) {
        const pattern = new RegExp(`\\b${excluded}\\b`);
        if (pattern.test(className) || pattern.test(id) ||
            className === excluded || className.startsWith(excluded + '-') || className.endsWith('-' + excluded) ||
            id === excluded || id.startsWith(excluded + '-') || id.endsWith('-' + excluded)) {
          hasExcludedClass = true;
          break;
        }
      }
      if (hasExcludedClass) {
        return true;
      }
    } else {
      for (const excluded of EXCLUDED_CLASSES) {
        if (className.includes(excluded) || id.includes(excluded)) {
          return true;
        }
      }
    }
    
    if (!isSemanticContainer) {
      let parent = element.parentElement;
      if (isImageOrFigure) {
        let iterations = 0;
          const maxIterations = 50;
        while (parent && parent !== document.body && iterations < maxIterations) {
          iterations++;
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          const parentTag = parent.tagName.toLowerCase();
          const clearAdIndicators = [
            /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/,
            'ad-container', 'ad-wrapper', 'ad-box', 'advertisement-container'
          ];
          const isClearAd = clearAdIndicators.some(indicator => {
            if (typeof indicator === 'string') {
              return parentClass.includes(indicator) || parentId.includes(indicator);
            }
            return indicator.test(parentClass) || indicator.test(parentId);
          });
          if (isClearAd || parentTag === 'iframe' || parentTag === 'aside') {
            return true;
          }
          parent = parent.parentElement;
        }
      } else {
          const isParagraphOrHeading3 = tagName === 'p' || tagName.match(/^h[1-6]$/);
        let iterations = 0;
          const maxIterations = 50;
        while (parent && parent !== document.body && iterations < maxIterations) {
          iterations++;
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          const parentText = parent.textContent || '';
          const parentTag = parent.tagName.toLowerCase();
            if (isParagraphOrHeading3) {
            if (parentTag === 'aside' || parentTag === 'nav' || parentTag === 'footer' || parentTag === 'header') {
              return true;
            }
            const clearAdIndicators = [
              /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/,
              'ad-container', 'ad-wrapper', 'ad-box', 'advertisement-container'
            ];
            const isClearAd = clearAdIndicators.some(indicator => {
              if (typeof indicator === 'string') {
                return parentClass.includes(indicator) || parentId.includes(indicator);
              }
              return indicator.test(parentClass) || indicator.test(parentId);
            });
            if (isClearAd) {
              return true;
            }
            if (parentTag === 'section' && 
                (parentClass.includes('related-articles') || parentId.includes('related-articles'))) {
              const articleLinks = parent.querySelectorAll('a[href*="/article/"], a[href*="/post/"], a[href*="/essay/"]');
              if (articleLinks.length >= 2) {
                return true;
              }
            }
          } else {
            if (parentTag === 'section' && 
                (parentClass.includes('related-articles') || parentId.includes('related-articles'))) {
              return true;
            }
            if (navTextPatterns.some(pattern => pattern.test(parentText))) {
              return true;
            }
            if (parentTag === 'aside' && (parentClass.includes('ad') || parentId.includes('ad'))) {
              return true;
            }
            for (const excluded of EXCLUDED_CLASSES) {
              if (parentClass.includes(excluded) || parentId.includes(excluded)) {
                return true;
                }
              }
            }
            parent = parent.parentElement;
        }
      }
    }
    
    return false;
    }
    
    // Metadata extractor module functions (inlined)
    function isValidArticleTitleModule(h1Element) {
      if (!h1Element || !h1Element.textContent) return false;
      const text = h1Element.textContent.trim();
      if (text.length < 5) return false;
      const siteNamePatterns = ['home', 'about', 'contact', 'blog', 'news', 'archive'];
      const lowerText = text.toLowerCase();
      if (siteNamePatterns.some(pattern => lowerText === pattern)) return false;
        return true;
      }
      
    function extractAuthorFromUrlModule(url) {
      if (!url) return null;
      try {
        const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
        if (profileMatch) {
          const slug = profileMatch[1];
          const parts = slug.split(/[-_]/);
          if (parts.length > 1) {
            const name = parts
              .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
              .join(' ');
            if (name.length > 2 && name.length < 100) {
              return name;
            }
          }
          const singlePart = parts[0];
          const camelCaseMatch = singlePart.match(/^([a-z]+)([A-Z][a-z]*)$/);
          if (camelCaseMatch) {
            const name = [
              camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
              camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
            ].join(' ');
            if (name.length > 2 && name.length < 100) {
              return name;
            }
          }
          if (singlePart.length > 6 && /^[a-z]+$/.test(singlePart)) {
            const commonEndings = ['a', 'ia', 'na', 'ra', 'la', 'sa'];
            for (const ending of commonEndings) {
              if (singlePart.endsWith(ending) && singlePart.length > ending.length + 3) {
                const firstPart = singlePart.slice(0, -ending.length);
                const secondPart = singlePart.slice(-ending.length);
                if (firstPart.length >= 3 && firstPart.length <= 15 && 
                    secondPart.length >= 3 && secondPart.length <= 15) {
                  const name = [
                    firstPart.charAt(0).toUpperCase() + firstPart.slice(1),
                    secondPart.charAt(0).toUpperCase() + secondPart.slice(1)
                  ].join(' ');
                  if (name.length > 2 && name.length < 100) {
                    return name;
                  }
                }
              }
            }
            if (singlePart.length > 10) {
              const mid = Math.floor(singlePart.length / 2);
              const firstPart = singlePart.slice(0, mid);
              const secondPart = singlePart.slice(mid);
              if (firstPart.length >= 3 && secondPart.length >= 3) {
                const name = [
                  firstPart.charAt(0).toUpperCase() + firstPart.slice(1),
                  secondPart.charAt(0).toUpperCase() + secondPart.slice(1)
                ].join(' ');
                if (name.length > 2 && name.length < 100) {
                  return name;
                }
              }
            }
          }
          const name = singlePart.charAt(0).toUpperCase() + singlePart.slice(1).toLowerCase();
          if (name.length > 2 && name.length < 100) {
            return name;
          }
        }
      } catch (e) {
        // Continue
      }
      return null;
    }
    
    function getMonthNumberModule(monthName) {
      const months = {
        'january': '01', 'jan': '01',
        'february': '02', 'feb': '02',
        'march': '03', 'mar': '03',
        'april': '04', 'apr': '04',
        'may': '05',
        'june': '06', 'jun': '06',
        'july': '07', 'jul': '07',
        'august': '08', 'aug': '08',
        'september': '09', 'sep': '09', 'sept': '09',
        'october': '10', 'oct': '10',
        'november': '11', 'nov': '11',
        'december': '12', 'dec': '12'
      };
      return months[monthName.toLowerCase()] || null;
    }
    
    function parseDateToISOModule(dateStr, getMonthNumber) {
      if (!dateStr) return null;
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return isoMatch[0];
      }
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        // Continue with regex parsing
      }
      const ordinalMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
      if (ordinalMatch) {
        const day = ordinalMatch[1].padStart(2, '0');
        const monthName = ordinalMatch[2];
        const year = ordinalMatch[3];
        const month = getMonthNumber(monthName);
        if (month) {
          return `${year}-${month}-${day}`;
        }
      }
      const monthYearMatch = dateStr.match(/(\w+)\s+(\d{4})/i);
      if (monthYearMatch) {
        const monthName = monthYearMatch[1];
        const year = monthYearMatch[2];
        const month = getMonthNumber(monthName);
        if (month) {
          return `${year}-${month}`;
        }
      }
      const yearMatch = dateStr.match(/^(\d{4})$/);
      if (yearMatch) {
        return yearMatch[1];
      }
      return null;
    }
    
    // Content cleaner module functions (inlined)
    function cleanHeadingTextModule(headingText) {
      if (!headingText) return '';
      return headingText
        .replace(/\uFFFC/g, '')
        .replace(/<OBJ>/g, '')
        .replace(/<\/OBJ>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    }
    
    // Create helper objects for dependency injection
    const helpers = {
      isFootnoteLink,
      isIcon,
      toAbsoluteUrl: (url) => toAbsoluteUrl(url, baseUrl),
      normalizeImageUrl
    };
    
    const constantsForModules = {
      EXCLUDED_CLASSES,
      PAYWALL_CLASSES,
      NAV_PATTERNS_CONTAINS,
      COURSE_AD_PATTERNS,
      LOGO_PATTERNS: [
        'logo', 'brand', 'icon', 'badge', 'watermark', 'sprite', 'spacer', 'blank', 'clear', 'pixel',
        'youtube', 'facebook', 'twitter', 'instagram', 'linkedin', 'pinterest', 'rss',
        'social-media', 'social-icon', 'share-icon', 'share-button',
        'youtube-white-logo', 'youtube-logo', 'yt-logo',
        'facebook-logo', 'twitter-logo', 'instagram-logo',
        'arrow', 'chevron', 'bullet', 'dot', 'gradient', 'bg', 'background', 'shadow', 'border',
        'divider', 'line', 'separator', 'spinner', 'loader', 'loading',
        'placeholder', 'default', 'avatar', 'user', 'profile', 'gravatar',
        'data:image/gif;base64,r0lgodlh',
        'data:image/png;base64,i'
      ]
    };
    
    // Image processor module functions
    // These are wrappers that call the inlined module functions with dependencies
    function isPlaceholderUrl(url) {
      // Module function doesn't need dependencies
      return isPlaceholderUrlModule(url);
    }
    
    function getBestSrcsetUrl(srcset) {
      // Module function needs isPlaceholderUrl as dependency
      return getBestSrcsetUrlModule(srcset, isPlaceholderUrl);
    }
    
    function extractBestImageUrl(imgElement) {
      // Module function needs isPlaceholderUrl and getBestSrcsetUrl as dependencies
      return extractBestImageUrlModule(imgElement, isPlaceholderUrl, getBestSrcsetUrl);
    }
    
    function isTrackingPixel(img) {
      // Module function doesn't need dependencies
      return isTrackingPixelModule(img);
    }
    
    function isDecorativeImage(img) {
      // Module function needs constants with LOGO_PATTERNS
      return isDecorativeImageModule(img, constantsForModules);
    }
    
    function getImageCaption(img) {
      // Module function doesn't need dependencies
      return getImageCaptionModule(img);
    }
    
    // Content finder module functions
    function isLikelyContentContainer(element) {
      // Module function doesn't need dependencies
      return isLikelyContentContainerModule(element);
    }
    
    function calculateContentScore(element) {
      // Module function needs isLikelyContentContainer as dependency
      return calculateContentScoreModule(element, isLikelyContentContainer);
    }
    
    // Original calculateContentScore implementation removed - using module version above
    
    // Use module function for findMainContent
    // Note: The module function findMainContent is inlined above and takes dependencies as parameters
    // We create a wrapper that calls it with the correct dependencies
    // The inlined findMainContent from content-finder.js module expects:
    // findMainContent(isExcluded, isLikelyContentContainer, calculateContentScore)
    function findMainContent() {
      // Call the inlined module function with dependencies
      // All these functions are inlined from their respective modules
      return findMainContentModule(isExcluded, isLikelyContentContainer, calculateContentScore);
    }
    
    // Element filter module functions
    function isExcluded(element) {
      // Module function needs constants and helpers as dependencies
      const helpers = {
        isFootnoteLink: isFootnoteLink,
        isIcon: isIcon
      };
      return isExcludedModule(element, constantsForModules, helpers);
    }
    
    // Original isExcluded implementation removed - using module version above
    
    // Extract metadata
    const metadata = {
      title: '',
      author: '',
      publishDate: ''
    };
    
    // Title - prefer h1 inside article/main, then first h1, then document.title
    // This avoids picking up site/publication titles that appear before article content
    // But with fallback for pages without article/main or multi-chapter books
    let h1 = null;
    let h1FromArticle = null;
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    
    // Helper: Check if h1 looks like a valid article title (not site name)
    function isValidArticleTitle(h1Element) {
      // Module function doesn't need dependencies
      return isValidArticleTitleModule(h1Element);
    }
    
    
    // First try: h1 inside article
    if (article) {
      h1FromArticle = article.querySelector('h1');
      if (h1FromArticle && isValidArticleTitle(h1FromArticle)) {
        h1 = h1FromArticle;
      }
    }
    
    // Second try: h1 inside main (if not in article or article h1 was invalid)
    if (!h1 && main) {
      const h1FromMain = main.querySelector('h1');
      if (h1FromMain && isValidArticleTitle(h1FromMain)) {
        h1 = h1FromMain;
      }
    }
    
    // Third try: first h1 on page (fallback for pages without article/main or multi-chapter books)
    // This is safe because:
    // - Pages without article/main will use this (old behavior preserved)
    // - Multi-chapter books have h1 OUTSIDE main (as per prompts.js documentation)
    // - Only used if article/main h1 was not found or invalid
    if (!h1) {
      const firstH1 = document.querySelector('h1');
      if (firstH1 && isValidArticleTitle(firstH1)) {
        h1 = firstH1;
      }
    }
    
    // Final fallback: use article/main h1 even if validation failed (better than nothing)
    if (!h1 && h1FromArticle) {
      h1 = h1FromArticle;
    }
    
    if (h1 && h1.textContent.trim()) {
      const h1Text = h1.textContent.trim();
      // Clean title from OBJ markers and Object Replacement Character (U+FFFC)
      // Use cleanHeadingText from content-cleaner module
      metadata.title = cleanHeadingTextModule(h1Text) || h1Text;
    } else {
      metadata.title = document.title || '';
    }
    
    // Metadata extractor module functions
    function extractAuthorFromUrl(url) {
      // Module function doesn't need dependencies
      return extractAuthorFromUrlModule(url);
    }
    
    function getMonthNumber(monthName) {
      // Module function doesn't need dependencies
      return getMonthNumberModule(monthName);
    }
    
    function parseDateToISO(dateStr) {
      // Module function needs getMonthNumber as dependency
      return parseDateToISOModule(dateStr, getMonthNumber);
    }
    
    // Original extractAuthorFromUrl implementation removed - using module version above
    
    const authorSelectors = [
      'meta[name="author"]',
      'meta[name="citation_author"]', // Noema uses this
      'meta[property="article:author"]',
      '[rel="author"]',
      '.author', '.byline', '.meta-author', '.meta-text.meta-author',
      '[itemprop="author"]',
      'a[rel="author"]',
      'a[href*="/author/"]', // Link to author page
      'a[href*="/profile/"]' // Link to profile page (The Guardian uses this)
    ];
    
    for (const selector of authorSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          // First try to get text content
          let authorText = element.textContent || element.getAttribute('content') || '';
          
          // If text is empty or looks like a URL, try to extract from href
          if (!authorText.trim() || authorText.includes('http://') || authorText.includes('https://') || authorText.includes('/profile/') || authorText.includes('/author/')) {
            const href = element.getAttribute('href') || '';
            if (href) {
              const extractedName = extractAuthorFromUrl(href);
              if (extractedName) {
                metadata.author = extractedName;
                break;
              }
              // If href is a URL, use it for extraction
              authorText = href;
            }
          }
          
          if (authorText.trim()) {
            // If it's still a URL, try to extract name from it
            if (authorText.includes('/profile/') || authorText.includes('/author/')) {
              const extractedName = extractAuthorFromUrl(authorText);
              if (extractedName) {
                metadata.author = extractedName;
                break;
              }
            }
            
            // Otherwise, clean and use the text
            const cleaned = authorText.trim().replace(/^(от|by|автор:|written by|von|par|por|da|di):\s*/i, '').trim();
            // Don't use if it's still a URL
            if (cleaned && !cleaned.includes('http://') && !cleaned.includes('https://') && !cleaned.includes('/profile/') && !cleaned.includes('/author/')) {
              metadata.author = cleaned;
              if (metadata.author) break;
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // If author not found, try to extract from "By Author Name" pattern in article
    if (!metadata.author) {
      try {
        const article = document.querySelector('article');
        if (article) {
          // Look for "By Author Name" pattern in metadata area
          const metaElements = article.querySelectorAll('.post-author, .meta-wrapper, .byline, [class*="author"]');
          for (const el of Array.from(metaElements)) {
            const text = el.textContent || '';
            // Match "By Author Name" or "Author Name" patterns
            const byMatch = text.match(/by\s+([A-Z][a-zA-Z\s]+?)(?:\s+September|\s+\d|$)/i);
            if (byMatch) {
              const authorName = byMatch[1].trim();
              if (authorName.length > 2 && authorName.length < 100) {
                metadata.author = authorName;
                break;
              }
            }
            // Also check for author link - extract text, not href
            // Check both /author/ and /profile/ patterns
            // IMPORTANT: Check ALL author links, not just the first one (first might be image-only)
            const authorLinks = el.querySelectorAll('a[href*="/author/"], a[href*="/profile/"]');
            for (const authorLink of Array.from(authorLinks)) {
              // First try to extract text from link
              let authorText = authorLink.textContent.trim();
              
              // Skip if link contains only an image (no text) - this is common for author profile images
              if (!authorText && authorLink.querySelector('img')) {
                continue; // Try next link
              }
              
              // If text is empty or looks like a URL, extract from href
              if (!authorText || authorText.includes('http://') || authorText.includes('https://') || authorText.includes('/profile/') || authorText.includes('/author/')) {
                const href = authorLink.getAttribute('href') || '';
                const extractedName = extractAuthorFromUrl(href);
                if (extractedName) {
                  metadata.author = extractedName;
                  break;
                }
                // If extraction failed, try href as fallback
                if (href) {
                  const extractedFromHref = extractAuthorFromUrl(href);
                  if (extractedFromHref) {
                    metadata.author = extractedFromHref;
                    break;
                  }
                }
              } else {
                // Use text content if it looks like a name
                if (authorText.length > 2 && authorText.length < 100) {
                  // Remove "By " prefix if present
                  metadata.author = authorText.replace(/^by\s+/i, '').trim();
                  if (metadata.author) break;
                }
              }
            }
            if (metadata.author) break;
            
            // Also check for any link with author-like text
            const allLinks = el.querySelectorAll('a');
            for (const link of Array.from(allLinks)) {
              const linkText = link.textContent.trim();
              // Check if link text looks like an author name (2-4 words, starts with capital)
              const namePattern = /^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/;
              if (namePattern.test(linkText) && linkText.length > 5 && linkText.length < 50) {
                metadata.author = linkText;
                break;
              }
            }
            if (metadata.author) break;
          }
        }
      } catch (e) {
        // Continue if extraction fails
      }
    }
    
    // Publish date
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="datePublished"]',
      'meta[name="date"]',
      'meta[name="citation_date"]', // Noema uses this
      'time[datetime]',
      'time[pubdate]',
      '[itemprop="datePublished"]',
      '.published', '.date', '.meta-date', '.meta-text.meta-date', 'span.meta-date'
    ];
    
    for (const selector of dateSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const dateValue = element.getAttribute('datetime') || element.getAttribute('content') || element.textContent || '';
          if (dateValue.trim()) {
            // Try to parse date
            try {
              const date = new Date(dateValue);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                metadata.publishDate = `${year}-${month}-${day}`;
                break;
              }
            } catch (e) {
              // Try regex patterns for ISO format
              const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (isoMatch) {
                metadata.publishDate = isoMatch[0];
                break;
              }
              // Try to parse "September 15, 2022" format
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                                  'july', 'august', 'september', 'october', 'november', 'december'];
              const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const dateMatch = dateValue.match(/(\w+)\s+(\d+),?\s+(\d{4})/i);
              if (dateMatch) {
                const monthName = dateMatch[1].toLowerCase();
                const day = dateMatch[2].padStart(2, '0');
                const year = dateMatch[3];
                let monthIndex = monthNames.indexOf(monthName);
                if (monthIndex === -1) {
                  monthIndex = monthAbbr.indexOf(monthName);
                }
                if (monthIndex !== -1) {
                  const month = String(monthIndex + 1).padStart(2, '0');
                  metadata.publishDate = `${year}-${month}-${day}`;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // If date not found in meta tags, try to find it in article text
    if (!metadata.publishDate) {
      try {
        // Look for date pattern in article header/metadata area
        const article = document.querySelector('article');
        if (article) {
          // Check metadata area (usually near author)
          const metaElements = article.querySelectorAll('.meta-date, .meta-text.meta-date, .post-date, .published-date, [class*="date"]');
          for (const el of Array.from(metaElements)) {
            const text = el.textContent.trim();
            const dateMatch = text.match(/(\w+)\s+(\d+),?\s+(\d{4})/i);
            if (dateMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                                  'july', 'august', 'september', 'october', 'november', 'december'];
              const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthName = dateMatch[1].toLowerCase();
              const day = dateMatch[2].padStart(2, '0');
              const year = dateMatch[3];
              let monthIndex = monthNames.indexOf(monthName);
              if (monthIndex === -1) {
                monthIndex = monthAbbr.indexOf(monthName);
              }
              if (monthIndex !== -1) {
                const month = String(monthIndex + 1).padStart(2, '0');
                metadata.publishDate = `${year}-${month}-${day}`;
                break;
              }
            }
          }
          
          // If still not found, search in first few paragraphs for date pattern
          if (!metadata.publishDate) {
            const firstElements = article.querySelectorAll('p, span, div, time');
            for (const el of Array.from(firstElements).slice(0, 20)) {
              const text = el.textContent.trim();
              // Look for date pattern like "September 15, 2022" in short text
              if (text.length < 100) {
                const dateMatch = text.match(/^(\w+)\s+(\d+),?\s+(\d{4})$/i);
                if (dateMatch) {
                  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                                      'july', 'august', 'september', 'october', 'november', 'december'];
                  const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                     'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                  const monthName = dateMatch[1].toLowerCase();
                  const day = dateMatch[2].padStart(2, '0');
                  const year = dateMatch[3];
                  let monthIndex = monthNames.indexOf(monthName);
                  if (monthIndex === -1) {
                    monthIndex = monthAbbr.indexOf(monthName);
                  }
                  if (monthIndex !== -1) {
                    const month = String(monthIndex + 1).padStart(2, '0');
                    metadata.publishDate = `${year}-${month}-${day}`;
                    break;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue if date parsing fails
      }
    }
    
    // Find and extract content
    const mainContent = findMainContent();
    
    // Extract featured/hero image BEFORE processing main content
    // Look for featured image in meta tags first
    let featuredImage = null;
    const featuredImageSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="article:image"]',
      'meta[name="image"]',
      '[itemprop="image"]'
    ];
    
    for (const selector of featuredImageSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const imageUrl = element.getAttribute('content') || element.getAttribute('src') || '';
          if (imageUrl && !imageUrl.includes('logo') && !imageUrl.includes('icon')) {
            featuredImage = toAbsoluteUrl(imageUrl, baseUrl);
            break;
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // If not found in meta tags, look for large image at the start of article
    if (!featuredImage && mainContent) {
      try {
        // Look for first large image in article (before first paragraph)
        // Check both inside mainContent and in article header (before mainContent)
        const article = document.querySelector('article');
        const searchContainers = article ? [article, mainContent] : [mainContent];
        
        for (const container of searchContainers) {
          const firstElements = Array.from(container.querySelectorAll('img, figure')).slice(0, 10);
          for (const el of firstElements) {
            const img = el.tagName.toLowerCase() === 'img' ? el : el.querySelector('img');
            if (img && img instanceof HTMLImageElement) {
              const src = extractBestImageUrl(img);
              if (src && !isTrackingPixel(img) && !isDecorativeImage(img)) {
                // Check if image is reasonably large (likely featured image)
                const naturalWidth = img.naturalWidth || img.width || 0;
                const naturalHeight = img.naturalHeight || img.height || 0;
                
                // For lazy-loaded images, dimensions might be 0, so check other indicators
                const hasLargeDimensions = naturalWidth >= 400 || naturalHeight >= 300;
                const isInFigure = el.tagName.toLowerCase() === 'figure' || img.closest('figure');
                const hasCaption = isInFigure && el.querySelector('figcaption');
                const isFirstImage = firstElements.indexOf(el) === 0;
                
                // Accept if:
                // 1. Has large dimensions, OR
                // 2. Is in a figure with caption (likely featured), OR
                // 3. Is the very first image and not decorative
                if (hasLargeDimensions || (hasCaption && isFirstImage) || (isFirstImage && naturalWidth === 0 && naturalHeight === 0)) {
                  featuredImage = toAbsoluteUrl(src, baseUrl);
                  break;
                }
              }
            }
            if (featuredImage) break;
          }
          if (featuredImage) break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Extract standfirst/subtitle/deck (introductory text before main content)
    let standfirst = null;
    let standfirstElement = null; // Track the element to exclude it from main content
    if (mainContent) {
      try {
        const standfirstSelectors = [
          '.standfirst', '.subtitle', '.deck', '.lede', '.intro', '.article__subhead',
          '[class*="standfirst"]', '[class*="subtitle"]', '[class*="deck"]',
          '[class*="intro"]', '[class*="summary"]', '[class*="subhead"]'
        ];
        
        for (const selector of standfirstSelectors) {
          const element = mainContent.querySelector(selector);
          if (element) {
            const text = element.textContent.trim();
            // Standfirst is usually 50-500 characters
            if (text.length >= 50 && text.length <= 500) {
              standfirst = text;
              standfirstElement = element;
              break;
            }
          }
        }
        
        // If not found, look for first paragraph that might be standfirst
        // Be more conservative: only if it's clearly a subtitle (shorter, no links, specific patterns)
        if (!standfirst) {
          const firstP = mainContent.querySelector('p');
          if (firstP) {
            const text = firstP.textContent.trim();
            // More restrictive: standfirst should be shorter (50-200 chars, not 300)
            // and should not look like regular article content
            if (text.length >= 50 && text.length <= 200) {
              const linkCount = firstP.querySelectorAll('a').length;
              // No links, and should not start with common article opening phrases
              if (linkCount === 0) {
                // Check if it doesn't look like regular article content
                // (e.g., doesn't start with "The", "A", "In", "When", etc. - common article starters)
                const firstWords = text.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
                const commonStarters = ['the ', 'a ', 'an ', 'in ', 'on ', 'at ', 'when ', 'where ', 'why ', 'how ', 'what ', 'this ', 'that ', 'these ', 'those '];
                const looksLikeArticleStart = commonStarters.some(starter => firstWords.startsWith(starter));
                
                // Only treat as standfirst if it doesn't look like regular article content
                if (!looksLikeArticleStart) {
                  standfirst = text;
                  standfirstElement = firstP;
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Initialize deduplication set early (before fallback, so it's available everywhere)
    const addedHeadings = new Set();
    const mainTitleText = metadata.title 
      ? metadata.title.toLowerCase().trim()
          .replace(/\s*\[?obj\]?\s*/gi, '')
          .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
          .trim()
      : '';
    
    // IMPORTANT: Add main title to addedHeadings immediately to prevent duplicates
    if (mainTitleText) {
      addedHeadings.add(mainTitleText);
    }
    
    if (!mainContent) {
      
      // Fallback: try to find any article or main element, even without strict checks
      const fallbackArticle = document.querySelector('article');
      const fallbackMain = document.querySelector('main');
      const fallbackContent = fallbackArticle || fallbackMain;
      
      if (fallbackContent) {
        // Use fallback but with less strict extraction
        const fallbackElements = Array.from(fallbackContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, figure, blockquote, pre, code, ul, ol, table'));
        if (debugInfo) debugInfo.foundElements = fallbackElements.length;
        
        if (fallbackElements.length > 0) {
          
          let excludedCount = 0;
          let processedCount = 0;
          
          // Process fallback elements (simplified)
          for (const element of fallbackElements.slice(0, 100)) { // Limit to first 100 elements
            // Skip if element is excluded
            if (isExcluded(element)) {
              excludedCount++;
              continue;
            }
            
            processedCount++;
            const tagName = element.tagName.toLowerCase();
            if (tagName.match(/^h[1-6]$/)) {
              const level = parseInt(tagName.substring(1));
              const text = element.textContent.trim();
              if (text && text.length > 3) {
                // Clean heading text - remove "OBJ" markers and Object Replacement Character
                const cleanedText = text.replace(/<[^>]+>/g, '').trim()
                  .replace(/\s*\[?obj\]?\s*/gi, '')
                  .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
                  .trim();
                
                // Skip if cleaned heading is empty
                if (!cleanedText || cleanedText.length < 3) {
                  continue;
                }
                
                // Normalize for comparison
                const normalizedText = cleanedText.toLowerCase().trim();
                
                // CRITICAL: Check if this is the main title FIRST
                if (mainTitleText && normalizedText === mainTitleText) {
                  continue;
                }
                
                // CRITICAL: Check if we've already added this heading (Set lookup is O(1))
                if (addedHeadings.has(normalizedText)) {
                  continue;
                }
                
                // Add to set BEFORE pushing to content (prevents duplicates)
                addedHeadings.add(normalizedText);
                content.push({
                  type: 'heading',
                  level: level,
                  text: cleanedText,
                  id: element.id || null
                });
              }
            } else if (tagName === 'p') {
              const text = element.textContent.trim();
              if (text && text.length > 10) {
                content.push({
                  type: 'paragraph',
                  text: element.innerHTML,
                  html: element.innerHTML
                });
              }
            } else if (tagName === 'img' || tagName === 'figure') {
              const img = tagName === 'img' ? element : element.querySelector('img');
              if (img) {
                const src = extractBestImageUrl(img);
                const isTracking = src ? isTrackingPixel(img) : false;
                const isDecorative = src ? isDecorativeImage(img) : false;
                if (src && !isTracking && !isDecorative) {
                  const imgElement = img instanceof HTMLImageElement ? img : null;
                  content.push({
                    type: 'image',
                    src: toAbsoluteUrl(src, baseUrl),
                    alt: imgElement?.alt || '',
                    caption: getImageCaption(img)
                  });
                }
              }
            }
          }
          
          if (debugInfo) {
            debugInfo.processedCount = processedCount;
            debugInfo.skippedCount = excludedCount;
          }
          
          if (content.length > 0) {
            // FINAL SAFETY CHECK: Remove any duplicate headings
            const seenHeadings = new Set();
            const deduplicatedContent = [];
            let duplicateCount = 0;
            
            for (const item of content) {
              if (item.type === 'heading' && item.text) {
                const normalized = item.text.toLowerCase().trim()
                  .replace(/\s*\[?obj\]?\s*/gi, '')
                  .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
                  .trim();
                if (seenHeadings.has(normalized)) {
                  duplicateCount++;
                  continue;
                }
                seenHeadings.add(normalized);
              }
              deduplicatedContent.push(item);
            }
            
            if (debugInfo) {
              const contentTypes = deduplicatedContent.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1;
                return acc;
              }, {});
              debugInfo.contentTypes = contentTypes;
              debugInfo.imageCount = ((contentTypes['image'] || 0));
            }
            
            return {
              title: metadata.title,
              author: metadata.author,
              publishDate: metadata.publishDate,
              content: deduplicatedContent,
              debugInfo: debugInfo
            };
          }
        }
      }
      
      // Last resort: return empty result
      return {
        title: metadata.title,
        author: metadata.author,
        publishDate: metadata.publishDate,
        content: [],
        debugInfo: debugInfo
      };
    }
    
    // Extract content elements - sort so figures come before standalone images
    // Also exclude iframe elements and their containers
    const allElements = Array.from(mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, figure, blockquote, pre, code, ul, ol, table'));
    const imageElements = allElements.filter(el => {
      const tagName = el.tagName.toLowerCase();
      return tagName === 'img' || tagName === 'figure';
    });
    if (debugInfo) {
      debugInfo.foundElements = allElements.length;
      debugInfo.imageCount = imageElements.length;
    }
    
    // Also find "About the Author" and similar sections that might be useful
    const authorSections = Array.from(mainContent.querySelectorAll('section, div')).filter(el => {
      const className = String(el.className || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const text = el.textContent.trim().toLowerCase();
      return (className.includes('about-author') || className.includes('author-info') || 
              className.includes('author-bio') || id.includes('about-author') ||
              text.includes('about the author') || text.includes('about author')) &&
             !isExcluded(el) && text.length > 50;
    });
    
    // Add author section elements to the list
    for (const authorSection of authorSections) {
      const sectionElements = authorSection.querySelectorAll('h1, h2, h3, h4, h5, h6, p');
      allElements.push(...Array.from(sectionElements));
    }
    
    // Filter out elements that are inside excluded containers (ads, navigation, etc.)
    // CRITICAL: Since we're already inside mainContent, be VERY lenient
    // Only exclude elements that are clearly not content (ads, navigation, metadata)
    let excludedImageCount = 0;
    let excludedByType = {};
    const filteredElements = allElements.filter(el => {
      const tagName = el.tagName.toLowerCase();
      
      // STEP 1: Check if element itself is excluded (hidden, tracking pixel, etc.)
      // This is the most basic check - exclude only if element itself is clearly not content
      if (tagName === 'figure' || tagName === 'img') {
        if (isExcluded(el)) {
          excludedImageCount++;
          excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
          return false;
        }
      } else {
        // For paragraphs/headings, only exclude if element itself is clearly not content
        // Don't exclude based on parent checks - we're already in mainContent
        if (isExcluded(el)) {
          excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
          return false;
        }
      }
      
      // STEP 2: For elements inside mainContent, only exclude if they're in a clearly separate section
      // Check for related-articles sections - but only if it's clearly a separate section with multiple links
      let checkEl = el;
      let foundRelatedSection = false;
      while (checkEl && checkEl !== mainContent) {
        const checkTag = checkEl.tagName.toLowerCase();
        const checkClass = String(checkEl.className || '').toLowerCase();
        const checkId = (checkEl.id || '').toLowerCase();
        
        // Only exclude if it's a section specifically for related articles
        // AND it contains multiple article links (clear related articles section)
        if (checkTag === 'section' && 
            (checkClass.includes('related-articles') || checkId.includes('related-articles'))) {
          const articleLinks = checkEl.querySelectorAll('a[href*="/article/"], a[href*="/post/"], a[href*="/essay/"]');
          // Only exclude if it has multiple article links (clear related articles section)
          if (articleLinks.length >= 2) {
            foundRelatedSection = true;
            break;
          }
        }
        
        checkEl = checkEl.parentElement;
      }
      
      // For non-image elements, exclude if in clear related articles section
      if (foundRelatedSection && tagName !== 'figure' && tagName !== 'img') {
        excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
          return false;
        }
        
      // STEP 3: For images, check if they're decorative (logos, icons, etc.)
      if (tagName === 'figure' || tagName === 'img') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        if (img && isDecorativeImage(img)) {
          excludedImageCount++;
          excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
          return false;
        }
        
        // For images, check parent for clear ad containers
      let parent = el.parentElement;
      let iterations = 0;
      const maxIterations = 50; // Safety limit to prevent infinite loops
      while (parent && parent !== mainContent && iterations < maxIterations) {
        iterations++;
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          const parentTag = parent.tagName.toLowerCase();
          
          // Only exclude if parent is clearly an ad (not just any excluded class)
          const clearAdIndicators = [
            /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/,
            'ad-container', 'ad-wrapper', 'ad-box', 'advertisement-container',
            'ad-banner', 'ad-sidebar', 'ad-header', 'ad-footer'
          ];
          const isClearAd = clearAdIndicators.some(indicator => {
            if (typeof indicator === 'string') {
              return parentClass.includes(indicator) || parentId.includes(indicator);
            }
            return indicator.test(parentClass) || indicator.test(parentId);
          });
          
          // Also exclude if parent is iframe or aside (clear non-content)
          if (isClearAd || (parentTag === 'iframe' || parentTag === 'aside')) {
            excludedImageCount++;
            excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
            return false;
          }
          
        parent = parent.parentElement;
        }
      }
      
      // STEP 4: For paragraphs/headings inside mainContent, include them by default
      // Only exclude if they're in a clearly separate section (already checked above)
      // Don't check parent elements - we're already in mainContent, so they're likely content
      
      return true;
    });
    
    const filteredImageElements = filteredElements.filter(el => {
      const tagName = el.tagName.toLowerCase();
      return tagName === 'img' || tagName === 'figure';
    });
    if (debugInfo) {
      debugInfo.filteredElements = filteredElements.length;
      debugInfo.excludedImageCount = excludedImageCount;
      debugInfo.filteredImageCount = filteredImageElements.length;
      debugInfo.excludedByType = excludedByType;
    }
    
    // Count filtered elements by type for debugging (only if debug enabled)
    const filteredByType = {};
    filteredElements.forEach(el => {
      const tagName = el.tagName.toLowerCase();
      filteredByType[tagName] = (filteredByType[tagName] || 0) + 1;
    });
    if (debugInfo) debugInfo.filteredByType = filteredByType;
    
    // Count all elements by type for debugging (only if debug enabled)
    const allByType = {};
    allElements.forEach(el => {
      const tagName = el.tagName.toLowerCase();
      allByType[tagName] = (allByType[tagName] || 0) + 1;
    });
    if (debugInfo) debugInfo.allByType = allByType;
    
    // CRITICAL: Maintain original DOM order - don't sort!
    // Images should appear where they are in the original article, not all at the beginning
    // Use compareDocumentPosition to maintain DOM order
    const elements = filteredElements.sort((a, b) => {
      // Compare document position to maintain DOM order
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1; // a comes before b
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1; // b comes before a
      }
      return 0; // Same position (shouldn't happen)
    });
    
    // Track images already processed in figures to avoid duplicates
    // Note: addedHeadings and mainTitleText are already initialized above (before findMainContent)
    const processedImages = new Set();
    
    // Add featured image at the beginning if found
    // But only if it's not already in the content (to avoid duplicates)
    if (featuredImage) {
      // Normalize URL for comparison
      const normalizedFeatured = normalizeImageUrl(featuredImage);
      // Mark it as processed so it won't be added again during element processing
      processedImages.add(normalizedFeatured);
      // Add it at the beginning
      content.push({
        type: 'image',
        src: featuredImage,
        alt: '',
        caption: '',
        isFeatured: true
      });
    }
    
    // Add standfirst/subtitle as a subtitle at the beginning if found
    if (standfirst) {
      content.push({
        type: 'subtitle',
        text: standfirst,
        html: `<p class="standfirst">${standfirst}</p>`,
        isStandfirst: true
      });
    }
    
    // Element filter module functions
    function isNavigationParagraph(text) {
      // Module function needs NAV_PATTERNS_STARTS_WITH and PAYWALL_PATTERNS as dependencies
      return isNavigationParagraphModule(text, NAV_PATTERNS_STARTS_WITH, PAYWALL_PATTERNS);
    }
    
    let processedCount = 0;
    let skippedCount = 0;
    
    // Safety check: ensure elements is defined
    if (!elements || !Array.isArray(elements)) {
      throw new Error(`elements is not defined or not an array. filteredElements: ${typeof filteredElements}, mainContent: ${!!mainContent}`);
    }
    
    for (const element of elements) {
      // Get tag name first - used throughout
      const tagName = element.tagName.toLowerCase();
      const isImageOrFigure = tagName === 'img' || tagName === 'figure';
      
      // For elements inside main content, only exclude if clearly not content
      // (e.g., hidden elements or obvious non-content like ads)
      // For images/figures, be more lenient with visibility checks (lazy loading)
      // Only skip if clearly hidden AND not a lazy-loaded image
      if (!isImageOrFigure) {
        let style;
        try {
          style = window.getComputedStyle(element);
        } catch (e) {
          // Element might be in iframe or detached, continue processing
          // Don't skip based on style check failure
        }
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          skippedCount++;
          continue;
        }
      } else {
        // For images/figures, be very lenient - only skip if completely hidden
        // Many images are hidden via opacity for fade-in effects but have valid src
        let style;
        try {
          style = window.getComputedStyle(element);
        } catch (e) {
          // Element might be in iframe or detached, continue processing
          // Don't skip based on style check failure
        }
        // Only skip if display is none or visibility is hidden (not opacity)
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          // Check if it's lazy-loaded - if so, don't skip
          let hasLazySrc = false;
          if (tagName === 'figure') {
            const img = element.querySelector('img');
            if (img) {
              hasLazySrc = img.hasAttribute('data-src') || 
                          img.hasAttribute('data-lazy-src') ||
                          img.hasAttribute('data-original') ||
                          img.hasAttribute('data-srcset');
            }
          } else {
            hasLazySrc = element.hasAttribute('data-src') || 
                        element.hasAttribute('data-lazy-src') ||
                        element.hasAttribute('data-original') ||
                        element.hasAttribute('data-srcset');
          }
          // Only skip if hidden AND not lazy-loaded
          if (!hasLazySrc) {
            skippedCount++;
            continue;
          }
        }
        // Don't skip images based on opacity alone - they may be hidden for fade-in effects
      }
      
      // Only exclude if element has strong exclusion indicators
      // BUT: Don't exclude images/figures unless they're clearly ads
      const className = String(element.className || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      
      const strongExclusions = [
        'ad', 'advertisement', 'ads', 'sponsor', 'sponsored', 'advert',
        'comment', 'comments', 'disqus',
        'read-more', 'readmore', 'keep-reading', 'subscribe', 'paywall', 'gate',
        'newsletter', 'newsletter-signup', 'subscribe-box',
        'support', 'donate', 'donation',
        'related', 'recommended', 'also-in', 'you-might-also-like',
        'next-article', 'previous-article', 'article-nav'
      ];
      
      // For images/figures, only exclude if they're clearly ads
      // Use word boundaries to avoid false positives (e.g., "lead-article-image" contains "ad" but isn't an ad)
      if (isImageOrFigure) {
        // Check for ad-related classes with word boundaries
        const adPatterns = [
          /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/, /\badvert\b/
        ];
        const hasAdPattern = adPatterns.some(pattern => pattern.test(className) || pattern.test(id));
        
        // Also check for specific ad-related class names (whole class names, not substrings)
        const adClassNames = ['ad', 'advertisement', 'ads', 'sponsor', 'sponsored', 'advert'];
        const hasAdClass = adClassNames.some(adClass => 
          className === adClass || 
          className.startsWith(adClass + '-') || 
          className.endsWith('-' + adClass) ||
          className.includes('-' + adClass + '-') ||
          id === adClass ||
          id.startsWith(adClass + '-') ||
          id.endsWith('-' + adClass) ||
          id.includes('-' + adClass + '-')
        );
        
        if (hasAdPattern || hasAdClass) {
          skippedCount++;
          continue;
        }
      } else {
        // For other elements, use normal exclusion logic
        // But also use word boundaries to avoid false positives
        const isStronglyExcluded = strongExclusions.some(excl => {
          // Check for whole word match or class name boundaries
          const pattern = new RegExp(`\\b${excl}\\b`);
          return pattern.test(className) || pattern.test(id) ||
                 className === excl || className.startsWith(excl + '-') || className.endsWith('-' + excl) ||
                 id === excl || id.startsWith(excl + '-') || id.endsWith('-' + excl);
        });
        if (isStronglyExcluded) {
          skippedCount++;
          continue;
        }
      }
      
      // Check if element is inside an iframe container (likely ad)
      // BUT: For images/figures, be more careful - only exclude if clearly an ad
      let parent = element.parentElement;
      let isInIframeAd = false;
      if (!isImageOrFigure) {
        // For non-image elements, use original logic
        let iterations = 0;
        const maxIterations = 50; // Safety limit to prevent infinite loops
        while (parent && parent !== mainContent && iterations < maxIterations) {
          iterations++;
          if (parent.tagName.toLowerCase() === 'iframe' || 
              (parent.querySelector('iframe') && (className.includes('ad') || id.includes('ad')))) {
            isInIframeAd = true;
            break;
          }
          parent = parent.parentElement;
        }
      } else {
        // For images/figures, only exclude if parent has clear ad indicators (whole words)
        let iterations = 0;
        const maxIterations = 50; // Safety limit to prevent infinite loops
        while (parent && parent !== mainContent && iterations < maxIterations) {
          iterations++;
          if (parent.tagName.toLowerCase() === 'iframe') {
            isInIframeAd = true;
            break;
          }
          // Check parent for ad classes with word boundaries
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          const adPattern = /\b(ad|ads|advertisement|sponsor|sponsored|advert)\b/;
          if (adPattern.test(parentClass) || adPattern.test(parentId)) {
            isInIframeAd = true;
            break;
          }
          parent = parent.parentElement;
        }
      }
      if (isInIframeAd) {
        skippedCount++;
        continue;
      }
      
      // tagName already declared at the start of loop
      if (tagName.match(/^h[1-6]$/)) {
        // Skip if this is the standfirst element (already added at the beginning)
        if (standfirstElement && (element === standfirstElement || element.contains(standfirstElement) || standfirstElement.contains(element))) {
          continue;
        }
        
        const level = parseInt(tagName.substring(1));
        const text = element.textContent.trim();
        if (text) {
          // Clean heading text - remove "OBJ" markers, Object Replacement Character, and other artifacts
          // First get text without HTML to properly detect OBJ
          const headingTextWithoutHtml = text.replace(/<[^>]+>/g, '').trim();
          const cleanedHeadingText = headingTextWithoutHtml
            .replace(/\s*\[?obj\]?\s*/gi, '') // Remove [OBJ] or OBJ markers
            .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
            .replace(/\s*#\s*$/, '') // Remove trailing #
            .trim();
          
          // Skip if cleaned heading is empty or just whitespace
          if (!cleanedHeadingText || cleanedHeadingText.length < 3) {
            continue;
          }
          
          // Skip headings that are just numbers (e.g., "1.", "2.", "3.")
          if (/^\d+\.?\s*$/.test(cleanedHeadingText)) {
            continue;
          }
          
          // Also skip if text matches standfirst (to avoid duplicates)
          if (standfirst && cleanedHeadingText === standfirst) {
            continue;
          }
          
          // Normalize for comparison (lowercase, trimmed)
          const normalizedHeading = cleanedHeadingText.toLowerCase().trim();
          
          // CRITICAL: Check if this is the main title FIRST (before any other checks)
          if (mainTitleText && normalizedHeading === mainTitleText) {
            continue;
          }
          
          // CRITICAL: Check if we've already added this exact heading (Set lookup is O(1))
          if (addedHeadings.has(normalizedHeading)) {
            continue;
          }
          
          // Skip subscription/promotional headings
          const headingLower = normalizedHeading;
          if (headingLower.includes("like what you're reading") ||
              headingLower.includes('subscribe to') ||
              headingLower.includes('sign up') ||
              headingLower.includes('subscribe today')) {
            continue;
          }
          
          // Skip "By Author" patterns in headings (e.g., "Title. By Author Name")
          if (headingLower.includes(' by ') && headingLower.split(' by ').length === 2) {
            const parts = headingLower.split(' by ');
            const afterBy = parts[1].trim();
            // If "by" is followed by what looks like a name (2-3 words, capitalized), remove it
            if (/^[a-z]+(\s+[a-z]+){0,2}$/.test(afterBy) && afterBy.length < 50) {
              const titlePart = parts[0].trim();
              if (titlePart.length > 10) {
                // Use only the title part, skip the "By Author" part
                const modifiedHeading = cleanedHeadingText.split(/\.?\s+by\s+/i)[0].trim();
                if (modifiedHeading && modifiedHeading.length >= 3) {
                  const modifiedNormalized = modifiedHeading.toLowerCase().trim();
                  if (!addedHeadings.has(modifiedNormalized)) {
                    addedHeadings.add(modifiedNormalized);
                    content.push({
                      type: 'heading',
                      level: level,
                      text: modifiedHeading,
                      id: element.id || null
                    });
                    processedCount++;
                  }
                }
                continue;
              }
            }
          }
          
          // Skip advertisement headings
          if (headingLower.startsWith('meet ') && 
              (headingLower.includes('course') || headingLower.includes('book') || 
               headingLower.includes('training') || headingLower.includes('product'))) {
            continue;
          }
          
          // Skip "More from" - related articles section
          if (headingLower.includes('more from')) {
            continue;
          }
          
          // Skip headings inside accordion (metadata sections)
          let checkEl = element;
          let isInAccordion = false;
          while (checkEl && checkEl !== mainContent) {
            const checkClass = String(checkEl.className || '').toLowerCase();
            if (checkClass.includes('accordion') || checkClass.includes('c-accordion')) {
              isInAccordion = true;
              break;
            }
            checkEl = checkEl.parentElement;
          }
          if (isInAccordion) {
            continue;
          }
          
          // Skip headings with class "article-section-title" (related articles sections)
          if (className.includes('article-section-title')) {
            continue;
          }
          
          // Check if heading is in a related articles section by class
          let parent = element.parentElement;
          let isInRelatedSection = false;
          let iterations = 0;
          const maxIterations = 50; // Safety limit to prevent infinite loops
          while (parent && parent !== mainContent && iterations < maxIterations) {
            iterations++;
            const parentClass = String(parent.className || '').toLowerCase();
            const parentId = (parent.id || '').toLowerCase();
            if (parentClass.includes('related-articles') || parentId.includes('related-articles') ||
                parentClass.includes('recommended') || parentId.includes('recommended') ||
                parentClass.includes('related-posts') || parentId.includes('related-posts')) {
              isInRelatedSection = true;
              break;
            }
            parent = parent.parentElement;
          }
          
          if (isInRelatedSection) {
            continue;
          }
          // Video training headings - check if next sibling contains price
          let isAdHeading = false;
          if (headingLower.includes('video') && 
              (headingLower.includes('training') || headingLower.includes('course'))) {
            let nextSibling = element.nextElementSibling;
            for (let i = 0; i < 3 && nextSibling; i++) {
              const siblingText = nextSibling.textContent || '';
              if (siblingText.includes('$') || siblingText.includes('price') || 
                  siblingText.includes('money-back') || siblingText.includes('guarantee')) {
                isAdHeading = true;
                break;
              }
              nextSibling = nextSibling.nextElementSibling;
            }
          }
          if (isAdHeading) {
            continue;
          }
          
          // Add to set BEFORE pushing to content (to prevent duplicates)
          // Set.has() is O(1), so no need for additional array check
          addedHeadings.add(normalizedHeading);
          content.push({
            type: 'heading',
            level: level,
            text: cleanedHeadingText,
            id: element.id || null
          });
          processedCount++;
        }
      } else if (tagName === 'p') {
        // Skip if this is the standfirst element (already added at the beginning)
        if (standfirstElement && (element === standfirstElement || element.contains(standfirstElement) || standfirstElement.contains(element))) {
          continue;
        }
        
        const text = element.textContent.trim();
        
        // Also skip if text matches standfirst (to avoid duplicates)
        if (standfirst && text === standfirst) {
          continue;
        }
        
        const textLower = text.toLowerCase();
        
        // Exclude paragraphs that are author metadata (e.g., "by Pankaj Mishra")
        // Only if it's very short, starts with "by", and contains mostly just author name/link
        if (textLower.startsWith('by ') && text.length < 100) {
          const links = element.querySelectorAll('a');
          const linkText = Array.from(links).map(a => a.textContent.trim()).join(' ');
          const nonLinkText = text.replace(/<[^>]+>/g, '').trim();
          
          // If paragraph is mostly just "by" + author name/link, exclude it
          if (links.length <= 1 && nonLinkText.length < 50 && 
              (nonLinkText.toLowerCase().startsWith('by ') && 
               nonLinkText.split(/\s+/).length <= 5)) {
            continue;
          }
        }
        
        // Exclude "Edited by" metadata paragraphs
        if (textLower.startsWith('edited by') && text.length < 200) {
          continue;
        }
        
        // Exclude word count paragraphs (e.g., "4,500 words", "Original article • 3,617 words")
        if (/^\d+[,\s]\d+\s+words?$/i.test(text) || /^\d+\s+words?$/i.test(text)) {
          continue;
        }
        
        // Exclude metadata lines with "Original article" and word count (check anywhere in text)
        const textWithoutHtml = text.replace(/<[^>]+>/g, '').trim();
        if (/original\s+article\s*[•·]\s*\d+[,\s]?\d*\s*words?/i.test(textWithoutHtml) ||
            (/original\s+article\s*[•·]/i.test(textWithoutHtml) && /\d+\s*words?/i.test(textWithoutHtml))) {
          continue;
        }
        
        // Also exclude if it's a short paragraph that contains "Original article" and word count
        if (textWithoutHtml.length < 100 && 
            /original\s+article/i.test(textWithoutHtml) && 
            /\d+\s*words?/i.test(textWithoutHtml)) {
          continue;
        }
        
        // Exclude "Original article • Author • Date • words" pattern
        if (/original\s+article\s*[•·]\s*[^•·]+\s*[•·]\s*\w+\s+\d+[,\s]?\d*\s*[•·]\s*\d+[,\s]?\d*\s*words?/i.test(textWithoutHtml)) {
          continue;
        }
        
        // Exclude paragraphs inside accordion (metadata sections)
        let checkElAccordion = element;
        let isInAccordion = false;
        while (checkElAccordion && checkElAccordion !== mainContent) {
          const checkClass = (checkElAccordion.className || '').toLowerCase();
          if (checkClass.includes('accordion') || checkClass.includes('c-accordion')) {
            isInAccordion = true;
            break;
          }
          checkElAccordion = checkElAccordion.parentElement;
        }
        if (isInAccordion) {
          continue;
        }
        
        // Exclude subscription prompts
        if (textLower.includes("like what you're reading") ||
            (textLower.includes('subscribe') && textLower.includes('atavist'))) {
          continue;
        }
        
        // Exclude editor/credits metadata
        if (textLower.startsWith('editor:') || 
            textLower.startsWith('art director:') ||
            textLower.startsWith('copy editor:') ||
            textLower.startsWith('fact checker:') ||
            textLower.startsWith('illustrator:') ||
            textLower.startsWith('published in') ||
            textLower.includes('math editor') ||
            textLower.includes('science editor') ||
            textLower.includes('physics editor')) {
          continue;
        }
        
        // Exclude paragraphs that are just dates (e.g., "December 18, 2025")
        // Match formats like "Month Day, Year" or "Month Day Year"
        const dateOnlyPattern = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}$/i;
        if (dateOnlyPattern.test(textWithoutHtml.trim())) {
          continue;
        }
        
        // Exclude paragraphs inside author metadata sections
        let checkElAuthor = element;
        let isInAuthorMetadata = false;
        while (checkElAuthor && checkElAuthor !== mainContent) {
          const checkClass = (checkElAuthor.className || '').toLowerCase();
          if (checkClass.includes('post__title__author-date') ||
              checkClass.includes('author-date') ||
              checkClass.includes('byline') ||
              checkClass.includes('author-meta')) {
            isInAuthorMetadata = true;
            break;
          }
          checkElAuthor = checkElAuthor.parentElement;
        }
        if (isInAuthorMetadata) {
          continue;
        }
        
        // Exclude paragraphs that contain only "OBJ" or similar object markers
        if (/^obj\s*$/i.test(textWithoutHtml) || /^\[obj\]\s*$/i.test(textWithoutHtml) ||
            /^\[object\s+object\]\s*$/i.test(textWithoutHtml)) {
          continue;
        }
        
        // Clean paragraph text - remove "OBJ" markers that might be embedded
        let cleanedParagraphText = textWithoutHtml
          .replace(/\s*\[?obj\]?\s*/gi, '') // Remove [OBJ] or OBJ markers
          .trim();
        
        // Skip if paragraph becomes empty after cleaning
        if (!cleanedParagraphText || cleanedParagraphText.length < 10) {
          continue;
        }
        
        // CRITICAL: Exclude newsletter/email signup paragraphs
        // Check for common newsletter patterns
        if (textLower.includes('sign up to our newsletter') || 
            textLower.includes('join more than') && textLower.includes('newsletter subscribers') ||
            (textLower.includes('newsletter') && textLower.includes('subscribe') && 
             element.closest('*').querySelector('input[type="email"]'))) {
          continue;
        }
        
        // Exclude "Get the latest [category] stories in your inbox" pattern
        if (/get\s+the\s+latest\s+.+\s+stories?\s+in\s+your\s+inbox/i.test(text)) {
          continue;
        }
        
        // Exclude Salesforce Marketing Cloud and similar email service providers
        if (textLower.includes('email powered by') ||
            textLower.includes('powered by salesforce') ||
            textLower.includes('salesforce marketing cloud') ||
            textLower.includes('marketing cloud') ||
            textLower.includes('privacy notice') && textLower.includes('terms') ||
            (textLower.includes('privacy') && textLower.includes('terms') && textLower.includes('conditions'))) {
          continue;
        }
        
        // Check if paragraph is inside an email signup form/container
        let checkParent = element.parentElement;
        let isInEmailSignup = false;
        for (let i = 0; i < 5 && checkParent && checkParent !== mainContent; i++) {
            const parentClass = String(checkParent.className || '').toLowerCase();
          const parentId = (checkParent.id || '').toLowerCase();
          const parentTag = checkParent.tagName.toLowerCase();
          
          // Check for email input fields
          if (checkParent.querySelector('input[type="email"]') || 
              checkParent.querySelector('input[name*="email"]') ||
              checkParent.querySelector('input[id*="email"]')) {
            // Check if it's a signup form (not a contact form in article)
            if (parentClass.includes('newsletter') || parentClass.includes('subscribe') ||
                parentClass.includes('signup') || parentClass.includes('sign-up') ||
                parentClass.includes('email-signup') || parentClass.includes('email-sign-up') ||
                parentId.includes('newsletter') || parentId.includes('subscribe') ||
                parentId.includes('signup') || parentId.includes('sign-up') ||
                textLower.includes('inbox') || textLower.includes('get the latest')) {
              isInEmailSignup = true;
              break;
            }
          }
          
          // Check for marketing cloud indicators
          if (parentClass.includes('marketing-cloud') || parentClass.includes('salesforce') ||
              parentId.includes('marketing-cloud') || parentId.includes('salesforce')) {
            isInEmailSignup = true;
            break;
          }
          
          checkParent = checkParent.parentElement;
        }
        if (isInEmailSignup) {
          continue;
        }
        
        // Exclude donation paragraphs
        if ((textLower.includes('donate') || textLower.includes('donation')) && 
            (textLower.includes('support') || textLower.includes('mission') || 
             textLower.includes('select amount') || textLower.includes('per month'))) {
          continue;
        }
        
        // Exclude navigation paragraphs
        if (isNavigationParagraph(text)) {
          continue;
        }
        
        // Check for course/product advertisements with prices
        const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
        const hasPrice = pricePattern.test(text);
        
        // Check for course/training advertisement patterns
        const isCourseAd = COURSE_AD_PATTERNS.some(pattern => textLower.includes(pattern));
        
        // If paragraph contains price and course ad patterns, exclude it
        if (hasPrice && isCourseAd) {
          continue;
        }
        
        // Exclude paragraphs that are clearly course/product promotions
        if (textLower.includes('measure ux & design impact') && 
            (textLower.includes('code') || textLower.includes('save') || textLower.includes('off'))) {
          continue;
        }
        
        // Check if paragraph is in a course ad container
        let parent = element.parentElement;
        let isInCourseAd = false;
        let iterations = 0;
        const maxIterations = 50; // Safety limit to prevent infinite loops
        while (parent && parent !== mainContent && iterations < maxIterations) {
          iterations++;
          const parentClass = String(parent.className || '').toLowerCase();
          const parentId = (parent.id || '').toLowerCase();
          if (parentClass.includes('book-cta') || parentClass.includes('course-cta') || 
              parentClass.includes('product-cta') || parentClass.includes('course-ad') ||
              parentId.includes('book-cta') || parentId.includes('course-cta')) {
            isInCourseAd = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (isInCourseAd) {
          continue;
        }
        
        // Check if paragraph contains only footnotes/links to anchors
        const links = element.querySelectorAll('a');
        let hasOnlyFootnotes = true;
        let hasRealContent = false;
        
        if (links.length > 0) {
          for (const link of Array.from(links)) {
            if (!isFootnoteLink(link)) {
              hasOnlyFootnotes = false;
              break;
            }
          }
          // If all links are footnotes, check if there's actual text content beyond them
          if (hasOnlyFootnotes) {
            const textWithoutLinks = element.cloneNode(true);
            if (textWithoutLinks instanceof Element) {
              // Remove all footnote links
              const linkElements = textWithoutLinks.querySelectorAll('a');
              linkElements.forEach(link => {
                if (isFootnoteLink(link)) {
                  link.remove();
                }
              });
              // Remove icons and sup elements with arrows
              const allElements = textWithoutLinks.querySelectorAll('*');
              allElements.forEach(el => {
                if (isIcon(el)) {
                  el.remove();
                }
              });
              const supElements = textWithoutLinks.querySelectorAll('sup');
              supElements.forEach(sup => {
                const supText = sup.textContent.trim();
                if ((supText.length <= 3 && /[←→↑↓↗↘↩]/.test(supText)) || supText.toLowerCase().includes('open these')) {
                  sup.remove();
                }
              });
            }
            const remainingText = textWithoutLinks instanceof Element ? textWithoutLinks.textContent.trim() : '';
            hasRealContent = remainingText.length > 10; // At least 10 chars of non-link text
          }
        } else {
          hasRealContent = true; // No links, so it's real content
        }
        
        // Exclude if paragraph only contains footnotes
        if (hasOnlyFootnotes && !hasRealContent) {
          continue;
        }
        
        // Exclude if paragraph contains navigation text (already checked in isNavigationParagraph, but double-check)
        if (NAV_PATTERNS_CONTAINS.some(pattern => pattern.test(text))) {
          continue;
        }
        
        // Exclude paragraphs that are clearly paywall/subscription prompts (all 11 languages)
        // textLower already declared above
        if (PAYWALL_PATTERNS.some(pattern => textLower.includes(pattern))) {
          continue;
        }
        
        // Exclude paragraphs that are clearly related articles sections (all 11 languages)
        if (RELATED_PATTERNS.some(pattern => textLower.includes(pattern))) {
          continue;
        }
        
        // Include paragraphs with meaningful content (at least 5 characters)
        // This helps capture short but important paragraphs
        if (text && text.length >= 5) {
          // Clean HTML: remove footnotes, icons, and OBJ markers in one pass
          const htmlClone = element.cloneNode(true);
          
          // Single-pass TreeWalker for efficient cleaning
          const walker = document.createTreeWalker(
            htmlClone,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                if (node.nodeType === Node.ELEMENT_NODE && node instanceof Element) {
                  const element = node;
                  const tagName = element.tagName.toLowerCase();
                  
                  // Remove footnote links
                  if (tagName === 'a' && isFootnoteLink(element)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  // Remove icons
                  if (isIcon(element)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  // Remove sup elements with arrows
                  if (tagName === 'sup') {
                    const supText = element.textContent.trim();
                    if ((supText.length <= 3 && /[←→↑↓↗↘↩]/.test(supText)) || supText.toLowerCase().includes('open these')) {
                      return NodeFilter.FILTER_REJECT;
                    }
                  }
                  
                  // Remove object/embed elements
                  if (tagName === 'object' || tagName === 'embed') {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  // Remove elements that contain only "OBJ" text
                  const elText = element.textContent.trim();
                  if (/^obj\s*$/i.test(elText) || /^\[obj\]\s*$/i.test(elText)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  
                  // Clean attributes in the same pass
                  element.removeAttribute('style');
                  const safeAttributes = ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'];
                  for (const attr of Array.from(element.attributes)) {
                    if (attr.name.startsWith('on') || !safeAttributes.includes(attr.name.toLowerCase())) {
                      element.removeAttribute(attr.name);
                    }
                  }
                  
                  // Remove empty spans and divs
                  if ((tagName === 'span' || tagName === 'div') && !element.textContent.trim() && !element.querySelector('img')) {
                    return NodeFilter.FILTER_REJECT;
                  }
                } else if (node.nodeType === Node.TEXT_NODE) {
                  // Clean OBJ markers from text nodes
                  const text = node.textContent.trim();
                  if (/^obj\s*$/i.test(text) || /^\[obj\]\s*$/i.test(text)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  // Remove OBJ markers from text content
                  if (node.textContent && /obj/i.test(node.textContent)) {
                    node.textContent = node.textContent.replace(/\s*\[?obj\]?\s*/gi, '');
                  }
                }
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );
          
          // Process all nodes
          const nodesToProcess = [];
          let currentNode;
          while (currentNode = walker.nextNode()) {
            nodesToProcess.push(currentNode);
          }
          
          // Get cleaned text to check if there's still meaningful content
          const cleanedText = htmlClone instanceof Element ? htmlClone.textContent.trim().replace(/\s*\[?obj\]?\s*/gi, '').trim() : '';
          
          // Only add if there's still meaningful content after cleaning
          if (cleanedText && cleanedText.length >= 5) {
            // Final cleanup: remove any remaining OBJ markers from HTML
            let cleanedHtml = htmlClone instanceof Element ? htmlClone.innerHTML
              .replace(/\s*\[?obj\]?\s*/gi, '') // Remove any remaining OBJ markers
              .replace(/<[^>]*>\s*\[?obj\]?\s*<\/[^>]*>/gi, '') // Remove empty tags with OBJ
              .trim() : '';
            
            // Only add if HTML is not empty after all cleaning
            if (cleanedHtml && cleanedHtml.length > 0) {
              content.push({
                type: 'paragraph',
                text: cleanedHtml,
                html: cleanedHtml
              });
              processedCount++;
            }
          }
        }
      } else if (tagName === 'figure') {
        // Handle figure elements (images with captions) - process before standalone img
        const img = element.querySelector('img');
        if (img) {
          const src = extractBestImageUrl(img);
          if (src) {
            const isTracking = isTrackingPixel(img);
            const isDecorative = isDecorativeImage(img);
            if (!isTracking && !isDecorative) {
              const absoluteSrc = toAbsoluteUrl(src, baseUrl);
              // Normalize URL for comparison to avoid duplicates with different query params
              const normalizedSrc = normalizeImageUrl(absoluteSrc);
              // Skip if already processed (e.g., as featured image)
              if (processedImages.has(normalizedSrc)) {
                continue;
              }
              // Mark this image as processed
              processedImages.add(normalizedSrc);
              
              // Extract caption from figcaption or other elements
              let caption = '';
              const figcaption = element.querySelector('figcaption');
              if (figcaption) {
                caption = figcaption.textContent.trim();
              } else {
                // Look for caption in other text elements (p, div, span with caption-like classes)
                const captionSelectors = ['p', 'div', 'span'];
                for (const selector of captionSelectors) {
                  const captionEl = element.querySelector(selector);
                  if (captionEl) {
                    const captionText = captionEl.textContent.trim();
                    const className = (captionEl.className || '').toLowerCase();
                    // Check if it looks like a caption
                    if (captionText && (className.includes('caption') || className.includes('credit') || className.includes('credit'))) {
                      caption = captionText;
                      break;
                    }
                  }
                }
                // If still no caption, try to extract from all text (excluding img alt)
                if (!caption) {
                  const allText = element.textContent.trim();
                  const imgAlt = img.alt || '';
                  if (allText && allText !== imgAlt) {
                    // Remove img alt from text to get caption
                    caption = allText.replace(imgAlt, '').trim();
                    // Clean up common prefixes
                    caption = caption.replace(/^(image|photo|picture|credit|source)[:\s]*/i, '').trim();
                  }
                }
              }
              
              content.push({
                type: 'image',
                src: absoluteSrc,
                alt: img.alt || caption || '',
                caption: caption
              });
              processedCount++;
            }
          }
        }
      } else if (tagName === 'img') {
        // Skip images that are already inside a figure (processed above)
        const src = extractBestImageUrl(element);
        const isTracking = src ? isTrackingPixel(element) : false;
        const isDecorative = src ? isDecorativeImage(element) : false;
        if (src && !isTracking && !isDecorative) {
          const absoluteSrc = toAbsoluteUrl(src, baseUrl);
          // Normalize URL for comparison to avoid duplicates
          const normalizedSrc = normalizeImageUrl(absoluteSrc);
          // Skip if already processed (e.g., as featured image or in a figure)
          if (processedImages.has(normalizedSrc)) {
            continue;
          }
          // Check if this img is inside a figure that we'll process
          const parentFigure = element.closest('figure');
          if (parentFigure) {
            continue; // Will be processed when we encounter the figure
          }
          const imgElement = element instanceof HTMLImageElement ? element : null;
          content.push({
            type: 'image',
            src: absoluteSrc,
            alt: imgElement?.alt || '',
            caption: getImageCaption(element)
          });
          processedImages.add(normalizedSrc);
          processedCount++;
        }
      } else if (tagName === 'blockquote') {
        const text = element.textContent.trim();
        if (text) {
          content.push({
            type: 'quote',
            text: element.innerHTML
          });
        }
      } else if (tagName === 'pre' || tagName === 'code') {
        // For code blocks, preserve HTML structure to maintain line breaks
        // Replace <br> with newlines, preserve <div> structure
        let codeText = '';
        if (tagName === 'pre') {
          // For <pre>, preserve innerHTML but clean it up
          const html = element.innerHTML;
          // Replace <br> and <br/> with newlines
          codeText = html.replace(/<br\s*\/?>/gi, '\n');
          // Replace closing tags followed by opening tags with newlines (for syntax highlighting spans)
          codeText = codeText.replace(/<\/[^>]+>\s*<[^>]+>/g, '');
          // Remove all remaining HTML tags but preserve text
          codeText = codeText.replace(/<[^>]+>/g, '');
          // Decode HTML entities
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = codeText;
          codeText = tempDiv.textContent || tempDiv.innerText || codeText;
        } else {
          // For inline <code>, use textContent
          codeText = element.textContent.trim();
        }
        
        if (codeText) {
          const language = (element.className || '').match(/language-(\w+)/)?.[1] || '';
          content.push({
            type: 'code',
            language: language,
            text: codeText
          });
        }
      } else if (tagName === 'ul' || tagName === 'ol') {
        const items = Array.from(element.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean);
        if (items.length > 0) {
          content.push({
            type: 'list',
            ordered: tagName === 'ol',
            items: items
          });
        }
      } else if (tagName === 'table') {
        // Extract table content - tables can be part of article content (e.g., ProPublica)
        // Check if table is inside an excluded container
        let parent = element.parentElement;
        let isInExcludedContainer = false;
        let iterations = 0;
        const maxIterations = 50; // Safety limit to prevent infinite loops
        while (parent && parent !== mainContent && iterations < maxIterations) {
          iterations++;
          if (isExcluded(parent)) {
            isInExcludedContainer = true;
            break;
          }
          parent = parent.parentElement;
        }
        
        if (!isInExcludedContainer) {
          // Check table structure: should have at least 2 rows and 2 columns
          const rows = element.querySelectorAll('tr');
          const rowCount = rows.length;
          let maxColCount = 0;
          
          for (const row of Array.from(rows)) {
            const cells = row.querySelectorAll('td, th');
            maxColCount = Math.max(maxColCount, cells.length);
          }
          
          // Include table if it has meaningful structure (2+ rows and 2+ cols) OR substantial text
          const tableText = element.textContent.trim();
          const hasStructure = rowCount >= 2 && maxColCount >= 2;
          const hasSubstantialText = tableText.length >= 50;
          
          if (hasStructure || hasSubstantialText) {
            // Clean table HTML: remove inline styles, scripts, event handlers
            const tableClone = element.cloneNode(true);
            if (tableClone instanceof Element) {
              const allElements = tableClone.querySelectorAll('*');
              
              // Remove dangerous attributes
              for (const el of Array.from(allElements)) {
                // Remove style attributes
                el.removeAttribute('style');
                // Remove event handlers
                for (const attr of Array.from(el.attributes)) {
                  if (attr.name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                  }
                }
              }
              
              const tableHtml = tableClone.outerHTML;
              content.push({
                type: 'paragraph', // Treat table as special paragraph
                text: tableHtml,
                html: tableHtml
              });
            }
          }
        }
      }
    } // End of for (const element of elements) loop
    
    const contentTypes = content.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
    }, {});
    if (debugInfo) {
      debugInfo.contentTypes = contentTypes;
      debugInfo.processedCount = processedCount;
      debugInfo.skippedCount = skippedCount;
      debugInfo.finalImageCount = ((contentTypes['image'] || 0));
    } else {
      // Skip expensive contentTypes calculation if debug is disabled
      // This is a performance optimization - contentTypes is only used for debug logging
    }
    
    // Final check: if no content extracted, try to extract at least something
    if (content.length === 0) {
      
      // Emergency fallback: try multiple strategies
      let emergencyElements = [];
      
      // Strategy 1: Use mainContent if available
      if (mainContent) {
        emergencyElements = Array.from(mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
      }
      
      // Strategy 2: If no elements from mainContent, try article/main
      if (emergencyElements.length === 0) {
        const article = document.querySelector('article');
        const main = document.querySelector('main');
        const container = article || main;
        if (container) {
          emergencyElements = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
        }
      }
      
      // Strategy 3: Last resort - find largest container with paragraphs
      if (emergencyElements.length === 0) {
        const allDivs = Array.from(document.querySelectorAll('div'));
        let bestDiv = null;
        let maxParagraphs = 0;
        
        for (const div of allDivs) {
          const paragraphs = div.querySelectorAll('p');
          if (paragraphs.length > maxParagraphs && div.textContent.trim().length > 500) {
            maxParagraphs = paragraphs.length;
            bestDiv = div;
          }
        }
        
        if (bestDiv) {
          emergencyElements = Array.from(bestDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
        }
      }
      
      // Extract from emergency elements (no filtering, just extract)
      for (const el of emergencyElements.slice(0, 100)) {
        const tagName = el.tagName.toLowerCase();
        const text = el.textContent.trim();
        if (text && text.length > 5) {
          if (tagName.match(/^h[1-6]$/)) {
            // Clean and normalize heading - remove "OBJ" markers and Object Replacement Character
            const cleanedText = text.replace(/<[^>]+>/g, '').trim()
              .replace(/\s*\[?obj\]?\s*/gi, '')
              .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
              .trim();
            
            if (!cleanedText || cleanedText.length < 3) {
              continue;
            }
            
            const normalizedText = cleanedText.toLowerCase().trim();
            
            // CRITICAL: Check if this is the main title
            if (mainTitleText && normalizedText === mainTitleText) {
              continue;
            }
            
            // CRITICAL: Check if we've already added this heading (Set lookup is O(1))
            if (addedHeadings.has(normalizedText)) {
              continue;
            }
            
            // Add to set BEFORE pushing to content (prevents duplicates)
            addedHeadings.add(normalizedText);
            content.push({
              type: 'heading',
              level: parseInt(tagName.substring(1)),
              text: cleanedText,
              id: el.id || null
            });
          } else if (tagName === 'p') {
            content.push({
              type: 'paragraph',
              text: el.innerHTML,
              html: el.innerHTML
            });
          }
        }
      }
    }
    
    // FINAL SAFETY CHECK: Remove any duplicate headings that might have slipped through
    const seenHeadings = new Set();
    const deduplicatedContent = [];
    let duplicateCount = 0;
    
    for (const item of content) {
      if (item.type === 'heading' && item.text) {
        const normalized = item.text.toLowerCase().trim().replace(/\s*\[?obj\]?\s*/gi, '').trim();
        if (seenHeadings.has(normalized)) {
          duplicateCount++;
          continue;
        }
        seenHeadings.add(normalized);
      }
      deduplicatedContent.push(item);
    }
    
    if (debugInfo) {
      debugInfo.duplicateHeadingsRemoved = duplicateCount;
      
      const finalContentTypes = deduplicatedContent.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});
      debugInfo.finalContentTypes = finalContentTypes;
    } else {
      // Skip expensive finalContentTypes calculation if debug is disabled
      // This is a performance optimization - finalContentTypes is only used for debug logging
    }
    
    const result = {
      title: metadata.title,
      author: metadata.author,
      publishDate: metadata.publishDate,
      content: deduplicatedContent,
      debugInfo: debugInfo
    };
    
    // Log completion (this will appear in page console, not service worker)
    // CRITICAL: This runs in MAIN world where modules are not available
    // console.log is acceptable here as logging module cannot be imported
    try {
      console.log('[ClipAIble] extractAutomaticallyInlined: SUCCESS', {
        contentLength: deduplicatedContent.length,
        title: metadata.title,
        timestamp: Date.now()
      });
    } catch (e) {}
    
    return result;
  } catch (error) {
    // Log error (this will appear in page console, not service worker)
    // CRITICAL: This runs in MAIN world where modules are not available
    // console.error is acceptable here as logging module cannot be imported
    try {
      console.error('[ClipAIble] extractAutomaticallyInlined: ERROR', {
        error: error.message,
        errorStack: error.stack,
        timestamp: Date.now()
      });
    } catch (e) {}
    
    // Return minimal result on error with error info
    return {
      title: document.title || '',
      author: '',
      publishDate: '',
      content: [],
      debugInfo: debugInfo,
      error: error.message,
      errorStack: error.stack
    };
  } // end try-catch
} // end extractAutomaticallyInlined

