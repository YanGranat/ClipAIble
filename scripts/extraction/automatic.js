// @ts-check
// Automatic content extraction without AI
// Uses heuristics and DOM analysis to extract article content

// Note: This function uses modular helper functions that are inlined at build time
// All modules are in scripts/extraction/extractor/ and are assembled by builder.js
// The function runs in page context via executeScript where imports are not available

/**
 * Inlined automatic extraction function for chrome.scripting.executeScript
 * This runs in the page's main world context
 * 
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @param {boolean} enableDebugInfo - Whether to collect debug information (default: false)
 * @returns {Promise<Object>} Extraction result with content, title, author, publishDate, debugInfo
 */
export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false) {
  // Log extraction start
  try {
    console.log('[ClipAIble] extractAutomaticallyInlined: START', { baseUrl, enableDebugInfo, timestamp: Date.now() });
  } catch (e) {
    // Console might not be available
  }
  


    // ============================================
    // INLINED CONSTANTS AND PATTERNS
    // (Generated from scripts/extraction/extractor/constants.js)
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
    
    // Navigation patterns (contains)
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
    
    // Navigation patterns (starts with)
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
    
    // Paywall patterns (flattened)
    const PAYWALL_PATTERNS = [
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
          "you've reached your free",
          "чтобы прочитать целиком",
          "купите подписку",
          "платный журнал",
          "я уже подписчик",
          "подписка предоставлена",
          "оформить подписку",
          "чтобы читать далее",
          "подпишитесь чтобы",
          "чтобы продолжить",
          "щоб прочитати цілком",
          "купити підписку",
          "платний журнал",
          "я вже передплатник",
          "підписка надана",
          "оформити підписку",
          "щоб читати далі",
          "підпишіться щоб",
          "щоб продовжити",
          "um weiterzulesen",
          "abonnement kaufen",
          "bezahltes magazin",
          "ich bin bereits abonnent",
          "abonnement bereitgestellt",
          "abonnement abschließen",
          "um weiter zu lesen",
          "abonnieren um",
          "um fortzufahren",
          "pour lire en entier",
          "acheter un abonnement",
          "magazine payant",
          "je suis déjà abonné",
          "abonnement fourni",
          "s'abonner",
          "pour continuer à lire",
          "abonnez-vous pour",
          "pour continuer",
          "para leer completo",
          "comprar suscripción",
          "revista de pago",
          "ya soy suscriptor",
          "suscripción proporcionada",
          "suscribirse",
          "para seguir leyendo",
          "suscríbete para",
          "para continuar",
          "per leggere completo",
          "acquista abbonamento",
          "rivista a pagamento",
          "sono già abbonato",
          "abbonamento fornito",
          "abbonarsi",
          "per continuare a leggere",
          "abbonati per",
          "per continuare",
          "para ler completo",
          "comprar assinatura",
          "revista paga",
          "já sou assinante",
          "assinatura fornecida",
          "assinar",
          "para continuar lendo",
          "assine para",
          "para continuar",
          "阅读全文",
          "购买订阅",
          "付费杂志",
          "我已经是订阅者",
          "已提供订阅",
          "订阅",
          "继续阅读",
          "订阅以",
          "继续",
          "全文を読む",
          "購読を購入",
          "有料雑誌",
          "既に購読者です",
          "購読が提供されました",
          "購読する",
          "続きを読む",
          "購読して",
          "続ける",
          "전체 읽기",
          "구독 구매",
          "유료 잡지",
          "이미 구독자입니다",
          "구독 제공됨",
          "구독하기",
          "계속 읽기",
          "구독하여",
          "계속"
    ];
    
    // Related articles patterns (flattened)
    const RELATED_PATTERNS = [
          "new and best",
          "first page",
          "recommend",
          "read also",
          "similar articles",
          "related articles",
          "other articles",
          "more on topic",
          "on topic",
          "новое и лучшее",
          "первая полоса",
          "рекомендуем",
          "читайте также",
          "похожие статьи",
          "связанные статьи",
          "другие статьи",
          "ещё по теме",
          "по теме",
          "нове і краще",
          "перша смуга",
          "рекомендуємо",
          "читайте також",
          "схожі статті",
          "пов'язані статті",
          "інші статті",
          "ще за темою",
          "за темою",
          "neu und besser",
          "erste seite",
          "empfehlen",
          "lesen sie auch",
          "ähnliche artikel",
          "verwandte artikel",
          "andere artikel",
          "mehr zum thema",
          "zum thema",
          "nouveau et mieux",
          "première page",
          "recommandons",
          "lisez aussi",
          "articles similaires",
          "articles connexes",
          "autres articles",
          "plus sur le sujet",
          "sur le sujet",
          "nuevo y mejor",
          "primera página",
          "recomendamos",
          "lee también",
          "artículos similares",
          "artículos relacionados",
          "otros artículos",
          "más sobre el tema",
          "sobre el tema",
          "nuovo e migliore",
          "prima pagina",
          "consigliamo",
          "leggi anche",
          "articoli simili",
          "articoli correlati",
          "altri articoli",
          "altro sull'argomento",
          "sull'argomento",
          "novo e melhor",
          "primeira página",
          "recomendamos",
          "leia também",
          "artigos similares",
          "artigos relacionados",
          "outros artigos",
          "mais sobre o tema",
          "sobre o tema",
          "最新和最佳",
          "头版",
          "推荐",
          "也阅读",
          "相似文章",
          "相关文章",
          "其他文章",
          "更多主题",
          "主题",
          "新しくて最高",
          "第一面",
          "おすすめ",
          "こちらも読む",
          "類似記事",
          "関連記事",
          "その他の記事",
          "トピックの詳細",
          "トピック",
          "새로운 것과 최고",
          "첫 페이지",
          "추천",
          "또한 읽기",
          "유사한 기사",
          "관련 기사",
          "다른 기사",
          "주제에 대해 더",
          "주제"
    ];
    
    // Course ad patterns
    const COURSE_AD_PATTERNS = [
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
    
    // Excluded classes
    const EXCLUDED_CLASSES = [
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
          "discussion",
          "thread",
          "disqus",
          "related",
          "related-posts",
          "related-articles",
          "related-articles__title",
          "recommended",
          "also-in",
          "article-section-title",
          "entry-wrapper",
          "c-accordion",
          "accordion",
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
          "support",
          "donate",
          "donation",
          "corrections",
          "correction",
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
          "content-tabs",
          "content-tab",
          "book-cta__inverted",
          "book-cta__col",
          "useful-resources",
          "further-reading",
          "resources-section",
          "component-share-buttons",
          "aria-font-adjusts",
          "font-adjust"
    ];
    
    // Paywall classes
    const PAYWALL_CLASSES = [
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
    
    // Logo patterns
    const LOGO_PATTERNS = [
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
          "gradient",
          "bg",
          "background",
          "shadow",
          "border",
          "divider",
          "line",
          "separator",
          "spinner",
          "loader",
          "loading",
          "placeholder",
          "default",
          "avatar",
          "user",
          "profile",
          "gravatar",
          "data:image/gif;base64,r0lgodlh",
          "data:image/png;base64,i"
    ];
    
    // Standfirst selectors (used by standfirst.js)
    const STANDFIRST_SELECTORS = [
      '.standfirst', '.subtitle', '.deck', '.lede', '.intro', '.article__subhead',
      '[class*="standfirst"]', '[class*="subtitle"]', '[class*="deck"]',
      '[class*="intro"]', '[class*="summary"]', '[class*="subhead"]'
    ];
    
    // Candidate element selector (used by parse.js)
    const CANDIDATE_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, img, figure, blockquote, pre, code, ul, ol, table, div';
    
    // CONSTANTS object (used by runExtraction)
    const CONSTANTS = {
      EXCLUDED_CLASSES,
      PAYWALL_CLASSES,
      NAVIGATION_PATTERNS_CONTAINS: NAV_PATTERNS_CONTAINS,
      NAV_PATTERNS_STARTS_WITH,
      COURSE_AD_PATTERNS,
      PAYWALL_PATTERNS,
      LOGO_PATTERNS
    };
    
    // ============================================
    // END OF INLINED CONSTANTS
    // ============================================


// ============================================
// INLINED EXTRACTOR MODULES
// Generated from scripts/extraction/extractor/
// ============================================

// --- DOM Utils ---
function compareDomOrder(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }
  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }
  return 0;
}

function getTextContent(element) {
  return (element.textContent || "").trim().replace(/\s+/g, " ");
}

function hasParentOfType(element, tagName, maxDepth = 5) {
  let current = element.parentElement;
  let depth = 0;
  const upperTag = tagName.toUpperCase();
  while (current && depth < maxDepth) {
    if (current.tagName === upperTag) {
      return true;
    }
    current = current.parentElement;
    depth++;
  }
  return false;
}

function isElementVisible(win, element) {
  const style = safeGetComputedStyle(win, element);
  if (!style)
    return true;
  if (style.display === "none")
    return false;
  if (style.visibility === "hidden")
    return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0)
    return false;
  return true;
}

function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
}

function normalizeImageUrl(url) {
  if (!url)
    return "";
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (e) {
    return url.split("?")[0].split("#")[0];
  }
}

function safeClosest(element, selector) {
  try {
    return element.closest(selector);
  } catch (e) {
    return null;
  }
}

function safeGetComputedStyle(win, element) {
  try {
    return win.getComputedStyle(element);
  } catch (e) {
    return null;
  }
}

function toAbsoluteUrl(url, baseUrl) {
  if (!url)
    return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    return url;
  }
}

// --- Text Utils ---
function calculateReadingTime(text, wordsPerMinute = 200) {
  const wordCount = text.trim().split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

function cleanHeadingText(text) {
  if (!text)
    return "";
  return text.replace(/\uFFFC/g, "").replace(/<OBJ>/gi, "").replace(/<\/OBJ>/gi, "").replace(/\[OBJ\]/gi, "").replace(/OBJ/g, "").replace(/<[^>]+>/g, "").replace(/\s*\[[^\]]{1,30}\s*\|\s*[^\]]{1,30}\]\s*$/g, "").replace(/\s*\[(edit|ред\.?|редагувати|править|editar|modifier|bearbeiten|編集|编辑|편집)[^\]]*\]\s*$/gi, "").replace(/\s*#\s*$/, "").replace(/\s+/g, " ").trim();
}

