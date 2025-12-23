// Exclusion patterns for content filtering
// Centralized patterns to avoid duplication

/**
 * Navigation text patterns (all languages)
 * Patterns that indicate navigation, related articles, subscription prompts
 */
export const NAVIGATION_PATTERNS = {
  // Patterns that match if text STARTS with them
  startsWith: [
    // English
    /^next:/i, /^read more/i, /^keep reading/i, /^subscribe/i,
    /^sign (in|up)/i, /^already have an account/i, /^try \d+ days/i,
    /^start (free )?trial/i, /^give a gift/i, /^manage subscription/i,
    /^essential journalism/i, /^support independent journalism/i,
    /^you might also like/i, /^you may also like/i, /^also in /i, /^more in /i,
    /^previous post/i, /^next post/i, /^related posts?/i, /^recommended posts?/i,
    /^subscribe (now|today|for)/i, /^support (independent )?journalism/i,
    /^donate (to|now)/i, /^give a year of/i, /^plus a free/i,
    /^comment on this article/i, /^view \/ add comments/i,
    /^published in the print edition/i, /^published in the/i,
    /^fuel your wonder/i, /^feed your curiosity/i, /^expand your mind/i,
    /^access the entire/i, /^ad-free/i, /^become a member/i,
    /^nautilus members enjoy/i, /^log in or join/i,
    // Russian
    /^чтобы прочитать целиком/i, /^купите подписку/i, /^платный журнал/i,
    /^я уже подписчик/i, /^подписка предоставлена/i, /^оформить подписку/i,
    /^чтобы читать далее/i, /^подпишитесь чтобы/i, /^чтобы продолжить/i,
    /^новое и лучшее/i, /^первая полоса/i, /^рекомендуем/i,
    /^читайте также/i, /^похожие статьи/i, /^связанные статьи/i,
    /^другие статьи/i, /^ещё по теме/i, /^по теме/i,
    // Ukrainian
    /^щоб прочитати цілком/i, /^купити підписку/i, /^платний журнал/i,
    /^я вже передплатник/i, /^підписка надана/i, /^оформити підписку/i,
    /^щоб читати далі/i, /^підпишіться щоб/i, /^щоб продовжити/i,
    /^нове і краще/i, /^перша смуга/i, /^рекомендуємо/i,
    /^читайте також/i, /^схожі статті/i, /^пов'язані статті/i,
    /^інші статті/i, /^ще за темою/i, /^за темою/i,
    // German
    /^um weiterzulesen/i, /^abonnement kaufen/i, /^bezahltes magazin/i,
    /^ich bin bereits abonnent/i, /^abonnement bereitgestellt/i, /^abonnement abschließen/i,
    /^um weiter zu lesen/i, /^abonnieren um/i, /^um fortzufahren/i,
    /^neu und besser/i, /^erste seite/i, /^empfehlen/i,
    /^lesen sie auch/i, /^ähnliche artikel/i, /^verwandte artikel/i,
    /^andere artikel/i, /^mehr zum thema/i, /^zum thema/i,
    // French
    /^pour lire en entier/i, /^acheter un abonnement/i, /^magazine payant/i,
    /^je suis déjà abonné/i, /^abonnement fourni/i, /^s'abonner/i,
    /^pour continuer à lire/i, /^abonnez-vous pour/i, /^pour continuer/i,
    /^nouveau et mieux/i, /^première page/i, /^recommandons/i,
    /^lisez aussi/i, /^articles similaires/i, /^articles connexes/i,
    /^autres articles/i, /^plus sur le sujet/i, /^sur le sujet/i,
    // Spanish
    /^para leer completo/i, /^comprar suscripción/i, /^revista de pago/i,
    /^ya soy suscriptor/i, /^suscripción proporcionada/i, /^suscribirse/i,
    /^para seguir leyendo/i, /^suscríbete para/i, /^para continuar/i,
    /^nuevo y mejor/i, /^primera página/i, /^recomendamos/i,
    /^lee también/i, /^artículos similares/i, /^artículos relacionados/i,
    /^otros artículos/i, /^más sobre el tema/i, /^sobre el tema/i,
    // Italian
    /^per leggere completo/i, /^acquista abbonamento/i, /^rivista a pagamento/i,
    /^sono già abbonato/i, /^abbonamento fornito/i, /^abbonarsi/i,
    /^per continuare a leggere/i, /^abbonati per/i, /^per continuare/i,
    /^nuovo e migliore/i, /^prima pagina/i, /^consigliamo/i,
    /^leggi anche/i, /^articoli simili/i, /^articoli correlati/i,
    /^altri articoli/i, /^altro sull'argomento/i, /^sull'argomento/i,
    // Portuguese
    /^para ler completo/i, /^comprar assinatura/i, /^revista paga/i,
    /^já sou assinante/i, /^assinatura fornecida/i, /^assinar/i,
    /^para continuar lendo/i, /^assine para/i, /^para continuar/i,
    /^novo e melhor/i, /^primeira página/i, /^recomendamos/i,
    /^leia também/i, /^artigos similares/i, /^artigos relacionados/i,
    /^outros artigos/i, /^mais sobre o tema/i, /^sobre o tema/i,
    // Chinese
    /^阅读全文/i, /^购买订阅/i, /^付费杂志/i,
    /^我已经是订阅者/i, /^已提供订阅/i, /^订阅/i,
    /^继续阅读/i, /^订阅以/i, /^继续/i,
    /^最新和最佳/i, /^头版/i, /^推荐/i,
    /^也阅读/i, /^相似文章/i, /^相关文章/i,
    /^其他文章/i, /^更多主题/i, /^主题/i,
    // Japanese
    /^全文を読む/i, /^購読を購入/i, /^有料雑誌/i,
    /^既に購読者です/i, /^購読が提供されました/i, /^購読する/i,
    /^続きを読む/i, /^購読して/i, /^続ける/i,
    /^新しくて最高/i, /^第一面/i, /^おすすめ/i,
    /^こちらも読む/i, /^類似記事/i, /^関連記事/i,
    /^その他の記事/i, /^トピックの詳細/i, /^トピック/i,
    // Korean
    /^전체 읽기/i, /^구독 구매/i, /^유료 잡지/i,
    /^이미 구독자입니다/i, /^구독 제공됨/i, /^구독하기/i,
    /^계속 읽기/i, /^구독하여/i, /^계속/i,
    /^새로운 것과 최고/i, /^첫 페이지/i, /^추천/i,
    /^또한 읽기/i, /^유사한 기사/i, /^관련 기사/i,
    /^다른 기사/i, /^주제에 대해 더/i, /^주제/i
  ],
  
  // Patterns that match if text CONTAINS them
  contains: [
    // English
    /previous\s+post/i, /next\s+post/i, /related\s+posts?/i, /recommended\s+posts?/i,
    /read\s+more/i, /keep\s+reading/i, /you\s+might\s+also\s+like/i,
    /you\s+may\s+also\s+like/i, /also\s+in\s+/i, /more\s+in\s+/i,
    /next\s+article/i, /previous\s+article/i, /next:/i,
    /subscribe\s+(now|today|for)/i, /sign\s+up/i, /start\s+(free\s+)?trial/i,
    /support\s+(independent\s+)?journalism/i, /donate\s+(to|now)/i,
    /essential\s+journalism/i, /give\s+a\s+gift/i,
    /comment\s+on\s+this\s+article/i, /view\s+\/\s+add\s+comments/i,
    /published\s+in\s+the\s+print\s+edition/i,
    // Paywall/subscription messages
    /get\s+access\s+to\s+print\s+and\s+digital/i, /subscribe\s+for\s+full\s+access/i,
    /free\s+articles?\s+this\s+month/i, /subscribe\s+for\s+less\s+than/i,
    /subscribe\s+or\s+log\s+in\s+to\s+access/i, /connect\s+to\s+your\s+subscription/i,
    /you've\s+read\s+(one|your)/i, /you've\s+reached\s+your\s+free/i,
    /subscribe\s+or\s+log\s+in\s+to\s+access\s+this\s+pdf/i, /download\s+pdf/i,
    // Russian
    /чтобы\s+прочитать\s+целиком/i, /купите\s+подписку/i, /платный\s+журнал/i,
    /я\s+уже\s+подписчик/i, /подписка\s+предоставлена/i, /оформить\s+подписку/i,
    /чтобы\s+читать\s+далее/i, /подпишитесь\s+чтобы/i, /чтобы\s+продолжить/i,
    /новое\s+и\s+лучшее/i, /первая\s+полоса/i, /рекомендуем/i,
    /читайте\s+также/i, /похожие\s+статьи/i, /связанные\s+статьи/i,
    /другие\s+статьи/i, /ещё\s+по\s+теме/i, /по\s+теме/i,
    // Ukrainian
    /щоб\s+прочитати\s+цілком/i, /купити\s+підписку/i, /платний\s+журнал/i,
    /я\s+вже\s+передплатник/i, /підписка\s+надана/i, /оформити\s+підписку/i,
    /щоб\s+читати\s+далі/i, /підпишіться\s+щоб/i, /щоб\s+продовжить/i,
    /нове\s+і\s+краще/i, /перша\s+смуга/i, /рекомендуємо/i,
    /читайте\s+також/i, /схожі\s+статті/i, /пов'язані\s+статті/i,
    /інші\s+статті/i, /ще\s+за\s+темою/i, /за\s+темою/i,
    // German
    /um\s+weiterzulesen/i, /abonnement\s+kaufen/i, /bezahltes\s+magazin/i,
    /ich\s+bin\s+bereits\s+abonnent/i, /abonnement\s+bereitgestellt/i, /abonnement\s+abschließen/i,
    /um\s+weiter\s+zu\s+lesen/i, /abonnieren\s+um/i, /um\s+fortzufahren/i,
    /neu\s+und\s+besser/i, /erste\s+seite/i, /empfehlen/i,
    /lesen\s+sie\s+auch/i, /ähnliche\s+artikel/i, /verwandte\s+artikel/i,
    /andere\s+artikel/i, /mehr\s+zum\s+thema/i, /zum\s+thema/i,
    // French
    /pour\s+lire\s+en\s+entier/i, /acheter\s+un\s+abonnement/i, /magazine\s+payant/i,
    /je\s+suis\s+déjà\s+abonné/i, /abonnement\s+fourni/i, /s'abonner/i,
    /pour\s+continuer\s+à\s+lire/i, /abonnez-vous\s+pour/i, /pour\s+continuer/i,
    /nouveau\s+et\s+mieux/i, /première\s+page/i, /recommandons/i,
    /lisez\s+aussi/i, /articles\s+similaires/i, /articles\s+connexes/i,
    /autres\s+articles/i, /plus\s+sur\s+le\s+sujet/i, /sur\s+le\s+sujet/i,
    // Spanish
    /para\s+leer\s+completo/i, /comprar\s+suscripción/i, /revista\s+de\s+pago/i,
    /ya\s+soy\s+suscriptor/i, /suscripción\s+proporcionada/i, /suscribirse/i,
    /para\s+seguir\s+leyendo/i, /suscríbete\s+para/i, /para\s+continuar/i,
    /nuevo\s+y\s+mejor/i, /primera\s+página/i, /recomendamos/i,
    /lee\s+también/i, /artículos\s+similares/i, /artículos\s+relacionados/i,
    /otros\s+artículos/i, /más\s+sobre\s+el\s+tema/i, /sobre\s+el\s+tema/i,
    // Italian
    /per\s+leggere\s+completo/i, /acquista\s+abbonamento/i, /rivista\s+a\s+pagamento/i,
    /sono\s+già\s+abbonato/i, /abbonamento\s+fornito/i, /abbonarsi/i,
    /per\s+continuare\s+a\s+leggere/i, /abbonati\s+per/i, /per\s+continuare/i,
    /nuovo\s+e\s+migliore/i, /prima\s+pagina/i, /consigliamo/i,
    /leggi\s+anche/i, /articoli\s+simili/i, /articoli\s+correlati/i,
    /altri\s+articoli/i, /altro\s+sull'argomento/i, /sull'argomento/i,
    // Portuguese
    /para\s+ler\s+completo/i, /comprar\s+assinatura/i, /revista\s+paga/i,
    /já\s+sou\s+assinante/i, /assinatura\s+fornecida/i, /assinar/i,
    /para\s+continuar\s+lendo/i, /assine\s+para/i, /para\s+continuar/i,
    /novo\s+e\s+melhor/i, /primeira\s+página/i, /recomendamos/i,
    /leia\s+também/i, /artigos\s+similares/i, /artigos\s+relacionados/i,
    /outros\s+artigos/i, /mais\s+sobre\s+o\s+tema/i, /sobre\s+o\s+tema/i,
    // Chinese
    /阅读全文/i, /购买订阅/i, /付费杂志/i,
    /我已经是订阅者/i, /已提供订阅/i, /订阅/i,
    /继续阅读/i, /订阅以/i, /继续/i,
    /最新和最佳/i, /头版/i, /推荐/i,
    /也阅读/i, /相似文章/i, /相关文章/i,
    /其他文章/i, /更多主题/i, /主题/i,
    // Japanese
    /全文を読む/i, /購読を購入/i, /有料雑誌/i,
    /既に購読者です/i, /購読が提供されました/i, /購読する/i,
    /続きを読む/i, /購読して/i, /続ける/i,
    /新しくて最高/i, /第一面/i, /おすすめ/i,
    /こちらも読む/i, /類似記事/i, /関連記事/i,
    /その他の記事/i, /トピックの詳細/i, /トピック/i,
    // Korean
    /전체\s+읽기/i, /구독\s+구매/i, /유료\s+잡지/i,
    /이미\s+구독자입니다/i, /구독\s+제공됨/i, /구독하기/i,
    /계속\s+읽기/i, /구독하여/i, /계속/i,
    /새로운\s+것과\s+최고/i, /첫\s+페이지/i, /추천/i,
    /또한\s+읽기/i, /유사한\s+기사/i, /관련\s+기사/i,
    /다른\s+기사/i, /주제에\s+대해\s+더/i, /주제/i
  ]
};

