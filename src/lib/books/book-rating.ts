/**
 * Book Age & Maturity Rating Engine
 * Evaluates categories, BISAC headings, subjects, and maturity indicators
 * from Google Books, Open Library, Audible, and iTunes to assign standardized
 * age ratings ("Kids", "YA (12+)", "All Ages", "18+ Mature") and filter mature titles.
 */

export type BookAgeRating = "Kids" | "YA (12+)" | "All Ages" | "18+ Mature";
export type BookMaturityRating = "NOT_MATURE" | "MATURE";

export interface BookRatingResult {
    ageRating: BookAgeRating;
    maturityRating: BookMaturityRating;
    isMature: boolean;
}


// 1. Curated Registry of Known Adult / Spicy Romance, Dark Fiction, Classic Erotica & Sex Manual Authors
const KNOWN_SPICY_AUTHORS_REGEX = /\b(anne\s+hooper|alex\s+comfort|tracey\s+cox|ian\s+kerner|emily\s+nagoski|mantak\s+chia|lou\s+paget|betty\s+dodson|barbara\s+keesling|ava\s+cadell|violet\s+blue|tristan\s+taormino|dossie\s+easton|janet\s+hardy|david\s+deida|jaiya|diana\s+richardson|margot\s+anand|charles\s+silverstein|shere\s+hite|nancy\s+friday|lonnie\s+barbach|bernie\s+zilbergeld|helen\s+singer\s+kaplan|esther\s+perel|paul\s+joannides|christopher\s+ryan|cacilda\s+jeth[aá]|vatsyayana|kalyana\s+malla|sheikh\s+nefzawi|marquis\s+de\s+sade|donatien\s+alphonse|leopold\s+von\s+sacher-?masoch|sacher-?masoch|pauline\s+r[eé]age|anne\s+desclos|ana[iï]s\s+nin|henry\s+miller|john\s+cleland|georges\s+bataille|catherine\s+millet|giacomo\s+casanova|nicholson\s+baker|alina\s+reyes|virginie\s+despentes|brynne\s+weaver|emily\s+mcintire|sierra\s+simone|katee\s+robert|nikki\s+sloane|harley\s+laroux|ruby\s+dixon|lillian\s+lark|kathryn\s+moon|c\.?\s*m\.?\s*nascosta|s\.?\s*j\.?\s*tilly|jessa\s+kane|alexa\s+riley|lucy\s+darling|fiona\s+davenport|jordan\s+silver|ella\s+goode|tiffany\s+reisz|kitty\s+thomas|sam\s+mariano|k\.?\s*g\.?\s*reuss|r\.?\s*lee\s+smith|zoey\s+draven|finley\s+fenn|colette\s+rhodes|kimberly\s+lemming|mallory\s+dunlin|heather\s+guerre|melanie\s+harlow|claire\s+kingsley|raven\s+kennedy|zane|megan\s+hart|j\.?\s*kenner|julie\s+kenner|meredith\s+wild|c\.?\s*d\.?\s*reiss|shayla\s+black|cherise\s+sinclair|lexi\s+blake|lora\s+leigh|joey\s+w\.?\s*hill|robin\s+schone|jade\s+west|alessandra\s+hazard|c\.?\s*s\.?\s*pacat|lily\s+mayne|tiffany\s+roberts|willa\s+nash|lara\s+adrian|larissa\s+ione|christine\s+feehan|suzanne\s+wright|karen\s+marie\s+moning|jeaniene\s+frost|tara\s+sue\s+me|beth\s+kery|r\.?\s*k\.?\s*lilley|lisa\s+renee\s+jones|whitney\s+g\.?|kendall\s+ryan|corinne\s+michaels|carly\s+phillips|jennifer\s+probst|cynthia\s+eden|elisabeth\s+naughton|donna\s+grant|alexandra\s+ivy|tessa\s+dare|julia\s+quinn|lisa\s+kleypas|beverly\s+jenkins|eloisa\s+james|sarah\s+maclean|courtney\s+milan|mary\s+balogh|loretta\s+chase|stephanie\s+laurens|joanna\s+shupe|alice\s+coldbreath|stacy\s+reid|kerrigan\s+byrne|maya\s+rodale|grace\s+burrowes|sabrina\s+jeffries|elizabeth\s+hoyt|laura\s+lee\s+guhrke|suzanne\s+enoch|cathy\s+maxwell|meredith\s+duran|lorraine\s+heath|elisa\s+braden|mia\s+vincy|scarlett\s+scott|christi\s+caldwell|nicole\s+jordan|jude\s+deveraux|judith\s+mcnaught|johanna\s+lindsey|bertrice\s+small|catherine\s+coulter|elsie\s+silver|colleen\s+hoover|ana\s+huang|penelope\s+douglas|ali\s+hazelwood|tessa\s+bailey|lauren\s+asher|lucy\s+score|meghan\s+quinn|h\.?\s*d\.?\s*carlton|shantel\s+tessier|vi\s+keeland|penelope\s+ward|penelope\s+sky|sylvia\s+day|e\.?\s*l\.?\s*james|j\.?\s*t\.?\s*geissinger|sarah\s+j\.?\s*maas|rebecca\s+yarros|emily\s+henry|kristen\s+ashley|elle\s+kennedy|runyx|rina\s+kent|sophie\s+lark|cora\s+reilly|danielle\s+lori|mia\s+sheridan|hannah\s+grace|stephanie\s+archer|liz\s+tomforde|devney\s+perry|kennedy\s+fox|abby\s+jimenez|christina\s+lauren|helen\s+hoang|laura\s+thalassa|carissa\s+broadbent|jennifer\s+l\.?\s*armentrout|k\.?\s*a\.?\s*tucker|l\.?\s*j\.?\s*shen|brittainy\s+c\.?\s*cherry|mia\s+knight|pam\s+godwin|t\.?\s*l\.?\s*swan|louise\s+bay|samantha\s+young|maya\s+banks|j\.?\s*r\.?\s*ward|kresley\s+cole|gena\s+showalter|nalini\s+singh|laurell\s+k\.?\s*hamilton|sherrilyn\s+kenyon|lila\s+lush|c\.?\s*m\.?\s*stunich|jagger\s+cole|eva\s+winners|neva\s+altaj|somme\s+sketcher|michelle\s+heard|nicole\s+fox|tracy\s+lorraine|callie\s+rose|tate\s+james|caroline\s+peckham|susanne\s+valenti|amo\s+jones|pepper\s+winters)\b/i;

