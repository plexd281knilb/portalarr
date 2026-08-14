const path = require('path');
function getEffectiveBookBaseName(fullPath, file, ext) {
    const rawBase = path.basename(file, ext);
    const parentFolder = path.basename(path.dirname(fullPath));
    const grandParentFolder = path.basename(path.dirname(path.dirname(fullPath)));
    const discPattern = /^(?:Disc|CD|Part|Vol|Volume|Track|Disk)\s*\d+$/i;
    const pureNumPattern = /^\d+$/;
    const cleanedParent = parentFolder;
    const cleanedGrandParent = grandParentFolder;
    const isTrackFilename = /^(?:\d{1,3}[\s._-]+)+/i.test(rawBase.trim()) || discPattern.test(rawBase.trim()) || pureNumPattern.test(rawBase.trim());
    
    if (isTrackFilename && parentFolder && parentFolder !== '.' && parentFolder !== '/' && parentFolder.length > 2) {
        if (discPattern.test(parentFolder.trim()) || pureNumPattern.test(parentFolder.trim())) {
            if (cleanedGrandParent && cleanedGrandParent !== '.' && cleanedGrandParent !== '/' && cleanedGrandParent.length > 2) {
                return cleanedGrandParent;
            }
        }
        return cleanedParent;
    }
    
    if (discPattern.test(parentFolder.trim())) {
        if (cleanedGrandParent && cleanedGrandParent !== '.' && cleanedGrandParent !== '/' && cleanedGrandParent.length > 2) {
            return cleanedGrandParent;
        }
    }
    
    if (cleanedParent && cleanedParent !== '.' && cleanedParent !== '/' && cleanedParent.length > 2) {
        const parentLower = cleanedParent.toLowerCase();
        const isGenericRoot = parentLower === 'books' || parentLower === 'audiobooks' || parentLower === 'userbooks' || parentLower === 'kidsbooks' || parentLower === 'kyrabooks' || parentLower === 'downloads' || parentLower === 'public library' || parentLower === 'public audiobooks' || parentLower.includes('library') || parentLower.includes('bookshelf');
        if (!isGenericRoot) {
            return cleanedParent;
        }
    }
    return rawBase;
}
console.log('3:', getEffectiveBookBaseName('/audiobooks/Harry/Disc 01/Track.mp3', 'Track.mp3', '.mp3'));
console.log('4:', getEffectiveBookBaseName('/audiobooks/Disc 01/Track.mp3', 'Track.mp3', '.mp3'));
