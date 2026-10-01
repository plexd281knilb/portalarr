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

const MATURE_KEYWORDS_REGEX = /\b(erotica|erotic|bdsm|hentai|explicit|mature\s+content|adults?\s+only|r-18|nsfw|pornography|taboo|smut|dark\s+romance)\b/i;

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
    overview?: string | null;
}): BookRatingResult {
    const rawMaturity = (input.maturityRating || "").toUpperCase().trim();
    const categoriesText = (input.categories || []).filter(Boolean).join(" ");
    const subjectsText = (input.subjects || []).filter(Boolean).join(" ");
    const combinedTokens = `${input.title || ""} ${input.genre || ""} ${categoriesText} ${subjectsText} ${input.overview || ""}`.toLowerCase();

    // 1. Explicit Mature Indicators
    if (rawMaturity === "MATURE" || MATURE_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "18+ Mature",
            maturityRating: "MATURE",
            isMature: true
        };
    }

    // 2. Kids / Children Indicators (BISAC: Juvenile Fiction, Juvenile Nonfiction, etc.)
    if (KIDS_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "Kids",
            maturityRating: "NOT_MATURE",
            isMature: false
        };
    }

    // 3. Young Adult / Teen Indicators (BISAC: Young Adult Fiction, YA)
    if (YA_KEYWORDS_REGEX.test(combinedTokens)) {
        return {
            ageRating: "YA (12+)",
            maturityRating: "NOT_MATURE",
            isMature: false
        };
    }

    // 4. Default / General Audience
    return {
        ageRating: "All Ages",
        maturityRating: "NOT_MATURE",
        isMature: false
    };
}