/**
 * Paywall and subscription patterns (all languages)
 */
export const PAYWALL_PATTERNS = {
  english: [
    'keep reading', 'subscribe', 'sign up', 'try 30 days',
    'already have an account', 'start free trial',
    'get access to print and digital', 'subscribe for full access',
    'free articles this month', 'subscribe for less than',
    'subscribe or log in to access', 'connect to your subscription',
    "you've read one", "you've read your", "you've reached your free"
  ],
  russian: [
    'чтобы прочитать целиком', 'купите подписку', 'платный журнал',
    'я уже подписчик', 'подписка предоставлена', 'оформить подписку',
    'чтобы читать далее', 'подпишитесь чтобы', 'чтобы продолжить'
  ],
  ukrainian: [
    'щоб прочитати цілком', 'купити підписку', 'платний журнал',
    'я вже передплатник', 'підписка надана', 'оформити підписку',
    'щоб читати далі', 'підпишіться щоб', 'щоб продовжити'
  ],
  german: [
    'um weiterzulesen', 'abonnement kaufen', 'bezahltes magazin',
    'ich bin bereits abonnent', 'abonnement bereitgestellt', 'abonnement abschließen',
    'um weiter zu lesen', 'abonnieren um', 'um fortzufahren'
  ],
  french: [
    'pour lire en entier', 'acheter un abonnement', 'magazine payant',
    'je suis déjà abonné', 'abonnement fourni', "s'abonner",
    'pour continuer à lire', 'abonnez-vous pour', 'pour continuer'
  ],
  spanish: [
    'para leer completo', 'comprar suscripción', 'revista de pago',
    'ya soy suscriptor', 'suscripción proporcionada', 'suscribirse',
    'para seguir leyendo', 'suscríbete para', 'para continuar'
  ],
  italian: [
    'per leggere completo', 'acquista abbonamento', 'rivista a pagamento',
    'sono già abbonato', 'abbonamento fornito', 'abbonarsi',
    'per continuare a leggere', 'abbonati per', 'per continuare'
  ],
  portuguese: [
    'para ler completo', 'comprar assinatura', 'revista paga',
    'já sou assinante', 'assinatura fornecida', 'assinar',
    'para continuar lendo', 'assine para', 'para continuar'
  ],
  chinese: [
    '阅读全文', '购买订阅', '付费杂志',
    '我已经是订阅者', '已提供订阅', '订阅',
    '继续阅读', '订阅以', '继续'
  ],
  japanese: [
    '全文を読む', '購読を購入', '有料雑誌',
    '既に購読者です', '購読が提供されました', '購読する',
    '続きを読む', '購読して', '続ける'
  ],
  korean: [
    '전체 읽기', '구독 구매', '유료 잡지',
    '이미 구독자입니다', '구독 제공됨', '구독하기',
    '계속 읽기', '구독하여', '계속'
  ]
};

