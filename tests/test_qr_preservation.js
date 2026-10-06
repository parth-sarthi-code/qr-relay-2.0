/**
 * Comprehensive Test Suite for Exact QR Preservation & Regeneration
 * Validates Tests A through I and Module Matrix Equality:
 * originalMatrix == regeneratedMatrix
 */

import "../static/js/qrcodegen.js";
import "../static/js/jsqr-enhanced.js";
import "../static/js/qr-preserver.js";

const { QrPreserver, qrcodegen, jsQR } = globalThis;
const { createPreservedQr, verifyMatrices, compressMatrix, decompressMatrix, ExactQrRenderer } = QrPreserver;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

/**
 * Helper to render QrCode to pixel buffer for jsQR decoding
 */
function renderQrToPixels(qr, quiet = 4, scale = 4) {
  const totalSize = (qr.size + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(totalSize * totalSize * 4);
  rgba.fill(255); // White background

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = (x + quiet) * scale + sx;
            const py = (y + quiet) * scale + sy;
            const idx = (py * totalSize + px) * 4;
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
          }
        }
      }
    }
  }
  return { rgba, totalSize };
}

/**
 * End-to-end test execution:
 * 1. Generate original QR with explicit parameters
 * 2. Decode using enhanced jsQR
 * 3. Construct PreservedQr
 * 4. Verify originalMatrix == preserved.moduleMatrix
 * 5. Verify compression roundtrip
 */
function runPreservationTest(testName, segs, ecl, minVer, maxVer, mask) {
  console.log(`\n--- Running ${testName} ---`);
  const originalQr = qrcodegen.QrCode.encodeSegments(segs, ecl, minVer, maxVer, mask, false);
  const originalMatrix = [];
  for (let y = 0; y < originalQr.size; y++) {
    const row = [];
    for (let x = 0; x < originalQr.size; x++) {
      row.push(originalQr.getModule(x, y));
    }
    originalMatrix.push(row);
  }

  const { rgba, totalSize } = renderQrToPixels(originalQr);
  const decoded = jsQR(rgba, totalSize, totalSize);
  assert(decoded !== null, `${testName}: Decoder detected QR`);

  const preserved = createPreservedQr(decoded);
  assert(preserved !== null, `${testName}: PreservedQr created`);
  assert(preserved.mode === "EXACT", `${testName}: Mode is EXACT`);
  assert(preserved.version === originalQr.version, `${testName}: Version matched (${originalQr.version})`);
  assert(preserved.maskPattern === originalQr.mask, `${testName}: Mask matched (${originalQr.mask})`);

  // Critical Acceptance Criterion: Module Matrix Comparison
  const matrixVerification = verifyMatrices(originalMatrix, preserved.moduleMatrix);
  assert(
    matrixVerification.equal === true && matrixVerification.mismatches === 0,
    `${testName}: Module matrix is 100% identical! (${matrixVerification.totalModules} modules checked, 0 mismatches)`
  );

  // Verification of compression/decompression
  const packed = compressMatrix(preserved.moduleMatrix);
  const unpacked = decompressMatrix(packed, preserved.matrixSize);
  const packedVerification = verifyMatrices(preserved.moduleMatrix, unpacked);
  assert(packedVerification.equal === true, `${testName}: Compressed bitstring roundtrip matches 100%`);

  // SVG Renderer verification
  const svg = ExactQrRenderer.renderToSvg(preserved.moduleMatrix);
  assert(svg.includes("<svg") && svg.includes("shape-rendering=\"crispEdges\""), `${testName}: SVG renderer produced valid crisp SVG`);

  return preserved;
}

console.log("==================================================");
console.log("   EXACT QR PRESERVATION TEST SUITE (TESTS A-I)   ");
console.log("==================================================");

// Test A — Simple text: HELLO WORLD
runPreservationTest(
  "Test A — Simple text (HELLO WORLD)",
  qrcodegen.QrSegment.makeSegments("HELLO WORLD"),
  qrcodegen.QrCode.Ecc.MEDIUM,
  1, 40, 2
);

// Test B — URL: https://example.com
runPreservationTest(
  "Test B — URL (https://example.com)",
  qrcodegen.QrSegment.makeSegments("https://example.com/checkout?order=98765"),
  qrcodegen.QrCode.Ecc.HIGH,
  3, 40, 5
);

