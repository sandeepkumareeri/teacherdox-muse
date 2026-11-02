/**
 * boardcrop.js — SAM 3.1 board detection & crop for TeacherDox hackathon
 *
 * Finds and crops the chalkboard/whiteboard in a classroom photo before it is read.
 * This is a visible second Meta model doing real work.
 *
 * Uses Meta's SAM 3.1 (Segment Anything Model) via the Meta Model API.
 * Falls back to a simple heuristic if SAM is unavailable.
 */

const https = require('https');
const { generate: museGenerate } = require('./muse.js');
const sharp = require('sharp');

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const SAM_MODEL = process.env.META_MODEL_SAM || 'sam-3.1';
const META_API_KEY = process.env.META_API_KEY;

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ──────────────────────────────────────────────────────────────────────────────

function metaRequest(path, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!META_API_KEY) {
      reject(new Error('META_API_KEY not set'));
      return;
    }
    const data = JSON.stringify(body);
    const url = `https://api.meta.ai/v1${path}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Meta API invalid JSON: ${raw.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`Meta API ${res.statusCode}: ${raw.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.write(data);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// SAM 3.1 board detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detect board in image using SAM 3.1.
 * @param {string} base64Image - Base64 encoded image (JPEG/PNG)
 * @param {string} mimeType - 'image/jpeg' or 'image/png'
 * @returns {Promise<{x, y, width, height, confidence}>} - Board bounding box
 */
async function detectBoard(base64Image, mimeType) {
  if (!META_API_KEY) {
    return fallbackDetectBoard(base64Image);
  }

  try {
    const body = {
      model: SAM_MODEL,
      image: { data: base64Image, format: mimeType.replace('image/', '') },
      task: 'segment',
      // Prompt SAM to find the board: large rectangular surface, high contrast edges
      prompts: {
        boxes: [], // Let SAM find automatically
        text: 'chalkboard, whiteboard, blackboard, green board, teaching board',
      },
    };

    const resp = await metaRequest('/segmentation', body);

    // Parse SAM response: { masks: [{ bbox: [x, y, w, h], score, ... }], ... }
    const masks = resp.masks || [];
    if (!masks.length) {
      console.warn('[boardcrop] SAM returned no masks, using fallback');
      return fallbackDetectBoard(base64Image);
    }

    // Pick the mask with highest score that looks like a board (rectangular, large)
    let bestMask = null;
    let bestScore = 0;

    for (const mask of masks) {
      const [x, y, w, h] = mask.bbox || [0, 0, 0, 0];
      const area = w * h;
      const aspectRatio = w / h;
      const score = mask.score || 0;

      // Board-like: large area, aspect ratio between 0.5 and 3 (roughly rectangular)
      if (area > 0 && aspectRatio >= 0.5 && aspectRatio <= 3 && score > bestScore) {
        bestScore = score;
        bestMask = { x, y, width: w, height: h, confidence: score };
      }
    }

    if (bestMask) {
      return bestMask;
    }

    console.warn('[boardcrop] No board-like mask found, using fallback');
    return fallbackDetectBoard(base64Image);

  } catch (err) {
    console.error(`[boardcrop] SAM detection failed: ${err.message}, using fallback`);
    return fallbackDetectBoard(base64Image);
  }
}

/**
 * Fallback board detection using simple heuristics.
 * Returns center crop as reasonable default for board location.
 * In production, you'd use OpenCV or similar for actual detection.
 */
async function fallbackDetectBoard(base64Image) {
  console.warn('[boardcrop] Using fallback board detection (center crop)');

  // Try to get actual image dimensions for better fallback
  let imgWidth = 1920, imgHeight = 1080; // defaults
  try {
    const inputBuffer = Buffer.from(base64Image, 'base64');
    const metadata = await sharp(inputBuffer).metadata();
    if (metadata.width && metadata.height) {
      imgWidth = metadata.width;
      imgHeight = metadata.height;
    }
  } catch {
    // Use defaults if metadata fails
  }

  // Return center 70% of image as a reasonable guess for board location
  return {
    x: 0.15,
    y: 0.15,
    width: 0.7,
    height: 0.7,
    confidence: 0.3,
    fallback: true,
    imageDimensions: { width: imgWidth, height: imgHeight },
  };
}

/**
 * Crop image to board region using sharp.
 * @param {string} base64Image - Base64 encoded image
 * @param {string} mimeType - Image MIME type
 * @param {Object} bbox - { x, y, width, height } in normalized coordinates (0-1)
 * @returns {Promise<{base64, mimeType}>} - Cropped image
 */
async function cropToBoard(base64Image, mimeType, bbox) {
  if (!bbox) {
    return {
      base64: base64Image,
      mimeType,
      cropped: false,
      bbox: null,
      note: 'No bounding box provided',
    };
  }

  try {
    // Decode base64 to buffer
    const inputBuffer = Buffer.from(base64Image, 'base64');

    // Get image metadata to calculate pixel coordinates
    const metadata = await sharp(inputBuffer).metadata();
    const { width: imgWidth, height: imgHeight } = metadata;

    if (!imgWidth || !imgHeight) {
      throw new Error('Could not determine image dimensions');
    }

    // Convert normalized coordinates (0-1) to pixel coordinates
    const left = Math.round(bbox.x * imgWidth);
    const top = Math.round(bbox.y * imgHeight);
    const width = Math.round(bbox.width * imgWidth);
    const height = Math.round(bbox.height * imgHeight);

    // Ensure crop region is within image bounds
    const cropLeft = Math.max(0, Math.min(left, imgWidth - 1));
    const cropTop = Math.max(0, Math.min(top, imgHeight - 1));
    const cropWidth = Math.max(1, Math.min(width, imgWidth - cropLeft));
    const cropHeight = Math.max(1, Math.min(height, imgHeight - cropTop));

    // Crop the image
    const croppedBuffer = await sharp(inputBuffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .toBuffer();

    // Encode back to base64
    const croppedBase64 = croppedBuffer.toString('base64');

    return {
      base64: croppedBase64,
      mimeType,
      cropped: true,
      bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
      cropPixels: { left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight },
      originalDimensions: { width: imgWidth, height: imgHeight },
    };
  } catch (err) {
    console.error(`[boardcrop] Crop failed: ${err.message}, returning original`);
    return {
      base64: base64Image,
      mimeType,
      cropped: false,
      bbox,
      error: err.message,
    };
  }
}

/**
 * Full pipeline: detect board → crop → return cropped image.
 * @param {string} base64Image - Base64 encoded image
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<{base64, mimeType, bbox, confidence}>}
 */
async function detectAndCrop(base64Image, mimeType) {
  const bbox = await detectBoard(base64Image, mimeType);
  const cropped = await cropToBoard(base64Image, mimeType, bbox);
  return {
    ...cropped,
    bbox,
    confidence: bbox.confidence,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  detectBoard,
  cropToBoard,
  detectAndCrop,
  fallbackDetectBoard,
};