function cleanLatexFormula(latex) {
  if (!latex)
    return "";
  return latex.replace(/^\{\\displaystyle\s*(.+?)\}$/s, "$1").replace(/\\displaystyle\s*/g, "").replace(/^\{(.+)\}$/, "$1").trim();
}

function containsPaywallContent(text, paywallPatterns) {
  const lowerText = text.toLowerCase();
  return paywallPatterns.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function containsRelatedContent(text, relatedPatterns) {
  const lowerText = text.toLowerCase();
  return relatedPatterns.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

function countSentences(text) {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

function isEndOfContentSection(headingText) {
  const text = headingText.toLowerCase().trim();
  const endSections = [
    // Russian
    "\u0441\u043C. \u0442\u0430\u043A\u0436\u0435",
    "\u043F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u044F",
    "\u043B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430",
    "\u0441\u0441\u044B\u043B\u043A\u0438",
    "\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438",
    "\u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438",
    "\u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430",
    "\u0441\u043D\u043E\u0441\u043A\u0438",
    // English  
    "see also",
    "references",
    "notes",
    "external links",
    "further reading",
    "bibliography",
    "sources",
    "footnotes",
    "citations",
    // German
    "siehe auch",
    "einzelnachweise",
    "literatur",
    "weblinks",
    "quellen",
    // French
    "voir aussi",
    "r\xE9f\xE9rences",
    "notes et r\xE9f\xE9rences",
    "liens externes",
    // Spanish
    "v\xE9ase tambi\xE9n",
    "referencias",
    "enlaces externos",
    "bibliograf\xEDa"
  ];
  return endSections.includes(text);
}

function isNumericHeading(text) {
  const cleaned = text.trim();
  return /^\d+\.?\s*$/.test(cleaned);
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
  if (typeof console !== "undefined" && console.log) {
    console.log("[isRealHeading]", {
      tagName,
      text: cleanedText.substring(0, 50),
      textLength: cleanedText.length,
      fontStyle,
      fontSize,
      fontWeight,
      isItalic,
      result,
      reason: reason || "passed all checks"
    });
  }
  return result;
}

function looksLikeArticleStarter(text) {
  const lowerText = text.toLowerCase().trim();
  const commonStarters = [
    "the",
    "a",
    "an",
    "in",
    "on",
    "when",
    "where",
    "why",
    "how",
    "what",
    "this",
    "that",
    "these",
    "those",
    "it",
    "there",
    "he",
    "she",
    "they",
    "we",
    "i",
    "you",
    "if",
    "as",
    "for",
    "with",
    "by",
    "from",
    "at",
    "to",
    "of",
    "after",
    "before",
    "during",
    "since",
    "until",
    "while",
    "although",
    "though"
  ];
  const firstWord = lowerText.split(/\s+/)[0];
  return commonStarters.includes(firstWord);
}

function looksLikeDate(text) {
  const trimmed = text.trim();
  if (trimmed.length > 50)
    return false;
  const datePatterns = [
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,
    // 12/31/2024
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,
    // 2024-12-31
    /^[a-z]+\s+\d{1,2},?\s+\d{4}$/i,
    // January 15, 2024
    /^\d{1,2}\s+[a-z]+\s+\d{4}$/i,
    // 15 January 2024
    /^[a-z]+\s+\d{4}$/i,
    // January 2024
    /^\d{1,2}(st|nd|rd|th)\s+[a-z]+\s+\d{4}$/i
    // 15th January 2024
  ];
  return datePatterns.some((pattern) => pattern.test(trimmed));
}

function looksLikeMetadata(text, maxLength = 100) {
  const trimmed = text.trim();
  if (trimmed.length > maxLength)
    return false;
  const metadataPatterns = [
    /^by\s+/i,
    // "By Author Name"
    /^written\s+by/i,
    // "Written by..."
    /^edited\s+by/i,
    // "Edited by..."
    /^\d+\s+min(utes?)?\s+read/i,
    // "5 min read"
    /^\d+\s+words?$/i,
    // "1234 words"
    /^updated?:?\s*/i,
    // "Updated: ..."
    /^published:?\s*/i,
    // "Published: ..."
    /^posted:?\s*/i
    // "Posted: ..."
  ];
  return metadataPatterns.some((pattern) => pattern.test(trimmed));
}

function normalizeHeadingForDedup(text) {
  return stripObjMarkers(text).toLowerCase().trim();
}

function stripObjMarkers(text) {
  if (!text)
    return "";
  return text.replace(/\uFFFC/g, "").replace(/\s*OBJ\s*/gi, " ").replace(/\s*\[OBJ\]\s*/gi, " ").replace(/<\/?OBJ>/gi, "").replace(/\s+/g, " ").trim();
}

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength)
    return text;
  return text.slice(0, maxLength - 3) + "...";
}

// --- Debug ---
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

function errorToConsoleSafe(...args) {
  try {
    console.error(...args);
  } catch (e) {
  }
}

function incrementContentType(debugInfo, contentType) {
  if (!debugInfo)
    return;
  debugInfo.contentTypes[contentType] = (debugInfo.contentTypes[contentType] || 0) + 1;
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

function logToConsoleSafe(...args) {
  try {
    console.log(...args);
  } catch (e) {
  }
}

function pushDebugLog(debugInfo, type, data) {
  if (!debugInfo)
    return;
  debugInfo.extractionLogs.push({ type, data });
}

function pushDebugMessage(debugInfo, type, message, data) {
  if (!debugInfo)
    return;
  debugInfo.extractionLogs.push({ type, message, data });
}

// --- SPA ---
function isSpaPage(doc) {
  const spaIndicators = [
    "#root",
    // React
    "#__next",
    // Next.js
    "#app",
    // Vue
    "[ng-app]",
    // Angular
    "[data-reactroot]",
    // React
    "[data-vue-app]",
    // Vue
    ".notion-app-inner"
    // Notion
  ];
  for (const selector of spaIndicators) {
    try {
      if (doc.querySelector(selector)) {
        return true;
      }
    } catch (e) {
    }
  }
  return false;
}

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

async function waitForElement(doc, selector, timeout = 5e3) {
  const CHECK_INTERVAL = 100;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        return element;
      }
    } catch (e) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
  }
  return null;
}

// --- Translate ---
function checkFirstParagraph(doc) {
  const firstP = doc.querySelector('main p, article p, [role="main"] p, #content p');
  if (!firstP)
    return null;
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

function extractOriginalTexts(container) {
  const originalTexts = /* @__PURE__ */ new Map();
  const translatedElements = container.querySelectorAll("[data-original-text]");
  for (const el of translatedElements) {
    const originalText = el.getAttribute("data-original-text");
    if (originalText && originalText.trim()) {
      originalTexts.set(el, originalText.trim());
    }
  }
  return originalTexts;
}

function getOriginalTextIfTranslated(element) {
  if (!element)
    return null;
  const originalText = element.getAttribute("data-original-text");
  if (originalText && originalText.trim()) {
    const currentText = element.textContent || element.innerText || "";
    if (originalText.trim() !== currentText.trim()) {
      return originalText.trim();
    }
  }
  const childWithOriginal = element.querySelector("[data-original-text]");
  if (childWithOriginal) {
    const childOriginal = childWithOriginal.getAttribute("data-original-text");
    if (childOriginal && childOriginal.trim()) {
      return childOriginal.trim();
    }
  }
  return null;
}

function isPageTranslated(doc) {
  if (doc.body.classList.contains("translated-ltr") || doc.body.classList.contains("translated-rtl")) {
    return true;
  }
  if (doc.querySelector(".goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element")) {
    return true;
  }
  if (doc.querySelectorAll("[data-original-text]").length > 0) {
    return true;
  }
  return false;
}

function processTranslatedElement(element) {
  const originalText = getOriginalTextIfTranslated(element);
  return {
    element,
    wasTranslated: !!originalText,
    originalText
  };
}

// --- Filters ---
function isExcluded(win, element, constants) {
  const {
    EXCLUDED_CLASSES: EXCLUDED_CLASSES2,
    PAYWALL_CLASSES: PAYWALL_CLASSES2,
    NAV_PATTERNS_CONTAINS,
    COURSE_AD_PATTERNS: COURSE_AD_PATTERNS2
  } = constants;
  const tagName = element.tagName.toLowerCase();
  const className = String(element.className || "").toLowerCase();
  const id = (element.id || "").toLowerCase();
  const isSemanticContainer = tagName === "article" || tagName === "main";
  const isImageOrFigure = tagName === "img" || tagName === "figure";
  const style = safeGetComputedStyle(win, element);
  if (!style) {
    return false;
  }
  if (isImageOrFigure) {
    if (style.display === "none" || style.visibility === "hidden") {
      const hasLazySrc = element.hasAttribute("data-src") || element.hasAttribute("data-lazy-src") || element.hasAttribute("data-original") || element.hasAttribute("data-srcset");
      if (hasLazySrc)
        return false;
      if (tagName === "figure") {
        const img = element.querySelector("img");
        if (img && (img.hasAttribute("data-src") || img.hasAttribute("data-lazy-src"))) {
          return false;
        }
      }
      return true;
    }
  } else {
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return true;
    }
  }
  if (tagName === "iframe") {
    const iframeElement = (
      /** @type {HTMLIFrameElement} */
      element
    );
    const src = (iframeElement.src || "").toLowerCase();
    const adPatterns = ["ad", "ads", "advertisement", "doubleclick", "googleads", "pubmatic"];
    if (adPatterns.some((pattern) => src.includes(pattern))) {
      return true;
    }
    return true;
  }
  if (isFootnoteLink(element))
    return true;
  if (isIcon(element))
    return true;
  if (tagName === "aside" || element.getAttribute("role") === "complementary") {
    return true;
  }
  const text = element.textContent || "";
  const textLower = text.toLowerCase();
  const textTrimmed = text.trim();
  if (!isSemanticContainer && element.querySelector && element.querySelector('input[type="email"]')) {
    const hasNewsletterText = textLower.includes("newsletter") || textLower.includes("subscribe") || textLower.includes("signup");
    if (hasNewsletterText)
      return true;
    const isInNavArea = safeClosest(element, "nav, aside, .sidebar, footer, header") !== null;
    if (isInNavArea)
      return true;
  }
  const adClasses = ["book-cta", "course-cta", "product-cta", "course-ad", "product-ad"];
  if (adClasses.some((adClass) => className.includes(adClass) || id.includes(adClass))) {
    return true;
  }
  if (PAYWALL_CLASSES2.some((paywallClass) => className.includes(paywallClass) || id.includes(paywallClass))) {
    return true;
  }
  const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
  const hasPrice = pricePattern.test(text);
  const isCourseAd = COURSE_AD_PATTERNS2.some((pattern) => textLower.includes(pattern));
  if (hasPrice && isCourseAd) {
    return true;
  }
  const role = element.getAttribute("role") || "";
  if (role === "tab" || role === "tabpanel" || safeClosest(element, '[role="tablist"]') !== null) {
    return true;
  }
  if (!isSemanticContainer && !isImageOrFigure) {
    const isParagraphOrHeading = tagName === "p" || tagName.match(/^h[1-6]$/);
    if (isParagraphOrHeading) {
      if (textTrimmed.length < 200 && matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
        return true;
      }
    } else {
      if (matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
        return true;
      }
    }
  }
  if (!isSemanticContainer && (textLower.includes("sign up to our newsletter") || textLower.includes("newsletter") && textLower.includes("subscribe"))) {
    return true;
  }
  if (textLower.includes("powered by salesforce") || textLower.includes("marketing cloud")) {
    return true;
  }
  for (const excluded of EXCLUDED_CLASSES2) {
    const pattern = new RegExp(`\\b${excluded}\\b`);
    if (pattern.test(className) || pattern.test(id) || className === excluded || className.startsWith(excluded + "-") || className.endsWith("-" + excluded)) {
      return true;
    }
  }
  if (!isSemanticContainer) {
    let parent = element.parentElement;
    let iterations = 0;
    const maxIterations = 50;
    while (parent && parent !== document.body && iterations < maxIterations) {
      iterations++;
      const parentClass = String(parent.className || "").toLowerCase();
      const parentId = (parent.id || "").toLowerCase();
      const parentTag = parent.tagName.toLowerCase();
      const clearAdIndicators = [/\bad\b/, /\badvertisement\b/, /\bsponsor\b/];
      const isClearAd = clearAdIndicators.some(
        (indicator) => indicator.test(parentClass) || indicator.test(parentId)
      );
      if (isClearAd || parentTag === "aside") {
        return true;
      }
      parent = parent.parentElement;
    }
  }
  return false;
}

