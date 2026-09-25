/**
 * Pure TypeScript QR Code Generator (Zero Dependencies)
 * Generates clean SVG markup for arbitrary text/URLs (Payment Deep Links, Venmo, PayPal, Zelle).
 */

// QR Code Error Correction Levels
export type QRECCLevel = "L" | "M" | "Q" | "H";

// Standard QR polynomial tables & Galois field GF(256) operations
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF256_EXP[i] = x;
        GF256_LOG[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
    for (let i = 255; i < 512; i++) {
        GF256_EXP[i] = GF256_EXP[i - 255];
    }
})();

function gmul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

// Generate Reed-Solomon generator polynomial
function rsGenPoly(n: number): Uint8Array {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < n; i++) {
        const next = new Uint8Array(poly.length + 1);
        const factor = GF256_EXP[i];
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= gmul(poly[j], factor);
            next[j + 1] ^= poly[j];
        }
        poly = next;
    }
    return poly;
}

// Compute Reed-Solomon error correction codewords
function rsCompute(data: Uint8Array, numEcc: number): Uint8Array {
    const gen = rsGenPoly(numEcc);
    const res = new Uint8Array(numEcc);
    for (let i = 0; i < data.length; i++) {
        const factor = data[i] ^ res[0];
        for (let j = 0; j < numEcc - 1; j++) {
            res[j] = res[j + 1] ^ gmul(gen[j + 1], factor);
        }
        res[numEcc - 1] = gmul(gen[numEcc], factor);
    }
    return res;
}

// QR Code Specifications for Versions 1 to 10 with ECC 'M'
interface QRVersionSpec {
    version: number;
    size: number;
    totalBytes: number;
    dataBytes: number;
    eccBytes: number;
    eccBlocks: number;
    alignments: number[];
}

const QR_SPECS: QRVersionSpec[] = [
    { version: 1, size: 21, totalBytes: 26, dataBytes: 16, eccBytes: 10, eccBlocks: 1, alignments: [] },
    { version: 2, size: 25, totalBytes: 44, dataBytes: 28, eccBytes: 16, eccBlocks: 1, alignments: [6, 18] },
    { version: 3, size: 29, totalBytes: 70, dataBytes: 44, eccBytes: 26, eccBlocks: 1, alignments: [6, 22] },
    { version: 4, size: 33, totalBytes: 100, dataBytes: 64, eccBytes: 36, eccBlocks: 2, alignments: [6, 26] },
    { version: 5, size: 37, totalBytes: 134, dataBytes: 86, eccBytes: 48, eccBlocks: 2, alignments: [6, 30] },
    { version: 6, size: 41, totalBytes: 172, dataBytes: 108, eccBytes: 64, eccBlocks: 4, alignments: [6, 34] },
    { version: 7, size: 45, totalBytes: 196, dataBytes: 124, eccBytes: 72, eccBlocks: 4, alignments: [6, 22, 38] },
    { version: 8, size: 49, totalBytes: 242, dataBytes: 154, eccBytes: 88, eccBlocks: 4, alignments: [6, 24, 42] },
    { version: 9, size: 53, totalBytes: 292, dataBytes: 182, eccBytes: 110, eccBlocks: 5, alignments: [6, 26, 46] },
    { version: 10, size: 57, totalBytes: 346, dataBytes: 216, eccBytes: 130, eccBlocks: 5, alignments: [6, 28, 50] },
];

/**
 * Encodes input string as QR Code 2D boolean matrix.
 */