// Test C — Numeric: 12345678901234567890
runPreservationTest(
  "Test C — Numeric (12345678901234567890)",
  [qrcodegen.QrSegment.makeNumeric("123456789012345678901234567890")],
  qrcodegen.QrCode.Ecc.LOW,
  1, 40, 7
);

// Test D — Unicode: Hindi, Japanese, Emoji
const unicodeBytes = Array.from(new TextEncoder().encode("नमस्ते दुनिया! こんにちは世界 🚀✨"));
runPreservationTest(
  "Test D — Unicode (Hindi, Japanese, Emoji)",
  [qrcodegen.QrSegment.makeBytes(unicodeBytes)],
  qrcodegen.QrCode.Ecc.QUARTILE,
  4, 40, 3
);

// Test E — Long payload (Forces higher QR version, e.g. V10+)
const longPayload = "PRESERVE-EXACT-QR-".repeat(25); // ~450 chars
runPreservationTest(
  "Test E — Long payload (forces higher QR version)",
  qrcodegen.QrSegment.makeSegments(longPayload),
  qrcodegen.QrCode.Ecc.MEDIUM,
  10, 40, 1
);

// Test F — Different EC levels (L, M, Q, H)
console.log("\n--- Running Test F: Different EC levels (L, M, Q, H) ---");
const ecTestConfigs = [
  { name: "Level L", ecl: qrcodegen.QrCode.Ecc.LOW, expected: "L" },
  { name: "Level M", ecl: qrcodegen.QrCode.Ecc.MEDIUM, expected: "M" },
  { name: "Level Q", ecl: qrcodegen.QrCode.Ecc.QUARTILE, expected: "Q" },
  { name: "Level H", ecl: qrcodegen.QrCode.Ecc.HIGH, expected: "H" },
];

for (const ec of ecTestConfigs) {
  const p = runPreservationTest(
    `Test F — EC ${ec.name}`,
    qrcodegen.QrSegment.makeSegments(`EC_TEST_${ec.expected}`),
    ec.ecl,
    2, 2, 4
  );
  assert(p.errorCorrection === ec.expected, `Test F — Preserved EC level matches ${ec.expected}`);
}

// Test G — Different masks (0 to 7)
console.log("\n--- Running Test G: Different masks (0 through 7) ---");
for (let mask = 0; mask < 8; mask++) {
  const p = runPreservationTest(
    `Test G — Mask ${mask}`,
    qrcodegen.QrSegment.makeSegments(`MASK_PATTERN_${mask}`),
    qrcodegen.QrCode.Ecc.QUARTILE,
    2, 2, mask
  );
  assert(p.maskPattern === mask, `Test G — Preserved Mask pattern matches ${mask}`);
}

// Test H — Multiple encoding segments
console.log("\n--- Running Test H: Multiple encoding segments ---");
const multiSegs = [
  qrcodegen.QrSegment.makeNumeric("9876543210"),
  qrcodegen.QrSegment.makeAlphanumeric("ALPHA-PART-123"),
  qrcodegen.QrSegment.makeBytes(Array.from(new TextEncoder().encode("/custom-byte-payload/"))),
];
runPreservationTest(
  "Test H — Multi-segments (Numeric + Alphanumeric + Byte)",
  multiSegs,
  qrcodegen.QrCode.Ecc.HIGH,
  4, 40, 6
);

// Test I — ECI
console.log("\n--- Running Test I: ECI metadata ---");
const eciSegment = qrcodegen.QrSegment.makeEci(26); // UTF-8 ECI
const dataSegment = qrcodegen.QrSegment.makeBytes(Array.from(new TextEncoder().encode("ECI Encoded Content")));
const pEci = runPreservationTest(
  "Test I — ECI (Assignment 26: UTF-8)",
  [eciSegment, dataSegment],
  qrcodegen.QrCode.Ecc.MEDIUM,
  2, 40, 0
);
assert(pEci.eci === 26, "Test I — Preserved ECI assignment matches 26");

// Test J — Strict Preservation Policy: No Fallback Mode
console.log("\n--- Running Test J: Strict Preservation Policy (No Fallback Mode) ---");
const dummyPayload = "FALLBACK-TEST-12345";
const decodedWithoutMatrix = {
  data: dummyPayload,
};

const preservedResult = createPreservedQr(decodedWithoutMatrix);
assert(preservedResult === null, "Test J — Strict preservation policy: returns null when structural preservation is impossible (no fallback mode)");


console.log("\n==================================================");
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions.`);
console.log("==================================================");

if (failedTests > 0) {
  Deno.exit(1);
}