function isFootnoteLink(element) {
  if (element.tagName.toLowerCase() !== "a")
    return false;
  const href = element.getAttribute("href") || "";
  if (href === "#" || href.startsWith("#") && href.length > 1 || href.includes("#note")) {
    const text = (element.textContent || "").trim();
    if (/^[\d\s]+$/.test(text) || /^[←→↑↓↗↘↩]+$/.test(text) || text.toLowerCase().includes("open these")) {
      return true;
    }
    const img = element.querySelector("img");
    if (img && (img.alt === "\u21A9" || img.src.includes("emoji") || String(img.className || "").includes("emoji"))) {
      return true;
    }
  }
  return false;
}

function isIcon(element) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "svg")
    return true;
  const className = String(element.className || "").toLowerCase();
  const id = (element.id || "").toLowerCase();
  if (className.includes("icon-") || className.includes("icon") || id.includes("icon")) {
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
    if (alt === "\u21A9" || /[←→↑↓↗↘↩]/.test(alt) || src.includes("emoji") && alt.includes("arrow")) {
      return true;
    }
  }
  return false;
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

function isWidget(win, element) {
  const style = safeGetComputedStyle(win, element);
  if (!style)
    return false;
  const position = style.position;
  if (position !== "fixed" && position !== "absolute")
    return false;
  const rect = element.getBoundingClientRect();
  if (rect.width > 400 || rect.height > 400)
    return false;
  const paragraphs = element.querySelectorAll("p");
  if (paragraphs.length > 2)
    return false;
  return true;
}

function matchesNavigationPattern(text, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

function shouldSkipStronglyExcluded(element) {
  const className = String(element.className || "").toLowerCase();
  const id = (element.id || "").toLowerCase();
  const strongPatterns = [/\bad\b/, /\bads\b/, /\bsponsor\b/];
  for (const pattern of strongPatterns) {
    if (pattern.test(className) || pattern.test(id)) {
      return true;
    }
  }
  return false;
}

// --- Discover ---
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
      if (normalizedDistance < 0.3)
        score += 10;
      else if (normalizedDistance < 0.5)
        score += 5;
      else if (normalizedDistance > 0.8)
        score *= 0.9;
      const isVisible = rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0;
      if (isVisible)
        score += 5;
    }
  } catch (e) {
  }
  const id = (element.id || "").toLowerCase();
  const className = String(element.className || "").toLowerCase();
  if (id === "root" || id === "app" || id === "__next" || className.includes("notion-page") || element.hasAttribute("data-reactroot")) {
    if (textLength >= 500)
      score += 50;
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
  if (linkDensity > 0.3)
    score *= 0.4;
  else if (linkDensity > 0.2)
    score *= 0.6;
  else if (linkDensity > 0.1)
    score *= 0.8;
  const contentLinkRatio = totalLinkTextLength > 0 ? (totalLinkTextLength - navigationLinkLength) / totalLinkTextLength : 0;
  if (contentLinkRatio > 0.7 && links.length > 0) {
    score *= 1.1;
  }
  const commaCount = (text.match(/,/g) || []).length;
  if (commaCount > 10)
    score *= 1.2;
  else if (commaCount > 5)
    score *= 1.1;
  const sentenceCount = (text.match(/[.!?]+\s+/g) || []).length;
  if (sentenceCount > 5)
    score += Math.min(sentenceCount * 2, 30);
  const tagName = element.tagName.toLowerCase();
  if (tagName === "article")
    score *= 2;
  else if (tagName === "main")
    score *= 1.5;
  else if (tagName === "section" && paragraphs.length >= 3)
    score *= 1.2;
  if (isLikelyContentContainer(element))
    score += 100;
  if (textLength < 100)
    score *= 0.5;
  else if (textLength < 200)
    score *= 0.8;
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
    if (hasNewsletterText)
      score -= 1e3;
    else
      score -= 50;
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
  if (longParagraphs > 3)
    score += longParagraphs * 5;
  return score;
}

function findMainContent(win, doc, isExcluded2, debugInfo, pushDebugLog2) {
  const spaSelectors = [
    "#root",
    "#app",
    "#__next",
    "[data-reactroot]",
    "[ng-app]",
    ".notion-page-content",
    ".notion-page"
  ];
  for (const selector of spaSelectors) {
    try {
      const spaRoot = doc.querySelector(selector);
      if (spaRoot) {
        const spaText = (spaRoot.textContent || "").trim();
        if (spaText.length >= 500) {
          const specificContent = spaRoot.querySelector('article, main, [role="main"], .article-content, .post-content');
          if (specificContent && (specificContent.textContent || "").trim().length >= 500) {
            if (!isExcluded2(specificContent))
              return specificContent;
          }
          if (!isExcluded2(spaRoot) || isLikelyContentContainer(spaRoot)) {
            return spaRoot;
          }
        }
      }
    } catch (e) {
    }
  }
  const article = doc.querySelector("article");
  if (article) {
    const articleText = (article.textContent || "").trim();
    if (articleText.length > 500) {
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
  const main = doc.querySelector("main");
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
      const specificContent = main.querySelector(".wysiwyg, .article-content, .post-content");
      if (specificContent && (specificContent.textContent || "").trim().length > 500) {
        if (!isExcluded2(specificContent))
          return specificContent;
      }
      if (!isExcluded2(main))
        return main;
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
          if (isLikelyContentContainer(element) || !isExcluded2(element)) {
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
    if (!isLikelyContentContainer(candidate) && isExcluded2(candidate))
      continue;
    const candidateText = (candidate.textContent || "").trim();
    if (candidateText.length < 100)
      continue;
    const score = calculateContentScore(win, candidate);
    if (score > 100)
      return candidate;
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = candidate;
    }
  }
  return bestCandidate && maxScore > 0 ? bestCandidate : null;
}

function hasSubstantialContent(element) {
  const text = (element.textContent || "").trim();
  const paragraphs = element.querySelectorAll("p");
  return text.length > 100 && (paragraphs.length >= 1 || text.length > 300);
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

// --- Metadata ---
function extractAuthorFromUrl(url) {
  if (!url)
    return null;
  try {
    const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
    if (profileMatch) {
      const slug = profileMatch[1];
      const parts = slug.split(/[-_]/);
      if (parts.length > 1) {
        const name2 = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
        if (name2.length > 2 && name2.length < 100)
          return name2;
      }
      const camelCaseMatch = slug.match(/^([a-z]+)([A-Z][a-z]*)$/);
      if (camelCaseMatch) {
        const name2 = [
          camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
          camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
        ].join(" ");
        if (name2.length > 2 && name2.length < 100)
          return name2;
      }
      const name = slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase();
      if (name.length > 2 && name.length < 100)
        return name;
    }
  } catch (e) {
  }
  return null;
}

function extractMetadata(doc, baseUrl) {
  const metadata = {
    title: "",
    author: "",
    publishDate: ""
  };
  const h1InArticle = doc.querySelector("article h1");
  if (h1InArticle && isValidArticleTitle(h1InArticle)) {
    metadata.title = cleanHeadingText(h1InArticle.textContent || "");
  }
  if (!metadata.title) {
    const h1InMain = doc.querySelector("main h1");
    if (h1InMain && isValidArticleTitle(h1InMain)) {
      metadata.title = cleanHeadingText(h1InMain.textContent || "");
    }
  }
  if (!metadata.title) {
    const firstH1 = doc.querySelector("h1");
    if (firstH1 && isValidArticleTitle(firstH1)) {
      metadata.title = cleanHeadingText(firstH1.textContent || "");
    }
  }
  if (!metadata.title) {
    metadata.title = doc.title || "";
  }
  const authorSelectors = [
    'meta[name="author"]',
    'meta[name="citation_author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    ".author",
    ".byline",
    ".meta-author",
    '[itemprop="author"]',
    'a[rel="author"]',
    'a[href*="/author/"]',
    'a[href*="/profile/"]'
  ];
  for (const selector of authorSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        let authorText = "";
        if (element.tagName === "META") {
          authorText = element.getAttribute("content") || "";
        } else {
          authorText = (element.textContent || "").trim();
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
    } catch (e) {
    }
  }
  const dateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="date"]',
    'meta[name="citation_date"]',
    "time[datetime]",
    "time[pubdate]",
    '[itemprop="datePublished"]',
    ".published",
    ".date",
    ".meta-date"
  ];
  for (const selector of dateSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        let dateValue = "";
        if (element.tagName === "META") {
          dateValue = element.getAttribute("content") || "";
        } else if (element.tagName === "TIME") {
          dateValue = element.getAttribute("datetime") || element.textContent || "";
        } else {
          dateValue = (element.textContent || "").trim();
        }
        const parsed = parseDateToISO(dateValue);
        if (parsed) {
          metadata.publishDate = parsed;
          break;
        }
      }
    } catch (e) {
    }
  }
  return metadata;
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
  return months[monthName.toLowerCase()] || null;
}