/**
 * Related articles patterns (all languages)
 */
export const RELATED_ARTICLES_PATTERNS = {
  english: [
    'new and best', 'first page', 'recommend',
    'read also', 'similar articles', 'related articles',
    'other articles', 'more on topic', 'on topic'
  ],
  russian: [
    'новое и лучшее', 'первая полоса', 'рекомендуем',
    'читайте также', 'похожие статьи', 'связанные статьи',
    'другие статьи', 'ещё по теме', 'по теме'
  ],
  ukrainian: [
    'нове і краще', 'перша смуга', 'рекомендуємо',
    'читайте також', 'схожі статті', 'пов\'язані статті',
    'інші статті', 'ще за темою', 'за темою'
  ],
  german: [
    'neu und besser', 'erste seite', 'empfehlen',
    'lesen sie auch', 'ähnliche artikel', 'verwandte artikel',
    'andere artikel', 'mehr zum thema', 'zum thema'
  ],
  french: [
    'nouveau et mieux', 'première page', 'recommandons',
    'lisez aussi', 'articles similaires', 'articles connexes',
    'autres articles', 'plus sur le sujet', 'sur le sujet'
  ],
  spanish: [
    'nuevo y mejor', 'primera página', 'recomendamos',
    'lee también', 'artículos similares', 'artículos relacionados',
    'otros artículos', 'más sobre el tema', 'sobre el tema'
  ],
  italian: [
    'nuovo e migliore', 'prima pagina', 'consigliamo',
    'leggi anche', 'articoli simili', 'articoli correlati',
    'altri articoli', 'altro sull\'argomento', 'sull\'argomento'
  ],
  portuguese: [
    'novo e melhor', 'primeira página', 'recomendamos',
    'leia também', 'artigos similares', 'artigos relacionados',
    'outros artigos', 'mais sobre o tema', 'sobre o tema'
  ],
  chinese: [
    '最新和最佳', '头版', '推荐',
    '也阅读', '相似文章', '相关文章',
    '其他文章', '更多主题', '主题'
  ],
  japanese: [
    '新しくて最高', '第一面', 'おすすめ',
    'こちらも読む', '類似記事', '関連記事',
    'その他の記事', 'トピックの詳細', 'トピック'
  ],
  korean: [
    '새로운 것과 최고', '첫 페이지', '추천',
    '또한 읽기', '유사한 기사', '관련 기사',
    '다른 기사', '주제에 대해 더', '주제'
  ]
};

