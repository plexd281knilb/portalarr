import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://api.github.com/repos/Kometa-Team/Kometa/contents/defaults/overlays/images';
const TARGET_DIR = path.join(process.cwd(), 'public', 'kometa_stock');

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Portalarr-Kometa-Asset-Sync'
        }
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

async function downloadFile(downloadUrl, destPath) {
    const res = await fetch(downloadUrl, {
        headers: {
            'User-Agent': 'Portalarr-Kometa-Asset-Sync'
        }
    });
    if (!res.ok) {
        throw new Error(`Failed to download ${downloadUrl}: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    console.log(`Downloaded: ${path.relative(process.cwd(), destPath)} (${buffer.length} bytes)`);
}

async function crawlDirectory(url, localDir) {
    console.log(`Scanning: ${url}`);
    const items = await fetchJson(url);
    if (!Array.isArray(items)) {
        return;
    }

    for (const item of items) {
        const destPath = path.join(localDir, item.name);
        if (item.type === 'dir') {
            await crawlDirectory(item.url, destPath);
        } else if (item.type === 'file' && item.download_url) {
            await downloadFile(item.download_url, destPath);
        }
    }
}

async function main() {
    console.log(`Starting Kometa stock asset sync to: ${TARGET_DIR}`);
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    await crawlDirectory(BASE_URL, TARGET_DIR);
    console.log('Kometa stock asset sync complete!');
}

main().catch(err => {
    console.error('Asset sync failed:', err);
    process.exit(1);
});
