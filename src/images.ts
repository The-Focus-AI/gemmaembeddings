import { deflateSync } from "node:zlib";

export type RGBA = readonly [number, number, number, number];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);
  return out;
}

/**
 * Encodes an RGBA pixel callback into a valid, uncompressed-filter PNG buffer.
 */
export function renderPng(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => RGBA,
): Buffer {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const idx = rowStart + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = deflateSync(raw);
  const chunks = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(compressed)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  return Buffer.concat(chunks);
}

export interface SyntheticScene {
  id: string;
  title: string;
  groundTruthCaption: string;
  category: string;
  pngBase64: string;
  dataUrl: string;
}

/**
 * Generates deterministic 160x160 visual PNG scenes for cross-modal testing.
 * No text is drawn on the canvas; EmbeddingGemma 2's vision encoder must recognize the visual scene.
 */
export function buildSyntheticScenes(size = 160): SyntheticScene[] {
  const half = size / 2;

  // 1. Red octagonal stop/warning emblem with white border on light sky gray
  const stopSign = renderPng(size, size, (x, y) => {
    const dx = Math.abs(x - half);
    const dy = Math.abs(y - half);
    const octDist = Math.max(dx, dy, (dx + dy) * 0.7071);
    const rOuter = size * 0.38;
    const rWhite = size * 0.34;
    const rInner = size * 0.3;
    if (octDist <= rInner) {
      // horizontal white bar in the middle like a no-entry / warning traffic sign, or solid red octagon
      if (dy < size * 0.055 && dx < size * 0.19) {
        return [255, 255, 255, 255];
      }
      return [215, 28, 36, 255];
    }
    if (octDist <= rWhite) return [255, 255, 255, 255];
    if (octDist <= rOuter) return [185, 20, 28, 255];
    // Post at bottom
    if (y > half + rOuter - 2 && dx < size * 0.035) return [110, 118, 129, 255];
    return [226, 236, 245, 255];
  });

  // 2. Golden orange sun setting over deep blue ocean waves
  const oceanSunset = renderPng(size, size, (x, y) => {
    const horizon = Math.floor(size * 0.62);
    const sunX = half;
    const sunY = Math.floor(size * 0.52);
    const distSun = Math.hypot(x - sunX, y - sunY);
    if (y < horizon) {
      if (distSun < size * 0.18) {
        return [255, 224, 92, 255];
      }
      if (distSun < size * 0.24) {
        return [255, 165, 62, 255];
      }
      const t = y / horizon;
      const r = Math.round(90 + 165 * t);
      const g = Math.round(55 + 95 * t);
      const b = Math.round(135 - 50 * t);
      return [r, g, b, 255];
    }
    // Ocean water with sun reflection & wave stripes
    const wave = Math.sin(x * 0.22 + y * 0.45) * 8;
    const reflectWidth = size * 0.14 * (1 - (y - horizon) / (size - horizon) * 0.5);
    if (Math.abs(x - sunX + wave * 0.5) < reflectWidth && (y % 5 < 3)) {
      return [250, 182, 75, 255];
    }
    const depth = (y - horizon) / (size - horizon);
    return [
      Math.round(18 + wave),
      Math.round(78 - depth * 35 + wave),
      Math.round(158 - depth * 45),
      255,
    ];
  });

  // 3. Green pine tree in a sunny meadow
  const pineTree = renderPng(size, size, (x, y) => {
    const groundY = Math.floor(size * 0.8);
    if (y >= groundY) {
      return [76, 154, 62, 255];
    }
    // Three layered green pine triangles
    const dx = Math.abs(x - half);
    const inTop = y >= size * 0.14 && y <= size * 0.4 && dx <= (y - size * 0.14) * 0.72;
    const inMid = y >= size * 0.3 && y <= size * 0.56 && dx <= (y - size * 0.24) * 0.75;
    const inBot = y >= size * 0.46 && y <= size * 0.7 && dx <= (y - size * 0.36) * 0.8;
    if (inTop || inMid || inBot) {
      const shade = (x - half) > 0 ? -14 : 10;
      return [34 + shade, 128 + shade, 54 + shade, 255];
    }
    // Brown trunk
    if (y >= size * 0.68 && y < groundY && dx <= size * 0.055) {
      return [112, 72, 42, 255];
    }
    // Clear sky blue
    return [168, 218, 250, 255];
  });

  // 4. Rising blue analytics bar chart on white background with axes
  const barChart = renderPng(size, size, (x, y) => {
    const left = Math.floor(size * 0.16);
    const right = Math.floor(size * 0.88);
    const bottom = Math.floor(size * 0.84);
    const top = Math.floor(size * 0.14);

    // Axes
    if ((x >= left - 2 && x <= left && y >= top && y <= bottom + 2) ||
        (y >= bottom && y <= bottom + 2 && x >= left - 2 && x <= right)) {
      return [45, 55, 72, 255];
    }
    // Horizontal grid lines
    if (x > left && x < right && y > top && y < bottom && (bottom - y) % 24 === 0) {
      return [226, 232, 240, 255];
    }
    // 4 rising vertical blue bars
    const heights = [0.28, 0.48, 0.68, 0.9];
    const barSlot = (right - left - 12) / 4;
    for (let i = 0; i < 4; i++) {
      const bx0 = left + 8 + i * barSlot;
      const bx1 = bx0 + barSlot * 0.66;
      const bTop = bottom - (bottom - top) * (heights[i] ?? 0.5);
      if (x >= bx0 && x <= bx1 && y >= bTop && y < bottom) {
        return [37, 99 + i * 22, 235, 255];
      }
    }
    return [252, 253, 255, 255];
  });

  // 5. Dark terminal window with neon green/cyan indented source code lines
  const terminalCode = renderPng(size, size, (x, y) => {
    const pad = Math.floor(size * 0.08);
    if (x < pad || x > size - pad || y < pad || y > size - pad) {
      return [30, 41, 59, 255];
    }
    const headerBottom = pad + Math.floor(size * 0.1);
    if (y <= headerBottom) {
      const cy = (pad + headerBottom) / 2;
      if (Math.hypot(x - (pad + 12), y - cy) < 4) return [239, 68, 68, 255];
      if (Math.hypot(x - (pad + 24), y - cy) < 4) return [245, 158, 11, 255];
      if (Math.hypot(x - (pad + 36), y - cy) < 4) return [34, 197, 94, 255];
      return [15, 23, 42, 255];
    }
    const relY = y - headerBottom - 10;
    if (relY >= 0) {
      const lineIdx = Math.floor(relY / 10);
      const inLineY = relY % 10;
      const indents = [0, 14, 28, 28, 14, 0, 14, 28, 14, 0];
      const lengths = [52, 76, 64, 84, 40, 22, 70, 88, 46, 30];
      if (lineIdx < indents.length && inLineY >= 2 && inLineY <= 5) {
        const startX = pad + 12 + (indents[lineIdx] ?? 0);
        const endX = startX + (lengths[lineIdx] ?? 40);
        if (x >= startX && x <= Math.min(endX, size - pad - 10)) {
          // Alternate token colors like syntax highlighting
          if ((x - startX) < 18) return [56, 189, 248, 255];
          if ((x - startX) % 29 < 4) return [11, 15, 25, 255]; // space between tokens
          return [74, 222, 128, 255];
        }
      }
    }
    return [11, 15, 25, 255];
  });

  const toScene = (
    id: string,
    title: string,
    groundTruthCaption: string,
    buf: Buffer,
  ): SyntheticScene => {
    const pngBase64 = buf.toString("base64");
    return {
      id,
      title,
      groundTruthCaption,
      category: "vision",
      pngBase64,
      dataUrl: `data:image/png;base64,${pngBase64}`,
    };
  };

  return [
    toScene(
      "img-stop-sign",
      "Scene A (Visual Only)",
      "Red octagonal traffic warning stop sign with white border on a pole",
      stopSign,
    ),
    toScene(
      "img-ocean-sunset",
      "Scene B (Visual Only)",
      "Bright orange sun setting over blue ocean water waves at sunset",
      oceanSunset,
    ),
    toScene(
      "img-pine-tree",
      "Scene C (Visual Only)",
      "Green evergreen pine tree standing in a grassy meadow under blue sky",
      pineTree,
    ),
    toScene(
      "img-bar-chart",
      "Scene D (Visual Only)",
      "Rising blue vertical bar chart graph showing upward growth on grid axes",
      barChart,
    ),
    toScene(
      "img-terminal-code",
      "Scene E (Visual Only)",
      "Dark computer terminal window with green and cyan syntax highlighted source code",
      terminalCode,
    ),
  ];
}

