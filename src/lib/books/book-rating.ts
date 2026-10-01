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


// 1. Curated Registry of Known Adult / Spicy Romance & Dark Fiction Authors
const KNOWN_SPICY_AUTHORS_REGEX = /\b(elsie\s+silver|colleen\s+hoover|ana\s+huang|penelope\s+douglas|ali\s+hazelwood|tessa\s+bailey|lauren\s+asher|lucy\s+score|meghan\s+quinn|h\.?\s*d\.?\s*carlton|shantel\s+tessier|vi\s+keeland|penelope\s+ward|penelope\s+sky|sylvia\s+day|e\.?\s*l\.?\s*james|j\.?\s*t\.?\s*geissinger|sarah\s+j\.?\s*maas|rebecca\s+yarros|emily\s+henry|kristen\s+ashley|elle\s+kennedy|runyx|rina\s+kent|sophie\s+lark|cora\s+reilly|danielle\s+lori|mia\s+sheridan|hannah\s+grace|stephanie\s+archer|liz\s+tomforde|devney\s+perry|kennedy\s+fox|abby\s+jimenez|christina\s+lauren|helen\s+hoang|laura\s+thalassa|carissa\s+broadbent|jennifer\s+l\.?\s*armentrout|k\.?\s*a\.?\s*tucker|l\.?\s*j\.?\s*shen|brittainy\s+c\.?\s*cherry|mia\s+knight|pam\s+godwin|t\.?\s*l\.?\s*swan|louise\s+bay|samantha\s+young|maya\s+banks|j\.?\s*r\.?\s*ward|kresley\s+cole|gena\s+showalter|nalini\s+singh|laurell\s+k\.?\s*hamilton|sherrilyn\s+kenyon|lila\s+lush|c\.?\s*m\.?\s*stunich|jagger\s+cole|eva\s+winners|neva\s+altaj|somme\s+sketcher|michelle\s+heard|nicole\s+fox|tracy\s+lorraine|callie\s+rose|tate\s+james|caroline\s+peckham|susanne\s+valenti|amo\s+jones|pepper\s+winters)\b/i;

// 2. Curated Registry of Known Adult / Spicy Series
const KNOWN_SPICY_SERIES_REGEX = /\b(gold\s+rush\s+ranch|chestnut\s+springs|rose\s+hill|twisted\s+(?:love|games|hate|lies)|kings\s+of\s+sin|dreamland\s+billionaires|lakefront\s+billionaires|cat\s+and\s+mouse\s+duet|haunting\s+adeline|hunting\s+adeline|devil'?s\s+night|fifty\s+shades|crossfire|off-?campus|briar\s+u|windy\s+city|maple\s+hills|acotar|court\s+of\s+thorns\s+and\s+roses|crescent\s+city|fourth\s+wing|iron\s+flame|onyx\s+storm|empyrean|the\s+ritual|the\s+sinner|the\s+sacrifice|the\s+saboteur|made\s+series|sweetest\s+oblivion|maddest\s+obsession|darkest\s+temptation|queens\s+&\s+monsters|brutal\s+birthright|perfectly\s+imperfect|ravenhood|touch\s+of\s+darkness|royal\s+elite|legacy\s+of\s+gods|dark\s+verse)\b/i;

// 3. Explicit Mature / Erotica / Spicy Romance Keywords
const MATURE_KEYWORDS_REGEX = /\b(erotica|erotic|bdsm|bondage|hentai|explicit|mature\s+content|adults?\s+only|r-18|nsfw|pornography|porno?|taboo|smut|smutty|dark\s+romance|spicy\s+romance|steamy\s+romance|erotic\s+romance|romantic\s+erotica|adult\s+romance|spicy|steamy|high\s+heat|heat\s+level|spice\s+level|open\s+door|dirty\s+talk|filthy\s+rich|billionaire\s+(?:mc\s+|bad\s+boy\s+|mafia\s+)?romance|cowboy\s+romance|western\s+romance|ranch\s+romance|small\s+town\s+romance|mafia\s+romance|bratva|cartel\s+romance|motorcycle\s+club|mc\s+romance|biker\s+romance|sports\s+romance|hockey\s+romance|reverse\s+harem|why\s+choose|enemies\s+to\s+lovers|fake\s+dating\s+romance|forced\s+proximity|grumpy\s+(?:meets\s+)?sunshine|age\s+gap\s+romance|forbidden\s+romance|possessive\s+(?:alpha|hero|lover)|alpha\s+male|sensual|sexual\s+content|sex\s+scenes?|graphic\s+sex|intercourse|orgasm|seduction|seduced|seduce|delectable\s+body|passionate\s+night|kink|kinky|dominant|submissive|unrated|18\+)\b/i;

// 4. Adult Romance Tropes & Themes (When combined with Romance genre/category)
const ADULT_ROMANCE_TROPES_REGEX = /\b(ranch|cowboy|billionaire|boss|employee|fake\s+dating|enemies\s+to\s+lovers|forced\s+proximity|small\s+town|hockey|football|body|bed|bedroom|lover|lovers|kissed|handsome|desire|passion|secret\s+romance|second\s+chance|marriage\s+of\s+convenience|alpha|bodyguard|rockstar)\b/i;

const KIDS_KEYWORDS_REGEX = /\b(juvenile|children|childhood|preschool|picture\s+books?|early\s+readers?|middle\s+grade|fairy\s+tales?|nursery|kindergarten|elementary|kids?|baby|toddler|storybook|bedtime\s+stor(?:y|ies)|lullab(?:y|ies)|peppa\s+pig|paw\s+patrol|bluey|dr\.?\s*seuss|berenstain\s+bears?|sesame\s+street)\b/i;

const YA_KEYWORDS_REGEX = /\b(young\s+adult|ya\s+fiction|teens?|teen\s+fiction|adolescen(?:ce|t)|coming\s+of\s+age|high\s+school)\b/i;

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