function isValidArticleTitle(h1Element) {
  if (!h1Element || !h1Element.textContent)
    return false;
  const text = (h1Element.textContent || "").trim();
  if (text.length < 5)
    return false;
  const siteNamePatterns = ["home", "about", "contact", "blog", "news", "archive"];
  const lowerText = text.toLowerCase();
  if (siteNamePatterns.some((pattern) => lowerText === pattern))
    return false;
  return true;
}

function parseDateToISO(dateStr) {
  if (!dateStr)
    return null;
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch)
    return isoMatch[0];
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
  }
  const ordinalMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
  if (ordinalMatch) {
    const day = ordinalMatch[1].padStart(2, "0");
    const month = getMonthNumber(ordinalMatch[2]);
    const year = ordinalMatch[3];
    if (month)
      return `${year}-${month}-${day}`;
  }
  const monthYearMatch = dateStr.match(/(\w+)\s+(\d{4})/i);
  if (monthYearMatch) {
    const month = getMonthNumber(monthYearMatch[1]);
    const year = monthYearMatch[2];
    if (month)
      return `${year}-${month}`;
  }
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch)
    return yearMatch[1];
  return null;
}

// --- Images ---
function extractBestImageUrl(imgElement) {
  if (!imgElement)
    return null;
  let src = null;
  if (imgElement.currentSrc && imgElement.currentSrc.length > 0 && !isPlaceholderUrl(imgElement.currentSrc)) {
    src = imgElement.currentSrc;
  }
  if (!src) {
    const imgSrc = imgElement.src || imgElement.getAttribute("src");
    if (imgSrc && imgSrc.length > 0 && !isPlaceholderUrl(imgSrc)) {
      src = imgSrc;
    }
  }
  if (!src) {
    const srcset = imgElement.getAttribute("srcset");
    if (srcset) {
      src = getBestSrcsetUrl(srcset);
    }
  }
  if (!src) {
    const picture = imgElement.closest("picture");
    if (picture) {
      for (const source of Array.from(picture.querySelectorAll("source[srcset]"))) {
        const srcset = source.getAttribute("srcset");
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
      if (val && !val.includes("data:") && !isPlaceholderUrl(val)) {
        if (attr === "data-srcset") {
          src = getBestSrcsetUrl(val);
        } else {
          src = val;
        }
        if (src)
          break;
      }
    }
  }
  if (!src) {
    const parentLink = imgElement.closest("a[href]");
    if (parentLink) {
      const href = parentLink.getAttribute("href");
      if (href && (href.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || href.includes("image"))) {
        src = href;
      }
    }
  }
  return src;
}

function extractFeaturedImage(doc, baseUrl, mainContent, logoPatterns) {
  const featuredImageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="article:image"]',
    'meta[name="image"]',
    '[itemprop="image"]'
  ];
  for (const selector of featuredImageSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        const content = element.tagName === "META" ? element.getAttribute("content") : element instanceof HTMLImageElement ? element.src : element.getAttribute("src");
        if (content) {
          const absoluteUrl = toAbsoluteUrl(content, baseUrl);
          const urlLower = absoluteUrl.toLowerCase();
          if (!logoPatterns.some((pattern) => urlLower.includes(pattern.toLowerCase()))) {
            return { src: absoluteUrl, alt: "", caption: "" };
          }
        }
      }
    } catch (e) {
    }
  }
  if (mainContent) {
    const firstParagraph = mainContent.querySelector("p");
    const images = mainContent.querySelectorAll("img");
    for (const img of Array.from(images)) {
      if (firstParagraph && img.compareDocumentPosition(firstParagraph) & Node.DOCUMENT_POSITION_PRECEDING) {
        break;
      }
      const imgElement = (
        /** @type {HTMLImageElement} */
        img
      );
      const src = extractBestImageUrl(imgElement);
      if (!src)
        continue;
      const naturalWidth = imgElement.naturalWidth || 0;
      const naturalHeight = imgElement.naturalHeight || 0;
      if (naturalWidth >= 400 || naturalHeight >= 300 || naturalWidth === 0 && naturalHeight === 0) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl);
        const urlLower = absoluteUrl.toLowerCase();
        if (logoPatterns.some((pattern) => urlLower.includes(pattern.toLowerCase()))) {
          continue;
        }
        return {
          src: absoluteUrl,
          alt: imgElement.alt || "",
          caption: getImageCaption(imgElement)
        };
      }
    }
  }
  return null;
}

function getBestSrcsetUrl(srcset) {
  if (!srcset)
    return null;
  const sources = srcset.split(",").map((s) => s.trim());
  let bestUrl = null;
  let bestSize = 0;
  for (const source of sources) {
    const parts = source.trim().split(/\s+/);
    if (parts.length < 1)
      continue;
    const url = parts[0];
    if (isPlaceholderUrl(url))
      continue;
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
      if (!bestUrl)
        bestUrl = url;
    }
  }
  return bestUrl;
}

function getImageCaption(img) {
  const figure = img.closest("figure");
  if (figure) {
    const figcaption = figure.querySelector("figcaption");
    if (figcaption)
      return (figcaption.textContent || "").trim();
  }
  const ariaLabel = img.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim())
    return ariaLabel.trim();
  const title = img.getAttribute("title");
  if (title && title.trim() && title !== img.alt)
    return title.trim();
  const nextSibling = img.nextElementSibling;
  if (nextSibling && (nextSibling.tagName === "P" || String(nextSibling.className || "").toLowerCase().includes("caption"))) {
    return (nextSibling.textContent || "").trim();
  }
  const parent = img.parentElement;
  if (parent) {
    const captionEl = parent.querySelector(".caption, .image-caption, .photo-caption");
    if (captionEl) {
      const captionText = (captionEl.textContent || "").trim();
      if (captionText && captionText !== img.alt)
        return captionText;
    }
  }
  return "";
}

function isDecorativeImage(win, img, logoPatterns) {
  if (!img)
    return false;
  const src = (img.src || "").toLowerCase();
  const alt = (img.alt || "").toLowerCase();
  const className = String(img.className || "").toLowerCase();
  const id = (img.id || "").toLowerCase();
  if (className.includes("headshot") || id.includes("headshot") || className.includes("author-photo") || className.includes("author-image") || className.includes("byline-thumbnail") || className.includes("contributor-thumbnail")) {
    return true;
  }
  let checkParent = img.parentElement;
  for (let i = 0; i < 5 && checkParent; i++) {
    const parentClass = String(checkParent.className || "").toLowerCase();
    const parentId = (checkParent.id || "").toLowerCase();
    if (parentClass.includes("contributor") || parentClass.includes("byline") || parentClass.includes("author-info") || parentClass.includes("author-bio")) {
      const naturalWidth2 = img.naturalWidth || img.width || 0;
      const naturalHeight2 = img.naturalHeight || img.height || 0;
      if (naturalWidth2 > 0 && naturalHeight2 > 0 && naturalWidth2 <= 150 && naturalHeight2 <= 150) {
        return true;
      }
    }
    checkParent = checkParent.parentElement;
  }
  if (alt && (alt.includes("'s avatar") || alt.includes(" avatar") || alt === "avatar")) {
    const naturalWidth2 = img.naturalWidth || img.width || 0;
    const naturalHeight2 = img.naturalHeight || img.height || 0;
    if (naturalWidth2 > 0 && naturalHeight2 > 0 && naturalWidth2 <= 50 && naturalHeight2 <= 50) {
      return true;
    }
  }
  if (logoPatterns.some((pattern) => src.includes(pattern.toLowerCase()))) {
    return true;
  }
  if (alt && (alt.includes("logo") || alt.includes("icon") || alt.includes("brand") || alt.includes("social"))) {
    return true;
  }
  if (className.includes("logo") || className.includes("icon") || className.includes("brand") || className.includes("social") || className.includes("share")) {
    return true;
  }
  const naturalWidth = img.naturalWidth || img.width || 0;
  const naturalHeight = img.naturalHeight || img.height || 0;
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
    if (src.includes("icon") || src.includes("logo") || src.includes("social")) {
      return true;
    }
  }
  return false;
}

function isPlaceholderUrl(url) {
  if (!url)
    return true;
  if (url.startsWith("data:image")) {
    if (url.includes("1x1") || url.includes("transparent") || url.length < 100) {
      return true;
    }
  }
  const placeholderPatterns = ["placeholder", "spacer", "blank", "1x1", "pixel.gif"];
  const urlLower = url.toLowerCase();
  return placeholderPatterns.some((pattern) => urlLower.includes(pattern));
}