export interface VisualDocumentPage {
  id: string;
  title: string;
  groundTruthSummary: string;
  pngBase64: string;
  dataUrl: string;
}

const BITMAP_FONT_5X7: Record<string, readonly string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function renderDocumentScanPng(
  header: string,
  rows: string[],
  accent: RGBA,
  bars?: number[],
): Buffer {
  const W = 340;
  const H = 216;
  const paper: RGBA = [250, 250, 249, 255];
  const ink: RGBA = [28, 25, 23, 255];
  const rule: RGBA = [214, 211, 209, 255];
  const grid: RGBA[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => paper),
  );

  // Outer border & top banner
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 36) {
        grid[y]![x] = accent;
      } else if (x < 2 || x >= W - 2 || y >= H - 2) {
        grid[y]![x] = [168, 162, 158, 255];
      }
    }
  }

  const drawString = (text: string, x0: number, y0: number, scale: number, color: RGBA) => {
    let cx = x0;
    for (const ch of text.toUpperCase()) {
      const glyph = BITMAP_FONT_5X7[ch] ?? BITMAP_FONT_5X7[" "]!;
      for (let r = 0; r < 7; r++) {
        const rowBits = glyph[r] ?? "00000";
        for (let c = 0; c < 5; c++) {
          if (rowBits[c] === "1") {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const py = y0 + r * scale + sy;
                const px = cx + c * scale + sx;
                if (py >= 0 && py < H && px >= 0 && px < W) {
                  grid[py]![px] = color;
                }
              }
            }
          }
        }
      }
      cx += 6 * scale;
    }
  };

  drawString(header, 14, 11, 2, [255, 255, 255, 255]);

  rows.forEach((line, idx) => {
    const ry = 50 + idx * 32;
    drawString(line, 16, ry, 2, ink);
    for (let x = 14; x < (bars ? W - 96 : W - 14); x++) {
      if (ry + 21 < H) grid[ry + 21]![x] = rule;
    }
  });

  if (bars && bars.length > 0) {
    const baseBottom = H - 22;
    const maxH = 110;
    bars.forEach((v, i) => {
      const bx0 = W - 82 + i * 18;
      const bh = Math.round(maxH * v);
      for (let y = baseBottom - bh; y < baseBottom; y++) {
        for (let x = bx0; x < bx0 + 12; x++) {
          grid[y]![x] = accent;
        }
      }
    });
  }

  return renderPng(W, H, (x, y) => grid[y]?.[x] ?? paper);
}

