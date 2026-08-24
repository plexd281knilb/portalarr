const { scanLibraryInternal } = require('./src/app/actions'); scanLibraryInternal().then(() => console.log('Done')).catch(e => console.error(e));