// 2. Curated Registry of Known Adult / Spicy Series & Historical Sagas
const KNOWN_SPICY_SERIES_REGEX = /\b(ruinous\s+love|never\s+after|dark\s+olympus|wicked\s+villains|souls\s+trilogy|ice\s+planet\s+barbarians|ice\s+planet|icehome|plated\s+prisoner|born\s+in\s+blood|camorra\s+chronicles|sins\s+of\s+the\s+fathers|alliance\s+series|sinners\s+anonymous|sinners\s+of\s+saint|boston\s+belles|thornchapel|priest\s+series|original\s+sinners|masters\s+of\s+the\s+shadowlands|masters\s+and\s+mercenaries|wicked\s+lovers|stark\s+trilogy|hacker\s+series|songs\s+of\s+submission|monster\s+trilogy|deception\s+trilogy|monstrous\s+matches|a\s+lady\s+of\s+rooksgrave\s+manor|tempting\s+monsters|morning\s+glory\s+milking\s+farm|cambric\s+creek|orc\s+sworn|horde\s+kings|brides\s+of\s+the\s+kylorr|zodiac\s+academy|ruthless\s+boys\s+of\s+the\s+zodiac|darkmore\s+penitentiary|brutal\s+boys|havoc\s+boys|rich\s+boys\s+of\s+burberry\s+prep|madison\s+kate|hades\s+series|elite\s+kings\s+club|monsters\s+in\s+the\s+dark|indebted\s+series|four\s+horsemen|crowns\s+of\s+nyaxia|from\s+blood\s+and\s+ash|flesh\s+and\s+fire|knockemout|queen'?s\s+cove|cloverleigh\s+farms|bootleg\s+springs|miles\s+family|blindfold\s+club|deliver\s+series|trails\s+of\s+sin|buttons\s+and\s+lace|breathless\s+series|sweet\s+series|anita\s+blake|immortals\s+after\s+dark|lords\s+of\s+the\s+underworld|black\s+dagger\s+brotherhood|psy-?changeling|guild\s+hunter|night\s+huntress|fever\s+series|midnight\s+breed|dark\s+kings|guardians\s+of\s+eternity|torpedo\s+ink|spindle\s+cove|castles\s+ever\s+after|girl\s+meets\s+duke|bridgerton|wallflowers|the\s+hathaways|the\s+ravenels|maiden\s+lane|resurrection\s+chronicles|rules\s+of\s+scoundrels|bareknuckle\s+bastards|hell'?s\s+belles|sinful\s+wallflowers|bedwyn\s+saga|gold\s+rush\s+ranch|chestnut\s+springs|rose\s+hill|twisted\s+(?:love|games|hate|lies)|kings\s+of\s+sin|dreamland\s+billionaires|lakefront\s+billionaires|cat\s+and\s+mouse\s+duet|haunting\s+adeline|hunting\s+adeline|devil'?s\s+night|fifty\s+shades|crossfire|off-?campus|briar\s+u|windy\s+city|maple\s+hills|acotar|court\s+of\s+thorns\s+and\s+roses|crescent\s+city|fourth\s+wing|iron\s+flame|onyx\s+storm|empyrean|the\s+ritual|the\s+sinner|the\s+sacrifice|the\s+saboteur|made\s+series|sweetest\s+oblivion|maddest\s+obsession|darkest\s+temptation|queens\s+&\s+monsters|brutal\s+birthright|perfectly\s+imperfect|ravenhood|touch\s+of\s+darkness|royal\s+elite|legacy\s+of\s+gods|dark\s+verse)\b/i;

// 3. Explicit Mature / Erotica / Sex Guide / Spicy Romance Keywords
const MATURE_KEYWORDS_REGEX = /\b(sex\s+guide|sex\s+manual|ultimate\s+sex|joy\s+of\s+sex|supersex|hot\s+sex|she\s+comes\s+first|he\s+comes\s+next|come\s+as\s+you\s+are|multi-?orgasmic|great\s+lover|sex\s+for\s+one|ethical\s+slut|guide\s+to\s+getting\s+it\s+on|getting\s+it\s+on|mating\s+in\s+captivity|sex\s+at\s+dawn|kama\s+sutra|kamasutra|ananga\s+ranga|perfumed\s+garden|120\s+days\s+of\s+sodom|venus\s+in\s+furs|story\s+of\s+o|delta\s+of\s+venus|tropic\s+of\s+cancer|fanny\s+hill|tantric\s+sex|tantra|tao\s+of\s+sex|sacred\s+sexuality|sex\s+positions?|sex\s+techniques?|sex\s+tips?|sex\s+life|sex\s+therapy|sex\s+instruction|sexual\s+instruction|sex\s+counseling|sexual\s+behavior|human\s+sexuality|sensual\s+massage|sexuality|sexual|erotica|erotic|erotic\s+fiction|erotic\s+stories|erotic\s+literature|bdsm|bondage|hentai|explicit|mature\s+content|adults?\s+only|r-18|nsfw|pornography|porno?|taboo|smut|smutty|dark\s+romance|spicy\s+romance|steamy\s+romance|erotic\s+romance|romantic\s+erotica|adult\s+romance|monster\s+smut|monster\s+romance|alien\s+smut|alien\s+romance|orc\s+romance|tentacle\s+romance|omegaverse|knotting|breeding\s+kink|praise\s+kink|degradation|chastity|shibari|cunnilingus|fellatio|blowjob|handjob|anal\s+sex|oral\s+sex|deepthroat|pegging|rimming|orgasm\s+denial|edging|creampie|ejaculat\w*|squirt\w*|cumming|moresome|threesome|gangbang|gang\s+bang|orgy|swingers?|cuckold\w*|hotwife|dub-?con|non-?con|consensual\s+non-?consent|somnophilia|primal\s+play|spicy|steamy|high\s+heat|heat\s+level|spice\s+level|open\s+door|dirty\s+talk|filthy\s+rich|billionaire\s+(?:mc\s+|bad\s+boy\s+|mafia\s+)?romance|cowboy\s+romance|western\s+romance|ranch\s+romance|small\s+town\s+romance|mafia\s+romance|bratva|cartel\s+romance|motorcycle\s+club|mc\s+romance|biker\s+romance|sports\s+romance|hockey\s+romance|reverse\s+harem|why\s+choose|enemies\s+to\s+lovers|fake\s+dating\s+romance|forced\s+proximity|grumpy\s+(?:meets\s+)?sunshine|age\s+gap\s+romance|forbidden\s+romance|possessive\s+(?:alpha|hero|lover)|alpha\s+male|sensual|sexual\s+content|sex\s+scenes?|graphic\s+sex|intercourse|orgasms?|masturbation|fetish|fetishes|clitoris|penis|vagina|dominatrix|seduction|seduced|seduce|delectable\s+body|passionate\s+night|kink|kinky|dominant|submissive|unrated|18\+)\b/i;

// 4. Adult Romance Tropes & Themes (When combined with Romance genre/category or in book titles)
const ADULT_ROMANCE_TROPES_REGEX = /\b(ranch|cowboy|billionaire|boss|employee|fake\s+dating|enemies\s+to\s+lovers|forced\s+proximity|small\s+town|hockey|football|body|bed|bedroom|lover|lovers|kissed|handsome|desire|passion|secret\s+romance|second\s+chance|marriage\s+of\s+convenience|alpha|bodyguard|rockstar)\b/i;

// 5. Romance Title Signatures (Surrender, Scandal, Seduction, Courtesan, Rake, Rogue, etc.)
const ADULT_ROMANCE_TITLE_REGEX = /\b(surrender|scandal|scandalous|seduce|seduced|seduction|affair|bedding|mistress|rake|rogue|scoundrel|wicked\s+(?:duke|lord|earl|rogue|viscount|gentleman|night)|passionate|sensual|temptation|tempted|highlander|duchess|duke|earl|viscount|courtesan)\b/i;

const KIDS_KEYWORDS_REGEX = /\b(juvenile|children|childhood|preschool|picture\s+books?|early\s+readers?|middle\s+grade|fairy\s+tales?|nursery|kindergarten|elementary|kids?|baby|toddler|storybook|bedtime\s+stor(?:y|ies)|lullab(?:y|ies)|peppa\s+pig|paw\s+patrol|bluey|dr\.?\s*seuss|berenstain\s+bears?|sesame\s+street)\b/i;

const YA_KEYWORDS_REGEX = /\b(young\s+adult|ya\s+fiction|teens?|teen\s+fiction|adolescen(?:ce|t)|coming\s+of\s+age|high\s+school)\b/i;

/**
 * Deterministic checker for explicit sex manuals, erotica, and adult content that must never appear in general trending showcases
 */
export function isExplicitSexOrErotica(title?: string | null, author?: string | null, subjects?: any, overview?: string | null): boolean {
    const text = `${title || ""} ${author || ""} ${Array.isArray(subjects) ? subjects.join(" ") : (subjects || "")} ${overview || ""}`.toLowerCase();
    return /\b(anne\s+hooper|alex\s+comfort|tracey\s+cox|ian\s+kerner|emily\s+nagoski|mantak\s+chia|lou\s+paget|betty\s+dodson|dossie\s+easton|esther\s+perel|paul\s+joannides|christopher\s+ryan|vatsyayana|kalyana\s+malla|sheikh\s+nefzawi|marquis\s+de\s+sade|sacher-?masoch|pauline\s+r[eé]age|ana[iï]s\s+nin|henry\s+miller|john\s+cleland|georges\s+bataille|catherine\s+millet|sex\s+guide|sex\s+manual|ultimate\s+sex|joy\s+of\s+sex|supersex|hot\s+sex|she\s+comes\s+first|he\s+comes\s+next|come\s+as\s+you\s+are|multi-?orgasmic|great\s+lover|sex\s+for\s+one|ethical\s+slut|guide\s+to\s+getting\s+it\s+on|getting\s+it\s+on|mating\s+in\s+captivity|sex\s+at\s+dawn|kama\s+sutra|kamasutra|ananga\s+ranga|perfumed\s+garden|120\s+days\s+of\s+sodom|venus\s+in\s+furs|story\s+of\s+o|delta\s+of\s+venus|tropic\s+of\s+cancer|fanny\s+hill|tantric\s+sex|tantra|tao\s+of\s+sex|sacred\s+sexuality|sex\s+positions?|sex\s+techniques?|sex\s+tips?|sex\s+life|sex\s+therapy|sex\s+instruction|sexual\s+instruction|sex\s+counseling|sensual\s+massage|erotica|romantic\s+erotica|erotic\s+fiction|erotic\s+stories|erotic\s+literature|bdsm|bondage|fetish|fetishes|pornography|porno|smut|masturbation|orgasms?|cunnilingus|fellatio|blowjob|anal\s+sex|oral\s+sex|deepthroat|pegging|rimming|creampie|ejaculat\w*|squirt\w*|cumming|moresome|threesome|gangbang|gang\s+bang|orgy|cuckold\w*|hotwife|dub-?con|non-?con|consensual\s+non-?consent|somnophilia|knotting|breeding\s+kink)\b/i.test(text);
}

/**
 * Infers standardized age rating and maturity from book metadata
 */
export function inferBookRating(input: {
    maturityRating?: string | null;
    categories?: (string | null | undefined)[] | null;
    subjects?: (string | null | undefined)[] | null;
    genre?: string | null;
    title?: string | null;
    author?: string | null;
    series?: string | null;
    overview?: string | null;
}): BookRatingResult {
    const rawMaturity = (input.maturityRating || "").toUpperCase().trim();
    const categoriesText = (input.categories || []).filter(Boolean).join(" ");
    const subjectsText = (input.subjects || []).filter(Boolean).join(" ");
    const authorText = (input.author || "").trim();
    const seriesText = (input.series || "").trim();
    const combinedTokens = `${input.title || ""} ${authorText} ${seriesText} ${input.genre || ""} ${categoriesText} ${subjectsText} ${input.overview || ""}`.toLowerCase();

    // 0. Check Explicit Sex Manuals, Erotica, & Adult Sexual Guides (Anne Hooper, Kama Sutra, Sex Guides, etc.)
    if (isExplicitSexOrErotica(input.title, authorText, [categoriesText, subjectsText], input.overview)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 1. Check Known Spicy / Adult Romance Authors
    if (authorText && KNOWN_SPICY_AUTHORS_REGEX.test(authorText)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 2. Check Known Spicy / Adult Series
    if (seriesText && KNOWN_SPICY_SERIES_REGEX.test(seriesText)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 3. Explicit Mature Indicators & Mature Keywords
    if (rawMaturity === "MATURE" || MATURE_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 3b. Historical & Adult Romance Title Signatures (Surrender, Scandal, Seduction, Courtesan, etc.)
    if (input.title && ADULT_ROMANCE_TITLE_REGEX.test(input.title) && !/\b(biography|history|nonfiction|military|war)\b/i.test(combinedTokens)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 4. Kids / Children Indicators (BISAC: Juvenile Fiction, Juvenile Nonfiction, etc.)
    // Note: Kids takes precedence over general keywords, provided it has no mature flags
    if (KIDS_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "Kids",
            maturityRating: "NOT_MATURE",
            isMature: false
        };
    }

    // 5. Young Adult / Teen Indicators (BISAC: Young Adult Fiction, YA)
    if (YA_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "YA (12+)",
            maturityRating: "NOT_MATURE",
            isMature: false
        };
    }

    // 6. Romance Category Evaluation:
    // In mainstream publishing, general "Romance" / "Love stories" is adult fiction.
    // If it has romance tropes or is general adult romance, it is strictly 18+ Mature, NEVER "All Ages".
    const isRomanceCategory = /\b(romance|love\s+stories|romantic\s+fiction)\b/i.test(`${input.genre || ""} ${categoriesText} ${subjectsText}`);
    if (isRomanceCategory) {
        if (ADULT_ROMANCE_TROPES_REGEX.test(combinedTokens)) {
            return {
                ageRating: "18+ Mature",
                maturityRating: "MATURE",
                isMature: true
            };
        }
        // General romance with no YA/children classification defaults to 18+ Mature for safety
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 7. Default / General Audience (History, Science, General non-romance fiction)
    return {
        ageRating: "All Ages",
        maturityRating: "NOT_MATURE",
        isMature: false
    };
}

/**
 * Checks if a library object is a dedicated kids/children reading shelf
 */
export function isKidsLibrary(lib?: { name?: string | null; path?: string | null; description?: string | null } | null): boolean {
    if (!lib) return false;
    const name = (lib.name || "").toLowerCase();
    const p = (lib.path || "").toLowerCase();
    const desc = (lib.description || "").toLowerCase();
    return name.includes("kid") || p.includes("kid") || desc.includes("kid") || name.includes("kyra") || p.includes("kyra");
}

/**
 * Checks if a library object is Kyra's shelf / kids reading shelf
 */
export function isKyrasLibrary(lib?: { name?: string | null; path?: string | null; description?: string | null } | null): boolean {
    if (!lib) return false;
    const name = (lib.name || "").toLowerCase();
    const p = (lib.path || "").toLowerCase();
    const desc = (lib.description || "").toLowerCase();
    return name.includes("kyra") || p.includes("kyra") || name.includes("kid") || p.includes("kid") || desc.includes("kid");
}

/**
 * Checks if a library object is a public reading shelf
 */
export function isPublicLibrary(lib?: { name?: string | null; path?: string | null; description?: string | null } | null): boolean {
    if (!lib) return false;
    const name = (lib.name || "").toLowerCase();
    const p = (lib.path || "").toLowerCase();
    const desc = (lib.description || "").toLowerCase();
    return name.includes("public") || p.includes("public") || name.includes("general") || desc.includes("public");
}

/**
 * Evaluates whether requests targeting this library should be auto-approved
 * (Kyra's library and Public libraries are explicitly auto-approved per server policy)
 */
export function isAutoApprovedBookLibrary(lib?: { name?: string | null; path?: string | null; description?: string | null } | null): boolean {
    if (!lib) return true;
    return isKyrasLibrary(lib) || isPublicLibrary(lib);
}