/**
 * Generates scanned visual document PNGs (invoices, SLO tables, financial cards) with zero text metadata.
 * Tests EmbeddingGemma 2's OCR-free VisDoc capability directly from pixel bitmaps.
 */
export function buildVisualDocuments(): VisualDocumentPage[] {
  const invBuf = renderDocumentScanPng(
    "INVOICE #4082",
    [
      "VENDOR: NEBULA GPU",
      "ITEM: 4X H200 NODES",
      "TERM: NOV 2026",
      "TOTAL: $1420.00",
      "STATUS: PAID",
    ],
    [200, 16, 46, 255],
  );

  const sloBuf = renderDocumentScanPng(
    "SLO BREACH REPORT",
    [
      "SERVICE: REDIS CACHE",
      "P99 LATENCY: 840MS",
      "UPTIME: 99.12%",
      "REGION: US-EAST-1",
      "ACTION: FAILOVER",
    ],
    [28, 78, 148, 255],
  );

  const finBuf = renderDocumentScanPng(
    "Q3 BOARD SUMMARY",
    [
      "ARR: $4.8M +48%",
      "NET RETENTION: 128%",
      "GROSS MARGIN: 81%",
      "BURN MULTIPLE: 0.7X",
    ],
    [35, 106, 78, 255],
    [0.35, 0.52, 0.74, 0.95],
  );

  const toVisDoc = (
    id: string,
    title: string,
    groundTruthSummary: string,
    buf: Buffer,
  ): VisualDocumentPage => {
    const pngBase64 = buf.toString("base64");
    return {
      id,
      title,
      groundTruthSummary,
      pngBase64,
      dataUrl: `data:image/png;base64,${pngBase64}`,
    };
  };

  return [
    toVisDoc(
      "visdoc-invoice-4082",
      "Scanned Document A (Pixels Only)",
      "Nebula GPU Invoice #4082 for 4x H200 nodes totaling $1,420.00 marked PAID",
      invBuf,
    ),
    toVisDoc(
      "visdoc-slo-redis",
      "Scanned Document B (Pixels Only)",
      "Redis Cache SLO breach report showing 840ms P99 latency and 99.12% uptime in us-east-1",
      sloBuf,
    ),
    toVisDoc(
      "visdoc-q3-arr",
      "Scanned Document C (Pixels Only)",
      "Q3 Board Summary showing $4.8M ARR (+48%), 128% net retention, and 81% gross margin",
      finBuf,
    ),
  ];
}