function isTrackingPixel(win, img) {
  try {
    const style = safeGetComputedStyle(win, img);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
      const naturalWidth2 = img.naturalWidth || 0;
      const naturalHeight2 = img.naturalHeight || 0;
      if (naturalWidth2 > 0 && naturalHeight2 > 0 && naturalWidth2 <= 3 && naturalHeight2 <= 3) {
        return true;
      }
    }
  } catch (e) {
  }
  const naturalWidth = img.naturalWidth || 0;
  const naturalHeight = img.naturalHeight || 0;
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
    return true;
  }
  const src = (img.src || "").toLowerCase();
  const trackingPatterns = ["pixel", "tracking", "beacon", "analytics", "facebook.com/tr", "doubleclick", "googleads"];
  return trackingPatterns.some((pattern) => src.includes(pattern));
}

// --- Standfirst ---
function extractStandfirst(mainContent) {
  if (!mainContent) {
    return { text: null, element: null };
  }
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      const element = mainContent.querySelector(selector);
      if (element) {
        const text = (element.textContent || "").trim();
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) {
    }
  }
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      const element = document.querySelector(selector);
      if (element && mainContent.contains(element)) {
        const text = (element.textContent || "").trim();
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) {
    }
  }
  const paragraphs = mainContent.querySelectorAll("p");
  for (const p of paragraphs) {
    const text = (p.textContent || "").trim();
    if (text.length >= 50 && text.length <= 200) {
      const hasLinks = p.querySelectorAll("a").length > 0;
      if (!hasLinks && !looksLikeArticleStarter(text)) {
        const allParagraphs2 = Array.from(paragraphs);
        const index = allParagraphs2.indexOf(p);
        if (index <= 2) {
          const firstWord = text.split(/\s+/)[0].toLowerCase();
          const commonStarters = ["the", "a", "an", "in", "on", "when", "where", "why", "how"];
          if (!commonStarters.includes(firstWord)) {
            return { text, element: p };
          }
        }
      }
    }
    const allParagraphs = Array.from(paragraphs);
    if (allParagraphs.indexOf(p) > 3)
      break;
  }
  return { text: null, element: null };
}

function isStandfirstText(text, standfirstText) {
  if (!standfirstText)
    return false;
  const normalizedText = text.trim().toLowerCase();
  const normalizedStandfirst = standfirstText.trim().toLowerCase();
  if (normalizedText === normalizedStandfirst)
    return true;
  if (normalizedText.includes(normalizedStandfirst) || normalizedStandfirst.includes(normalizedText)) {
    const lengthRatio = Math.min(normalizedText.length, normalizedStandfirst.length) / Math.max(normalizedText.length, normalizedStandfirst.length);
    if (lengthRatio > 0.8)
      return true;
  }
  return false;
}

// --- Parse ---
function collectCandidateElements(mainContent, win) {
  const hostname = win?.location?.hostname || "";
  console.log("[ClipAIble Extraction] collectCandidateElements called", {
    hostname,
    mainContentTag: mainContent?.tagName,
    mainContentClass: mainContent?.className?.substring?.(0, 50)
  });
  if (hostname.includes("habr.com")) {
    const articleBody = mainContent.querySelector(".article-formatted-body");
    if (articleBody) {
      return Array.from(articleBody.querySelectorAll(CANDIDATE_SELECTOR));
    }
    const articleBodyFallback = mainContent.querySelector(".article-body");
    if (articleBodyFallback) {
      return Array.from(articleBodyFallback.querySelectorAll(CANDIDATE_SELECTOR));
    }
  }
  if (hostname.includes("nature.com") || hostname.includes("springer.com") || hostname.includes("biomedcentral.com") || hostname.includes("springernature.com")) {
    const cArticleBody = mainContent.querySelector(".c-article-body");
    console.log("[ClipAIble Extraction] Nature/Springer detected", {
      hasCArticleBody: !!cArticleBody,
      textLength: cArticleBody?.textContent?.length || 0,
      paragraphs: cArticleBody?.querySelectorAll("p")?.length || 0
    });
    if (cArticleBody) {
      const text = cArticleBody.textContent?.trim() || "";
      const paragraphs = cArticleBody.querySelectorAll("p").length;
      if (text.length > 1e3 && paragraphs > 5) {
        const elements = Array.from(cArticleBody.querySelectorAll(CANDIDATE_SELECTOR));
        console.log("[ClipAIble Extraction] Using c-article-body", {
          elementsCount: elements.length,
          figures: elements.filter((e) => e.tagName === "FIGURE").length
        });
        return elements;
      }
    }
    const articleSections = mainContent.querySelectorAll(".c-article-section__content");
    if (articleSections.length > 0) {
      const allElements = [];
      for (const section of articleSections) {
        allElements.push(...Array.from(section.querySelectorAll(CANDIDATE_SELECTOR)));
      }
      if (allElements.length > 10) {
        return allElements;
      }
    }
  }
  const entryContent = mainContent.querySelector(".entry-content");
  if (entryContent) {
    return Array.from(entryContent.querySelectorAll(CANDIDATE_SELECTOR));
  }
  const pageTitle = win.document.title.split(/[|–—]/)[0].trim();
  const pageTitleWords = pageTitle.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
  const contentSelectors = [
    ".post-content",
    ".post__content",
    // Quanta Magazine
    ".post",
    // Slate Star Codex
    ".content",
    ".main-content",
    ".article-content",
    // Nautilus
    ".main-body"
    // Nautilus (if contains h1)
  ];
  for (const selector of contentSelectors) {
    const contentElement = mainContent.querySelector(selector);
    if (contentElement) {
      const h1 = contentElement.querySelector("h1");
      if (h1) {
        const h1Text = h1.textContent?.trim() || "";
        const matchesTitle = pageTitleWords.length > 0 && pageTitleWords.some(
          (word) => h1Text.toLowerCase().includes(word.toLowerCase())
        );
        if (matchesTitle) {
          return Array.from(contentElement.querySelectorAll(CANDIDATE_SELECTOR));
        }
      }
      const text = contentElement.textContent?.trim() || "";
      const paragraphs = contentElement.querySelectorAll("p").length;
      if (text.length > 5e3 && paragraphs > 10) {
        return Array.from(contentElement.querySelectorAll(CANDIDATE_SELECTOR));
      }
    }
  }
  const allArticles = Array.from(mainContent.querySelectorAll("article"));
  if (allArticles.length > 0) {
    const pageTitle2 = win.document.title.split(/[|–—]/)[0].trim();
    const pageTitleWords2 = pageTitle2.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
    let mainArticle = null;
    for (const article of allArticles) {
      const text = article.textContent?.trim() || "";
      if (/sponsored|advertisement|^\s*#SPONSORED/i.test(text))
        continue;
      if (/related\s+(stories|articles|posts)/i.test(text))
        continue;
      const h1 = article.querySelector("h1");
      if (h1) {
        const h1Text = h1.textContent?.trim() || "";
        const matchesTitle = pageTitleWords2.length > 0 && pageTitleWords2.some(
          (word) => h1Text.toLowerCase().includes(word.toLowerCase())
        );
        if (matchesTitle || h1Text.length > 20) {
          mainArticle = article;
          break;
        }
      }
      if (!mainArticle && text.length > 1e4) {
        const parent = article.parentElement;
        const isInSidebar = parent && (parent.tagName.toLowerCase() === "aside" || /\bsidebar\b/i.test(parent.className || "") || /\bsidebar\b/i.test(parent.id || ""));
        if (!isInSidebar) {
          mainArticle = article;
        }
      }
    }
    if (mainArticle) {
      return Array.from(mainArticle.querySelectorAll(CANDIDATE_SELECTOR));
    }
    const firstNonAdArticle = allArticles.find((article) => {
      const text = article.textContent?.trim() || "";
      const hasH1 = !!article.querySelector("h1");
      return (hasH1 || text.length > 1e4) && text.length > 1e3 && !/sponsored|advertisement|^\s*#SPONSORED/i.test(text) && !/related\s+(stories|articles|posts)/i.test(text);
    });
    if (firstNonAdArticle) {
      return Array.from(firstNonAdArticle.querySelectorAll(CANDIDATE_SELECTOR));
    }
  }
  const allDivs = Array.from(mainContent.querySelectorAll("div"));
  const contentDivs = allDivs.filter((div) => {
    const text = div.textContent?.trim() || "";
    const paragraphs = div.querySelectorAll("p").length;
    return text.length > 5e3 && paragraphs > 10;
  });
  if (contentDivs.length > 0) {
    const pageTitle2 = win.document.title.split(/[|–—]/)[0].trim();
    const pageTitleWords2 = pageTitle2.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
    for (const div of contentDivs) {
      const h1 = div.querySelector("h1");
      if (h1) {
        const h1Text = h1.textContent?.trim() || "";
        const matchesTitle = pageTitleWords2.length > 0 && pageTitleWords2.some(
          (word) => h1Text.toLowerCase().includes(word.toLowerCase())
        );
        if (matchesTitle) {
          return Array.from(div.querySelectorAll(CANDIDATE_SELECTOR));
        }
      }
    }
    const largestDiv = contentDivs.reduce((best, current) => {
      const currentText = current.textContent?.trim().length || 0;
      const bestText = best.textContent?.trim().length || 0;
      return currentText > bestText ? current : best;
    });
    return Array.from(largestDiv.querySelectorAll(CANDIDATE_SELECTOR));
  }
  return Array.from(mainContent.querySelectorAll(CANDIDATE_SELECTOR));
}

function deduplicateHeadings(content) {
  const seenHeadings = /* @__PURE__ */ new Set();
  return content.filter((item) => {
    if (item.type !== "heading")
      return true;
    const normalized = normalizeHeadingForDedup(item.text || "");
    if (seenHeadings.has(normalized))
      return false;
    seenHeadings.add(normalized);
    return true;
  });
}

function filterCandidateElements(win, allElements, constants, debugInfo) {
  let excludedImageCount = 0;
  let excludedByType = {};
  const filteredElements = allElements.filter((el) => {
    const tagName = el.tagName.toLowerCase();
    const isImageOrFigure = tagName === "img" || tagName === "figure";
    if (isExcluded(win, el, constants)) {
      if (isImageOrFigure) {
        excludedImageCount++;
        console.log("[ClipAIble Extraction] Excluded image/figure", {
          tag: tagName,
          className: el.className?.substring?.(0, 40) || "",
          parentClass: el.parentElement?.className?.substring?.(0, 40) || "",
          src: (() => {
            if (tagName === "img") {
              const imgSrc = (
                /** @type {any} */
                el.src
              );
              return imgSrc ? imgSrc.substring(0, 50) : "";
            }
            const img = el.querySelector?.("img");
            return img && /** @type {any} */
            img.src ? (
              /** @type {any} */
              img.src.substring(0, 50)
            ) : "";
          })()
        });
      } else
        excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
      return false;
    }
    return true;
  });
  if (debugInfo) {
    debugInfo.excludedImageCount = excludedImageCount;
  }
  return filteredElements;
}

function handleBlockquote(element) {
  const text = (element.innerHTML || "").trim();
  if (!text)
    return null;
  return {
    type: "quote",
    text
  };
}

function handleCode(element) {
  let text = "";
  if (element.tagName === "PRE") {
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
  } else {
    text = (element.textContent || "").trim();
  }
  if (!text)
    return null;
  const className = element.className || "";
  const languageMatch = className.match(/language-(\w+)/);
  const language = languageMatch ? languageMatch[1] : "";
  return {
    type: "code",
    language,
    text
  };
}

function handleDiv(element, state, constants) {
  if (element.closest("blockquote"))
    return null;
  if (element.closest("figure") && element.tagName.toLowerCase() !== "figcaption") {
    return null;
  }
  if (element.closest("table"))
    return null;
  const text = (element.textContent || "").trim();
  if (isStandfirstText(text, state.standfirstText))
    return null;
  if (text.length < 10)
    return null;
  const className = String(element.className || "").toLowerCase();
  const id = (element.id || "").toLowerCase();
  if (className.includes("nav") || className.includes("button") || className.includes("icon") || className.includes("menu") || className.includes("sidebar") || className.includes("widget") || className.includes("modal") || className.includes("popup") || className.includes("tooltip") || id.includes("nav") || id.includes("menu") || id.includes("sidebar")) {
    return null;
  }
  if (className.includes("jw-") || className.includes("video-player") || className.includes("player") || className.includes("shortcuts") || id.includes("video") || id.includes("player")) {
    return null;
  }
  const lowerText = text.toLowerCase();
  if (lowerText.includes("volume") || lowerText.includes("shortcut") || lowerText.includes("caption") || lowerText.includes("fullscreen") || lowerText.includes("mute") || lowerText.includes("unmute") || lowerText.includes("play") || lowerText.includes("pause") || /^\d+\s+of\s+\d+\s+(minute|second|hour)/i.test(text) || /^[←→↑↓↗↘◀▶▲▼↩]/.test(text) || /^[a-z]\s*$/i.test(text)) {
    return null;
  }
  if (element.querySelector('button, a[role="button"], input, select, textarea')) {
    return null;
  }
  if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 15);
  if (sentences.length < 1)
    return null;
  if (lowerText.startsWith("by ") && text.length < 150)
    return null;
  if (lowerText.startsWith("edited by") && text.length < 150)
    return null;
  if (/^\d+\s+words?$/i.test(text))
    return null;
  if (/^\d+\s+min(utes?)?\s+read$/i.test(text))
    return null;
  if (lowerText.includes("newsletter") && lowerText.includes("subscribe")) {
    return null;
  }
  if (lowerText.includes("create an account to read") || lowerText.includes("member-only story") || lowerText.includes("sign up to read") || lowerText.includes("subscribe to read") || lowerText.includes("to read the full story") || lowerText.includes("sign up") && lowerText.includes("read") || lowerText.includes("subscribe") && lowerText.includes("read")) {
    return null;
  }
  if (lowerText.includes("donate") && (lowerText.includes("support") || lowerText.includes("mission"))) {
    return null;
  }
  if (lowerText.includes("advertisement") || lowerText.includes("advertising") || lowerText.includes("scroll to continue") || lowerText.includes("continue reading")) {
    return null;
  }
  if ((lowerText.includes("reporting by") || lowerText.includes("reported by")) && (lowerText.includes("editing by") || lowerText.includes("edited by"))) {
    return null;
  }
  if (lowerText.includes("item ") && lowerText.includes(" of ") && /\d+ of \d+/.test(text) || lowerText.includes("reuters/") || lowerText.includes("associated press") || lowerText.includes("photo by") || lowerText.includes("caption:")) {
    return null;
  }
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (state.addedParagraphs && state.addedParagraphs.has(normalizedText)) {
    return null;
  }
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText || sanitizeParagraphHtml(element);
  if (!state.addedParagraphs)
    state.addedParagraphs = /* @__PURE__ */ new Set();
  state.addedParagraphs.add(normalizedText);
  return {
    type: "paragraph",
    text: finalText,
    html: finalText
  };
}

