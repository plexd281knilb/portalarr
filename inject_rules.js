const fs = require('fs');

let content = fs.readFileSync('src/app/actions.ts', 'utf8');

// Insert Bridgerton overrides before the Harry Potter ones
const hpIndex = content.indexOf('if (lowerTitle.includes(\"harry potter\")');

if (hpIndex !== -1) {
    const bridgertonRules = \
    // Bridgerton Master Rules
    if (lowerTitle.includes("bridgerton") || lowerTitle.includes("duke and i") || lowerTitle.includes("viscount who loved me") || lowerTitle.includes("offer from a gentleman") || lowerTitle.includes("romancing mister bridgerton") || lowerTitle.includes("to sir phillip") || lowerTitle.includes("when he was wicked") || lowerTitle.includes("its in his kiss") || lowerTitle.includes("it's in his kiss") || lowerTitle.includes("on the way to the wedding") || lowerTitle.includes("second epilogue")) {
        author = "Julia Quinn";
        extractedSeries = "Bridgerton";
        if (lowerTitle.includes("duke and i")) { title = "The Duke and I"; extractedVolume = "1"; }
        else if (lowerTitle.includes("viscount who loved me")) { title = "The Viscount Who Loved Me"; extractedVolume = "2"; }
        else if (lowerTitle.includes("offer from a gentleman")) { title = "An Offer From a Gentleman"; extractedVolume = "3"; }
        else if (lowerTitle.includes("romancing mister bridgerton")) { title = "Romancing Mister Bridgerton"; extractedVolume = "4"; }
        else if (lowerTitle.includes("to sir phillip")) { title = "To Sir Phillip, With Love"; extractedVolume = "5"; }
        else if (lowerTitle.includes("when he was wicked")) { title = "When He Was Wicked"; extractedVolume = "6"; }
        else if (lowerTitle.includes("its in his kiss") || lowerTitle.includes("it\\'s in his kiss")) { title = "It's in His Kiss"; extractedVolume = "7"; }
        else if (lowerTitle.includes("on the way to the wedding")) { title = "On the Way to the Wedding"; extractedVolume = "8"; }
        else if (lowerTitle.includes("second epilogue")) { title = "The Bridgertons: Happily Ever After"; extractedVolume = "9"; }
    }

    // Spy School & FunJungle Master Rules
    if (lowerTitle.includes("spy school") || lowerTitle.includes("spy camp") || lowerTitle.includes("evil spy") || lowerTitle.includes("spy ski") || lowerTitle.includes("secret service") || lowerTitle.includes("spy on history")) {
        author = "Stuart Gibbs";
        extractedSeries = "Spy School";
    }
    if (lowerTitle.includes("funjungle") || lowerTitle.includes("belly up") || lowerTitle.includes("poached") || lowerTitle.includes("big game") || lowerTitle.includes("panda-monium") || lowerTitle.includes("lion down") || lowerTitle.includes("tyrannosaurus wrecks") || lowerTitle.includes("bear bottom") || lowerTitle.includes("whale done")) {
        author = "Stuart Gibbs";
        extractedSeries = "FunJungle";
    }

    \;
    content = content.slice(0, hpIndex) + bridgertonRules + content.slice(hpIndex);
}

fs.writeFileSync('src/app/actions.ts', content);