export function generateQRMatrix(text: string): boolean[][] {
    const utf8 = new TextEncoder().encode(text);
    
    // Pick smallest version that fits data + 4-bit mode + 8/16-bit count
    let spec = QR_SPECS[0];
    for (const s of QR_SPECS) {
        const headerBits = 4 + (s.version <= 9 ? 8 : 16);
        const totalBitsNeeded = headerBits + utf8.length * 8;
        if (totalBitsNeeded <= s.dataBytes * 8) {
            spec = s;
            break;
        }
        spec = s;
    }

    // Build data bitstream (Byte Mode: 0100)
    const bits: number[] = [];
    // Mode 0100 (Byte)
    bits.push(0, 1, 0, 0);
    // Character count indicator
    const countBits = spec.version <= 9 ? 8 : 16;
    for (let i = countBits - 1; i >= 0; i--) {
        bits.push((utf8.length >> i) & 1);
    }
    // Data bytes
    for (const byte of utf8) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }
    // Terminator (up to 4 zeroes)
    const maxBits = spec.dataBytes * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) {
        bits.push(0);
    }
    // Byte boundary padding
    while (bits.length % 8 !== 0) {
        bits.push(0);
    }
    // Pad bytes (0xEC, 0x11)
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < maxBits) {
        const pb = padBytes[padIdx % 2];
        for (let i = 7; i >= 0; i--) {
            bits.push((pb >> i) & 1);
        }
        padIdx++;
    }

    // Convert bits to byte array
    const dataBytes = new Uint8Array(spec.dataBytes);
    for (let i = 0; i < spec.dataBytes; i++) {
        let b = 0;
        for (let j = 0; j < 8; j++) {
            b = (b << 1) | bits[i * 8 + j];
        }
        dataBytes[i] = b;
    }

    // Compute Error Correction Blocks
    const eccPerBlock = Math.floor(spec.eccBytes / spec.eccBlocks);
    const dataPerBlock = Math.floor(spec.dataBytes / spec.eccBlocks);
    const dataBlocks: Uint8Array[] = [];
    const eccBlocks: Uint8Array[] = [];

    for (let i = 0; i < spec.eccBlocks; i++) {
        const start = i * dataPerBlock;
        const end = i === spec.eccBlocks - 1 ? spec.dataBytes : (i + 1) * dataPerBlock;
        const block = dataBytes.slice(start, end);
        dataBlocks.push(block);
        eccBlocks.push(rsCompute(block, eccPerBlock));
    }

    // Interleave data & ECC codewords
    const finalCodewords: number[] = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxDataLen; i++) {
        for (const block of dataBlocks) {
            if (i < block.length) finalCodewords.push(block[i]);
        }
    }
    for (let i = 0; i < eccPerBlock; i++) {
        for (const block of eccBlocks) {
            if (i < block.length) finalCodewords.push(block[i]);
        }
    }

    // Initialize Matrix
    const N = spec.size;
    const matrix: (boolean | null)[][] = Array.from({ length: N }, () => Array(N).fill(null));
    const isFunction: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

    // Finder Patterns
    const addFinder = (r: number, c: number) => {
        for (let dr = -1; dr <= 7; dr++) {
            for (let dc = -1; dc <= 7; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
                    isFunction[nr][nc] = true;
                    if (dr === -1 || dr === 7 || dc === -1 || dc === 7) {
                        matrix[nr][nc] = false; // Separator
                    } else if (dr === 0 || dr === 6 || dc === 0 || dc === 6) {
                        matrix[nr][nc] = true;
                    } else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) {
                        matrix[nr][nc] = true;
                    } else {
                        matrix[nr][nc] = false;
                    }
                }
            }
        }
    };

    addFinder(0, 0);
    addFinder(0, N - 7);
    addFinder(N - 7, 0);

    // Alignment Patterns
    if (spec.alignments.length > 0) {
        for (const r of spec.alignments) {
            for (const c of spec.alignments) {
                if (isFunction[r][c]) continue;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        isFunction[nr][nc] = true;
                        if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
                            matrix[nr][nc] = true;
                        } else {
                            matrix[nr][nc] = false;
                        }
                    }
                }
            }
        }
    }

    // Timing Patterns
    for (let i = 8; i < N - 8; i++) {
        if (!isFunction[6][i]) {
            isFunction[6][i] = true;
            matrix[6][i] = i % 2 === 0;
        }
        if (!isFunction[i][6]) {
            isFunction[i][6] = true;
            matrix[i][6] = i % 2 === 0;
        }
    }

    // Dark Module
    isFunction[4 * spec.version + 9][8] = true;
    matrix[4 * spec.version + 9][8] = true;

    // Reserve Format Information Area
    for (let i = 0; i < 9; i++) {
        if (i < N) {
            isFunction[8][i] = true;
            isFunction[i][8] = true;
        }
    }
    for (let i = 0; i < 8; i++) {
        isFunction[8][N - 1 - i] = true;
        isFunction[N - 1 - i][8] = true;
    }

    // Place Data Bits in Matrix with Zigzag scanning
    const allBits: number[] = [];
    for (const cw of finalCodewords) {
        for (let i = 7; i >= 0; i--) {
            allBits.push((cw >> i) & 1);
        }
    }
    // Remainder bits if needed
    while (allBits.length < N * N) {
        allBits.push(0);
    }

    let bitIdx = 0;
    let upward = true;
    for (let right = N - 1; right > 0; right -= 2) {
        if (right === 6) right--; // Skip vertical timing column
        const rows = upward
            ? Array.from({ length: N }, (_, i) => N - 1 - i)
            : Array.from({ length: N }, (_, i) => i);

        for (const r of rows) {
            for (const col of [right, right - 1]) {
                if (!isFunction[r][col]) {
                    const b = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
                    // Apply Mask 0: (row + col) % 2 === 0
                    const mask = (r + col) % 2 === 0;
                    matrix[r][col] = (b === 1) !== mask;
                }
            }
        }
        upward = !upward;
    }

    // Write Format Information (ECC 'M' = 00, Mask 0 = 000 -> 00000 -> BCH code: 101010000010010 ^ 101010000010010 = 000000000000000 -> XOR mask 101010000010010)
    // Precalculated format bits for ECC Level 'M' and Mask Pattern 0:
    const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
    
    // Top-left format placement
    const tlCoords = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
        const [r, c] = tlCoords[i];
        matrix[r][c] = formatBits[i] === 1;
    }

    // Bottom-left and Top-right format placement
    for (let i = 0; i < 7; i++) {
        matrix[N - 1 - i][8] = formatBits[i] === 1;
    }
    for (let i = 7; i < 15; i++) {
        matrix[8][N - 15 + i] = formatBits[i] === 1;
    }

    return matrix.map((row) => row.map((cell) => cell ?? false));
}

/**
 * Renders QR matrix into an SVG data string or XML markup.
 */
export function generateQRSvg(
    text: string,
    options: {
        size?: number;
        fgColor?: string;
        bgColor?: string;
        margin?: number;
    } = {}
): string {
    const { size = 240, fgColor = "#ffffff", bgColor = "transparent", margin = 2 } = options;
    const matrix = generateQRMatrix(text);
    const N = matrix.length;
    const totalSize = N + margin * 2;
    const cellSize = 1;

    let paths = "";
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            if (matrix[r][c]) {
                const x = c + margin;
                const y = r + margin;
                paths += `M${x},${y}h1v1h-1z `;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  ${bgColor !== "transparent" ? `<rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />` : ""}
  <path d="${paths.trim()}" fill="${fgColor}" />
</svg>`;
}