function handleFigure(win, element, state, constants, baseUrl) {
  const img = element.querySelector("img");
  if (!img)
    return null;
  const src = extractBestImageUrl(
    /** @type {HTMLImageElement} */
    img
  );
  if (!src)
    return null;
  if (isTrackingPixel(
    win,
    /** @type {HTMLImageElement} */
    img
  ))
    return null;
  if (isDecorativeImage(
    win,
    /** @type {HTMLImageElement} */
    img,
    constants.LOGO_PATTERNS || []
  ))
    return null;
  const absoluteSrc = toAbsoluteUrl(src, baseUrl);
  const normalizedSrc = normalizeImageUrl(absoluteSrc);
  if (state.processedImages.has(normalizedSrc))
    return null;
  if (state.processedImages.size < 1e3) {
    state.processedImages.add(normalizedSrc);
  }
  const figcaption = element.querySelector("figcaption");
  let caption = figcaption ? (figcaption.textContent || "").trim() : "";
  if (!caption) {
    caption = getImageCaption(
      /** @type {HTMLImageElement} */
      img
    );
  }
  return {
    type: "image",
    src: absoluteSrc,
    alt: img.alt || "",
    caption
  };
}

function handleHeading(element, state, constants) {
  if (state.standfirstElement && element === state.standfirstElement)
    return null;
  const rawText = element.textContent || "";
  const cleanedText = cleanHeadingText(rawText);
  if (isStandfirstText(cleanedText, state.standfirstText))
    return null;
  if (isNumericHeading(cleanedText))
    return null;
  if (cleanedText.length < 3)
    return null;
  const normalizedHeading = normalizeHeadingForDedup(cleanedText);
  if (normalizedHeading === state.mainTitleText)
    return null;
  if (state.addedHeadings.has(normalizedHeading))
    return null;
  const lowerText = cleanedText.toLowerCase();
  if (lowerText.includes("subscribe") || lowerText.includes("sign up") || lowerText.includes("newsletter") || lowerText.includes("promotional") || lowerText.includes("create an account") || lowerText.includes("member-only") || lowerText.includes("sign in") || lowerText.includes("already have an account")) {
    return null;
  }
  if (lowerText.includes("similar post") || lowerText.includes("highlights from our") || lowerText.includes("atavist magazine collection")) {
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
  state.addedHeadings.add(normalizedHeading);
  const level = parseInt(element.tagName.charAt(1));
  return {
    type: "heading",
    level,
    text: cleanedText,
    id: element.id || void 0
  };
}

function handleImg(win, element, state, constants, baseUrl) {
  if (element.closest("figure"))
    return null;
  const img = (
    /** @type {HTMLImageElement} */
    element
  );
  const src = extractBestImageUrl(img);
  if (!src)
    return null;
  if (isTrackingPixel(win, img))
    return null;
  if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || []))
    return null;
  const absoluteSrc = toAbsoluteUrl(src, baseUrl);
  const normalizedSrc = normalizeImageUrl(absoluteSrc);
  if (state.processedImages.has(normalizedSrc))
    return null;
  if (state.processedImages.size < 1e3) {
    state.processedImages.add(normalizedSrc);
  }
  return {
    type: "image",
    src: absoluteSrc,
    alt: img.alt || "",
    caption: getImageCaption(img)
  };
}

function handleList(element) {
  if (element.closest("blockquote"))
    return null;
  if (element.closest("figure"))
    return null;
  if (element.closest("table"))
    return null;
  if (element.closest(".navbox, .authority-control, .side-box, .sister-box, .sistersitebox, .sidebar, .infobox, .hatnote, .mw-panel-toc, .vector-toc, #toc")) {
    return null;
  }
  const items = Array.from(element.querySelectorAll("li")).map((li) => {
    const clone = (
      /** @type {Element} */
      li.cloneNode(true)
    );
    processMathElements(clone);
    return (clone.textContent || "").trim();
  }).filter((text) => text.length > 0);
  if (items.length === 0)
    return null;
  return {
    type: "list",
    ordered: element.tagName === "OL",
    items
  };
}

function handleParagraph(win, element, state, constants) {
  if (element.closest("blockquote"))
    return null;
  if (element.closest("figure"))
    return null;
  if (element.closest("table"))
    return null;
  if (state.standfirstElement && element === state.standfirstElement)
    return null;
  const text = (element.textContent || "").trim();
  if (isStandfirstText(text, state.standfirstText))
    return null;
  if (text.length < 5)
    return null;
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith("by ") && text.length < 100)
    return null;
  if (lowerText.startsWith("edited by") && text.length < 100)
    return null;
  if (/^\d+\s+words?$/i.test(text))
    return null;
  if (/^\d+\s+min(utes?)?\s+read$/i.test(text))
    return null;
  if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }
  if (lowerText.includes("newsletter") && lowerText.includes("subscribe")) {
    return null;
  }
  if (lowerText.includes("create an account to read") || lowerText.includes("member-only story") || lowerText.includes("sign up to read") || lowerText.includes("subscribe to read") || lowerText.includes("to read the full story") || lowerText.includes("sign up") && lowerText.includes("read") || lowerText.includes("subscribe") && lowerText.includes("read")) {
    return null;
  }
  if (lowerText.includes("donate") && (lowerText.includes("support") || lowerText.includes("mission"))) {
    return null;
  }
  if (lowerText.includes("like what you're reading") && lowerText.includes("subscribe to the atavist magazine")) {
    return null;
  }
  if (lowerText.includes("the atavist magazine") && lowerText.includes("credits")) {
    return null;
  }
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText || sanitizeParagraphHtml(element);
  return {
    type: "paragraph",
    text: finalText,
    html: finalText
  };
}