/**
 * Course/product advertisement patterns
 */
export const COURSE_AD_PATTERNS = [
  'video + ux training', 'get video', 'video training', 'video course',
  'measure ux & design impact', 'money-back-guarantee', 'money back guarantee',
  'get the video course', 'get video + ux training',
  'use the code', 'save 20%', 'save 20% off'
];

/**
 * Newsletter/email signup patterns
 */
export const NEWSLETTER_PATTERNS = [
  'sign up to our newsletter',
  'join more than',
  'newsletter subscribers',
  'get the latest',
  'inbox',
  'email powered by',
  'powered by salesforce',
  'salesforce marketing cloud',
  'marketing cloud'
];

/**
 * Excluded CSS classes
 */
export const EXCLUDED_CLASSES = [
  'nav', 'navigation', 'menu', 'sidebar', 'footer', 'header',
  'ad', 'advertisement', 'ads', 'sponsor', 'sponsored', 'advert',
  'comment', 'comments', 'discussion', 'thread', 'disqus',
  'related', 'related-posts', 'related-articles', 'related-articles__title', 'recommended', 'also-in',
  'article-section-title', 'entry-wrapper', 'c-accordion', 'accordion',
  'social', 'share', 'share-buttons', 'share-menu',
  'author-bio', 'author-info', 'about-author',
  'translation-notice', 'translation-badge',
  'post-navigation', 'post-nav', 'prev', 'next', 'previous',
  'read-more', 'readmore', 'keep-reading', 'subscribe', 'paywall', 'gate',
  'newsletter', 'newsletter-signup', 'subscribe-box',
  'support', 'donate', 'donation',
  'corrections', 'correction',
  'you-might-also-like', 'you-may-also-like', 'more-in',
  'next-article', 'previous-article', 'article-nav',
  'comment-section', 'comments-section', 'view-comments', 'add-comment',
  'book-cta', 'course-cta', 'product-cta', 'course-ad', 'product-ad',
  'content-tabs', 'content-tab', 'book-cta__inverted', 'book-cta__col',
  'useful-resources', 'further-reading', 'resources-section',
  'component-share-buttons', 'aria-font-adjusts', 'font-adjust'
];