function handleTable(element) {
  if (element.closest("blockquote"))
    return null;
  const className = String(element.className || "").toLowerCase();
  if (className.includes("navbox") || className.includes("authority-control")) {
    return null;
  }
  const tableText = (element.textContent || "").trim();
  if (tableText.length < 50)
    return null;
  const clone = element.cloneNode(true);
  const allElements = (
    /** @type {HTMLElement} */
    clone.querySelectorAll("*")
  );
  for (const el of Array.from(allElements)) {
    el.removeAttribute("style");
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return {
    type: "paragraph",
    text: (
      /** @type {HTMLElement} */
      clone.outerHTML
    ),
    html: (
      /** @type {HTMLElement} */
      clone.outerHTML
    )
  };
}

function parseElements(win, elements, state, constants, baseUrl) {
  const content = [];
  let processedCount = 0;
  let skippedCount = 0;
  let stopProcessing = false;
  for (const element of elements) {
    if (stopProcessing) {
      skippedCount++;
      continue;
    }
    const tagName = element.tagName.toLowerCase();
    if (shouldSkipStronglyExcluded(element)) {
      skippedCount++;
      continue;
    }
    if (tagName.match(/^h[1-6]$/)) {
      const headingText = (element.textContent || "").trim();
      if (isEndOfContentSection(headingText)) {
        stopProcessing = true;
        pushDebugLog(state.debugInfo, `Stopping extraction at section: "${headingText}"`);
        continue;
      }
      const isReal = isRealHeading(element, win);
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
    } else if (tagName === "p") {
      const item = handleParagraph(win, element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, "paragraph");
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === "figure") {
      const item = handleFigure(win, element, state, constants, baseUrl);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, "image");
        processedCount++;
      } else {
        skippedCount++;
      }
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
      const item = handleBlockquote(element);
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
      const item = handleList(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, "list");
        processedCount++;
      }
    } else if (tagName === "table") {
      const item = handleTable(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, "table");
        processedCount++;
      }
    } else if (tagName === "div") {
      const item = handleDiv(element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, "paragraph");
        processedCount++;
      } else {
        skippedCount++;
      }
    }
  }
  if (state.debugInfo) {
    state.debugInfo.processedCount = processedCount;
    state.debugInfo.skippedCount = skippedCount;
  }
  return content;
}

function processMathElements(container) {
  const mathElements = container.querySelectorAll(".mwe-math-element, .mathjax, .latex, .katex, math");
  for (const mathEl of Array.from(mathElements)) {
    let latex = "";
    const img = mathEl.querySelector("img");
    if (img && img.alt) {
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
    if (latex) {
      const cleanedLatex = cleanLatexFormula(latex);
      const textNode = document.createTextNode(` $${cleanedLatex}$ `);
      mathEl.replaceWith(textNode);
    } else {
      mathEl.remove();
    }
  }
}

function sanitizeParagraphHtml(p) {
  const clone = (
    /** @type {Element} */
    p.cloneNode(true)
  );
  processMathElements(clone);
  const allElements = clone.querySelectorAll("*");
  for (const el of Array.from(allElements)) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
    if (isFootnoteLink(el) || isIcon(el)) {
      el.remove();
    }
    if (el.tagName.toLowerCase() === "style" || el.tagName.toLowerCase() === "script") {
      el.remove();
    }
  }
  const emptyElements = clone.querySelectorAll("span:empty, div:empty");
  for (const empty of Array.from(emptyElements)) {
    empty.remove();
  }
  return (
    /** @type {HTMLElement} */
    clone.innerHTML.trim()
  );
}

function sortElementsInDomOrder(elements) {
  return [...elements].sort(compareDomOrder);
}

// --- Fallbacks ---
function extractEmergencyFallback(win, doc, state, constants, mainContent) {
  const content = [];
  if (mainContent) {
    const elements = mainContent.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
    for (const element of Array.from(elements).slice(0, 100)) {
      const tagName = element.tagName.toLowerCase();
      const text = (element.textContent || "").trim();
      if (text.length < 10)
        continue;
      if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
        continue;
      }
      if (tagName === "p") {
        const originalText = getOriginalTextIfTranslated(element);
        content.push({ type: "paragraph", text: originalText || text, html: originalText || element.innerHTML });
      } else if (tagName.match(/^h[1-6]$/)) {
        const cleanedText = cleanHeadingText(text);
        const normalized = normalizeHeadingForDedup(cleanedText);
        if (normalized !== state.mainTitleText && !state.addedHeadings.has(normalized)) {
          state.addedHeadings.add(normalized);
          content.push({ type: "heading", level: parseInt(tagName.charAt(1)), text: cleanedText });
        }
      }
    }
    if (content.length > 0)
      return content;
  }
  const containers = doc.querySelectorAll('article, main, [role="main"]');
  for (const container of containers) {
    const elements = container.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
    for (const element of Array.from(elements).slice(0, 100)) {
      const tagName = element.tagName.toLowerCase();
      const text = (element.textContent || "").trim();
      if (text.length < 10)
        continue;
      if (tagName === "p") {
        const originalText = getOriginalTextIfTranslated(element);
        content.push({ type: "paragraph", text: originalText || text, html: originalText || element.innerHTML });
      } else if (tagName.match(/^h[1-6]$/)) {
        const cleanedText = cleanHeadingText(text);
        const normalized = normalizeHeadingForDedup(cleanedText);
        if (normalized !== state.mainTitleText && !state.addedHeadings.has(normalized)) {
          state.addedHeadings.add(normalized);
          content.push({ type: "heading", level: parseInt(tagName.charAt(1)), text: cleanedText });
        }
      }
    }
    if (content.length > 0)
      return content;
  }
  return content.length > 0 ? content : null;
}

function extractLastResortContainerSearch(win, doc, state, constants, baseUrl) {
  const allContainers = doc.querySelectorAll("div, section, article, main");
  let bestContainer = null;
  let maxParagraphs = 0;
  let bestTextLength = 0;
  for (const container of allContainers) {
    if (isExcluded(win, container, constants))
      continue;
    if (isWidget(win, container))
      continue;
    const paragraphs = container.querySelectorAll("p");
    const paragraphCount = paragraphs.length;
    const textLength = (container.textContent || "").length;
    if (paragraphCount > maxParagraphs || paragraphCount === maxParagraphs && textLength > bestTextLength) {
      maxParagraphs = paragraphCount;
      bestTextLength = textLength;
      bestContainer = container;
    }
  }
  if (!bestContainer || maxParagraphs < 3)
    return null;
  const content = [];
  const elements = bestContainer.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    const text = (element.textContent || "").trim();
    if (tagName === "p") {
      if (text.length < 10)
        continue;
      if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
        continue;
      }
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || element.innerHTML;
      content.push({ type: "paragraph", text: finalText, html: finalText });
    } else if (tagName.match(/^h[1-6]$/)) {
      const cleanedText = cleanHeadingText(text);
      const normalized = normalizeHeadingForDedup(cleanedText);
      if (normalized === state.mainTitleText)
        continue;
      if (state.addedHeadings.has(normalized))
        continue;
      state.addedHeadings.add(normalized);
      const level = parseInt(tagName.charAt(1));
      content.push({ type: "heading", level, text: cleanedText });
    }
  }
  return content.length > 0 ? content : null;
}

function extractUltimateFallbackAllParagraphs(win, doc, state, constants) {
  const content = [];
  const allHeadings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let headingCount = 0;
  for (const heading of allHeadings) {
    if (headingCount >= 50)
      break;
    if (isWidget(win, heading))
      continue;
    const text = cleanHeadingText(heading.textContent || "");
    const normalized = normalizeHeadingForDedup(text);
    if (normalized === state.mainTitleText)
      continue;
    if (state.addedHeadings.has(normalized))
      continue;
    state.addedHeadings.add(normalized);
    const level = parseInt(heading.tagName.charAt(1));
    content.push({ type: "heading", level, text });
    headingCount++;
  }
  const allParagraphs = doc.querySelectorAll("p");
  let paragraphCount = 0;
  for (const p of allParagraphs) {
    if (paragraphCount >= 500)
      break;
    if (isExcluded(win, p, constants))
      continue;
    if (isWidget(win, p))
      continue;
    const text = (p.textContent || "").trim();
    if (text.length < 10)
      continue;
    if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
      continue;
    }
    const originalText = getOriginalTextIfTranslated(p);
    const finalText = originalText || p.innerHTML;
    content.push({ type: "paragraph", text: finalText, html: finalText });
    paragraphCount++;
  }
  return content.length > 0 ? content : null;
}

function extractWhenMainContentMissing(win, doc, state, constants, baseUrl) {
  const fallbackArticle = doc.querySelector("article");
  const fallbackMain = doc.querySelector("main");
  const fallbackRoleMain = doc.querySelector('[role="main"]');
  const fallbackContent = fallbackArticle || fallbackMain || fallbackRoleMain;
  if (!fallbackContent)
    return null;
  const fallbackElements = fallbackContent.querySelectorAll("h1, h2, h3, h4, h5, h6, p, img, figure");
  const elements = Array.from(fallbackElements).slice(0, 100);
  const content = [];
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (tagName.match(/^h[1-6]$/)) {
      const text = cleanHeadingText(element.textContent || "");
      const normalized = normalizeHeadingForDedup(text);
      if (normalized === state.mainTitleText)
        continue;
      if (state.addedHeadings.has(normalized))
        continue;
      state.addedHeadings.add(normalized);
      const level = parseInt(tagName.charAt(1));
      content.push({ type: "heading", level, text });
    } else if (tagName === "p") {
      const text = (element.textContent || "").trim();
      if (text.length < 10)
        continue;
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || element.innerHTML;
      content.push({ type: "paragraph", text: finalText, html: finalText });
    } else if (tagName === "img" || tagName === "figure") {
      const img = tagName === "figure" ? element.querySelector("img") : element;
      if (!img)
        continue;
      const src = extractBestImageUrl(
        /** @type {HTMLImageElement} */
        img
      );
      if (!src)
        continue;
      if (isTrackingPixel(
        win,
        /** @type {HTMLImageElement} */
        img
      ))
        continue;
      if (isDecorativeImage(
        win,
        /** @type {HTMLImageElement} */
        img,
        constants.LOGO_PATTERNS || []
      ))
        continue;
      const absoluteSrc = toAbsoluteUrl(src, baseUrl);
      const normalizedSrc = normalizeImageUrl(absoluteSrc);
      if (state.processedImages.has(normalizedSrc))
        continue;
      if (state.processedImages.size < 1e3) {
        state.processedImages.add(normalizedSrc);
      }
      content.push({
        type: "image",
        src: absoluteSrc,
        alt: (
          /** @type {HTMLImageElement} */
          img.alt || ""
        ),
        caption: ""
      });
    }
  }
  return content.length > 0 ? content : null;
}

function findTwitterContainer(doc, mainContent) {
  let container = doc.querySelector('div[data-testid="twitterArticleReadView"]');
  if (container)
    return { container, source: "twitterArticleReadView" };
  const article = doc.querySelector('article[data-testid="tweet"]');
  if (article) {
    container = article.querySelector('div[data-testid="tweetText"]');
    if (container)
      return { container, source: "tweetText" };
    return { container: article, source: "tweet" };
  }
  if (mainContent) {
    return { container: mainContent, source: "mainContent" };
  }
  return { container: null, source: "none" };
}

function isTwitterXPage(baseUrl, doc) {
  const isTwitterUrl = baseUrl.includes("x.com/") || baseUrl.includes("twitter.com/");
  if (!isTwitterUrl)
    return false;
  const hasTwitterArticle = !!doc.querySelector('article[data-testid="tweet"]');
  const hasTwitterReadView = !!doc.querySelector('div[data-testid="twitterArticleReadView"]');
  return hasTwitterArticle || hasTwitterReadView;
}

function tryExtractTwitterX(win, doc, state, constants, baseUrl) {
  if (!isTwitterXPage(baseUrl, doc))
    return null;
  const { container, source } = findTwitterContainer(doc, null);
  if (!container)
    return null;
  pushDebugLog(state.debugInfo, "TWITTER_X_CONTAINER", { source });
  const content = [];
  const addedImageUrls = /* @__PURE__ */ new Set();
  const allBlocks = container.querySelectorAll("div[data-offset-key]");
  const uniqueBlocks = /* @__PURE__ */ new Map();
  for (const block of allBlocks) {
    const text = (block.textContent || "").trim();
    if (!text)
      continue;
    if (!uniqueBlocks.has(text) || block.children.length > (uniqueBlocks.get(text)?.children.length || 0)) {
      uniqueBlocks.set(text, block);
    }
  }
  const contentBlocks = Array.from(uniqueBlocks.values());
  const validBlocks = contentBlocks.filter((block) => {
    const text = (block.textContent || "").toLowerCase();
    if (text.includes("premium") || text.includes("/analytics") || text.includes("/i/premium")) {
      return false;
    }
    if (/^\d+\s*(k|m|тыс|млн)?$/i.test(text)) {
      return false;
    }
    return true;
  });
  const headings = container.querySelectorAll("h1.longform-header-one, h2.longform-header-two, h3.longform-header-three");
  const images = container.querySelectorAll("img");
  const allElements = [...Array.from(headings), ...Array.from(images), ...validBlocks];
  allElements.sort(compareDomOrder);
  for (const element of allElements) {
    const tagName = element.tagName.toLowerCase();
    if (tagName.match(/^h[1-3]$/)) {
      const text = cleanHeadingText(element.textContent || "");
      const normalized = normalizeHeadingForDedup(text);
      if (normalized === state.mainTitleText)
        continue;
      if (state.addedHeadings.has(normalized))
        continue;
      state.addedHeadings.add(normalized);
      const level = element.classList.contains("longform-header-one") ? 1 : element.classList.contains("longform-header-two") ? 2 : 3;
      content.push({ type: "heading", level, text, id: element.id || void 0 });
    } else if (tagName === "img") {
      if (element.closest("figure"))
        continue;
      const img = (
        /** @type {HTMLImageElement} */
        element
      );
      const src = extractBestImageUrl(img);
      if (!src)
        continue;
      if (isTrackingPixel(win, img))
        continue;
      if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || []))
        continue;
      const absoluteSrc = toAbsoluteUrl(src, baseUrl);
      const normalizedSrc = normalizeImageUrl(absoluteSrc);
      if (addedImageUrls.has(normalizedSrc))
        continue;
      addedImageUrls.add(normalizedSrc);
      let alt = img.alt || "";
      if (alt.toLowerCase().includes("image"))
        alt = "";
      content.push({ type: "image", src: absoluteSrc, alt, caption: "" });
    } else if (element.hasAttribute("data-offset-key")) {
      const text = (element.textContent || "").trim();
      if (!text)
        continue;
      const innerHeading = element.querySelector("h1, h2, h3");
      if (innerHeading) {
        const headingText = cleanHeadingText(innerHeading.textContent || "");
        const normalized = normalizeHeadingForDedup(headingText);
        if (normalized !== state.mainTitleText && !state.addedHeadings.has(normalized)) {
          state.addedHeadings.add(normalized);
          content.push({ type: "heading", level: 2, text: headingText });
        }
        continue;
      }
      const innerImg = element.querySelector("img");
      if (innerImg)
        continue;
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || element.innerHTML;
      content.push({ type: "paragraph", text: finalText, html: finalText });
    }
  }
  pushDebugLog(state.debugInfo, "TWITTER_X_EXTRACTED", { itemCount: content.length });
  return content.length > 0 ? content : null;
}




  // Main extraction logic (inlined from runExtraction)
  const win = window;
  const doc = document;
  const debugInfo = enableDebugInfo ? createDebugInfo(win, doc, baseUrl) : null;
  if (enableDebugInfo) {
    logExtractionStart(baseUrl, enableDebugInfo);
    logHtmlState(doc);
  }
  try {
    try {
      await waitForContentLoad(doc);
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
    const metadata = extractMetadata(doc, baseUrl);
    const mainTitleText = normalizeHeadingForDedup(metadata.title);
    pushDebugLog(debugInfo, "METADATA_EXTRACTED", metadata);
    const state = {
      processedImages: /* @__PURE__ */ new Set(),
      addedHeadings: /* @__PURE__ */ new Set(),
      mainTitleText,
      standfirstElement: null,
      standfirstText: null,
      content: [],
      debugInfo
    };
    if (mainTitleText) {
      state.addedHeadings.add(mainTitleText);
    }
    const twitterContent = tryExtractTwitterX(win, doc, state, constants, baseUrl);
    if (twitterContent && twitterContent.length > 0) {
      return {
        title: metadata.title,
        author: metadata.author,
        publishDate: metadata.publishDate,
        content: deduplicateHeadings(twitterContent),
        debugInfo
      };
    }
    const mainContent = findMainContent(win, doc, (el) => isExcluded(win, el, constants));
    pushDebugLog(debugInfo, "MAIN_CONTENT_FOUND", {
      found: !!mainContent,
      tagName: mainContent?.tagName,
      className: mainContent?.className,
      textLength: mainContent?.textContent?.length || 0
    });
    const featuredImage = extractFeaturedImage(doc, baseUrl, mainContent, CONSTANTS.LOGO_PATTERNS || []);
    const standfirstResult = extractStandfirst(mainContent);
    state.standfirstElement = standfirstResult.element;
    state.standfirstText = standfirstResult.text;
    let content = [];
    if (featuredImage) {
      const normalizedFeaturedSrc = normalizeImageUrl(featuredImage.src);
      if (state.processedImages.size < 1e3) {
        state.processedImages.add(normalizedFeaturedSrc);
      }
      content.push({
        type: "image",
        src: featuredImage.src,
        alt: featuredImage.alt,
        caption: featuredImage.caption,
        isFeatured: true
      });
    }
    if (state.standfirstText) {
      content.push({
        type: "subtitle",
        text: state.standfirstText,
        isStandfirst: true
      });
    }
    if (mainContent) {
      const allElements = collectCandidateElements(mainContent, win);
      if (debugInfo) {
        debugInfo.foundElements = allElements.length;
      }
      const filteredElements = filterCandidateElements(win, allElements, constants, debugInfo);
      if (debugInfo) {
        debugInfo.filteredElements = filteredElements.length;
      }
      const sortedElements = sortElementsInDomOrder(filteredElements);
      const parsedContent = parseElements(win, sortedElements, state, constants, baseUrl);
      content.push(...parsedContent);
    } else {
      pushDebugLog(debugInfo, "MAIN_CONTENT_MISSING_FALLBACK", {});
      const fallbackContent = extractWhenMainContentMissing(win, doc, state, constants, baseUrl);
      if (fallbackContent) {
        content.push(...fallbackContent);
      }
    }
    if (content.length === 0 || content.length === 1 && content[0].type === "image") {
      pushDebugLog(debugInfo, "LAST_RESORT_FALLBACK", {});
      const lastResortContent = extractLastResortContainerSearch(win, doc, state, constants, baseUrl);
      if (lastResortContent) {
        content.push(...lastResortContent);
      }
    }
    if (content.length === 0 || content.length === 1 && content[0].type === "image") {
      pushDebugLog(debugInfo, "ULTIMATE_FALLBACK", {});
      const ultimateContent = extractUltimateFallbackAllParagraphs(win, doc, state, constants);
      if (ultimateContent) {
        content.push(...ultimateContent);
      }
    }
    if (content.length === 0) {
      pushDebugLog(debugInfo, "EMERGENCY_FALLBACK", {});
      const emergencyContent = extractEmergencyFallback(win, doc, state, constants, mainContent);
      if (emergencyContent) {
        content.push(...emergencyContent);
      }
    }
    content = deduplicateHeadings(content);
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
      author: metadata.author,
      publishDate: metadata.publishDate,
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