/**
 * Paywall/subscription classes
 */
export const PAYWALL_CLASSES = [
  'freebie-message', 'subscribe-text', 'message--freebie', 'subscribe-',
  'paywall', 'subscription', 'freebie', 'article-limit', 'access-message'
];

/**
 * Logo/brand patterns for image exclusion
 */
export const LOGO_PATTERNS = [
  'logo', 'brand', 'icon', 'badge', 'watermark', 'sprite', 'spacer', 'blank', 'clear', 'pixel',
  'youtube', 'facebook', 'twitter', 'instagram', 'linkedin', 'pinterest', 'rss',
  'social-media', 'social-icon', 'share-icon', 'share-button',
  'youtube-white-logo', 'youtube-logo', 'yt-logo',
  'facebook-logo', 'twitter-logo', 'instagram-logo',
  'arrow', 'chevron', 'bullet', 'dot', 'gradient', 'bg', 'background', 'shadow', 'border',
  'divider', 'line', 'separator', 'spinner', 'loader', 'loading',
  'placeholder', 'default', 'avatar', 'user', 'profile', 'gravatar',
  'data:image/gif;base64,r0lgodlh', // Common 1x1 transparent GIF
  'data:image/png;base64,i' // Common small transparent PNG
];

/**
 * Tracking pixel patterns
 */
export const TRACKING_PATTERNS = [
  'pixel', 'tracking', 'beacon', 'analytics', 'facebook.com/tr', 'doubleclick', 'googleads'
];

/**
 * Placeholder URL patterns
 */
export const PLACEHOLDER_PATTERNS = [
  'placeholder', 'spacer', 'blank', '1x1', 'pixel.gif'
];





