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

// Test J — Strict Preservation Policy & Dual Mode Image Preservation
console.log("\n--- Running Test J: Strict Preservation Policy & Dual Mode ---");
const dummyPayload = "FALLBACK-TEST-12345";
const decodedWithoutMatrix = {
  data: dummyPayload,
};

const preservedResult = createPreservedQr(decodedWithoutMatrix);
assert(preservedResult === null, "Test J — Strict preservation policy: returns null when structural preservation is impossible without image");

// Test J2: Dual Mode (Reconstructed Matrix + Downscaled Image simultaneously)
console.log("\n--- Running Test J2: Dual Mode (Reconstructed Matrix + Downscaled Image) ---");
const testImgData = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const qrSample = qrcodegen.QrCode.encodeText("DUAL-VIEW-TEST", qrcodegen.QrCode.Ecc.MEDIUM);
const sampleMatrix = QrPreserver.qrCodeToMatrix(qrSample);
const decodedDual = {
  data: "DUAL-VIEW-TEST",
  version: qrSample.version,
  errorCorrectionLevel: 'M',
  maskPattern: qrSample.mask,
  moduleMatrix: sampleMatrix,
  image: testImgData,
};

const preservedDual = createPreservedQr(decodedDual);
assert(preservedDual !== null, "Test J2 — Dual PreservedQr created");
assert(preservedDual.mode === "EXACT", `Test J2 — Mode is EXACT (got ${preservedDual.mode})`);
assert(preservedDual.moduleMatrix !== null, "Test J2 — Reconstructed module matrix is present");
assert(preservedDual.image === testImgData, "Test J2 — Downscaled image is bundled simultaneously");

// Serialization roundtrip for dual mode
const dualJson = preservedDual.toJSON();
assert(dualJson.image === testImgData, "Test J2 — toJSON() preserves image field");
assert(dualJson.compressedMatrix !== null, "Test J2 — toJSON() preserves compressedMatrix");

const restoredDual = QrPreserver.PreservedQr.fromJSON(dualJson);
assert(restoredDual.image === testImgData, "Test J2 — fromJSON() restores image field");
assert(restoredDual.moduleMatrix !== null, "Test J2 — fromJSON() restores moduleMatrix");
assert(restoredDual.matrixSize === qrSample.size, "Test J2 — fromJSON() matrixSize matches");

// Test J3: Downscaled image fallback when matrix cannot be extracted
console.log("\n--- Running Test J3: Downscaled image when matrix cannot be extracted ---");
const decodedImgOnly = {
  data: "IMAGE-ONLY-TEST",
  image: testImgData,
};
const preservedImgOnly = createPreservedQr(decodedImgOnly);
assert(preservedImgOnly !== null, "Test J3 — Image mode PreservedQr created");
assert(preservedImgOnly.mode === "IMAGE", "Test J3 — Mode is IMAGE");
assert(preservedImgOnly.image === testImgData, "Test J3 — Image is preserved");
assert(preservedImgOnly.moduleMatrix === null, "Test J3 — moduleMatrix is null");


// ============================================================
//  Test K — QR Version 5 Exhaustive: All EC Levels × All Masks
// ============================================================
console.log("\n==================================================");
console.log("  TEST K: QR Version 5 — All EC Levels × All Masks");
console.log("==================================================");

// v5 = 37×37 modules, 1369 total modules
// v5 alignment pattern centers: [6, 30]
// v5 multi-block EC configs:
//   L: 1 block, 108 data codewords
//   M: 2 blocks, 43 data codewords each
//   Q: 2+2 blocks (15+16 data codewords per block)
//   H: 2+2 blocks (11+12 data codewords per block)

const v5EcConfigs = [
  { name: "L", ecl: qrcodegen.QrCode.Ecc.LOW,      desc: "1 block, 108 dcw" },
  { name: "M", ecl: qrcodegen.QrCode.Ecc.MEDIUM,    desc: "2 blocks, 43 dcw each" },
  { name: "Q", ecl: qrcodegen.QrCode.Ecc.QUARTILE,  desc: "2+2 blocks, 15+16 dcw" },
  { name: "H", ecl: qrcodegen.QrCode.Ecc.HIGH,      desc: "2+2 blocks, 11+12 dcw" },
];

for (const ec of v5EcConfigs) {
  for (let mask = 0; mask < 8; mask++) {
    // Craft payload text that fits v5 for the given EC level
    const text = `V5-${ec.name}-M${mask}-TEST`;
    try {
      const p = runPreservationTest(
        `Test K — V5 EC:${ec.name} Mask:${mask} (${ec.desc})`,
        qrcodegen.QrSegment.makeSegments(text),
        ec.ecl,
        5, 5, mask
      );
      assert(p.version === 5, `Test K — V5 EC:${ec.name} Mask:${mask}: Version is 5`);
      assert(p.errorCorrection === ec.name, `Test K — V5 EC:${ec.name} Mask:${mask}: EC level matches`);
      assert(p.maskPattern === mask, `Test K — V5 EC:${ec.name} Mask:${mask}: Mask pattern matches`);
      assert(p.matrixSize === 37, `Test K — V5 EC:${ec.name} Mask:${mask}: Matrix size is 37×37`);
    } catch (e) {
      console.error(`Test K — V5 EC:${ec.name} Mask:${mask}: EXCEPTION: ${e.message}`);
    }
  }
}


// ============================================================
//  Test L — QR Version 6 Exhaustive: All EC Levels × All Masks
// ============================================================
console.log("\n==================================================");
console.log("  TEST L: QR Version 6 — All EC Levels × All Masks");
console.log("==================================================");

// v6 = 41×41 modules, 1681 total modules
// v6 alignment pattern centers: [6, 34]
// v6 multi-block EC configs:
//   L: 2 blocks, 68 data codewords each
//   M: 4 blocks, 27 data codewords each
//   Q: 4 blocks, 19 data codewords each
//   H: 4 blocks, 15 data codewords each

const v6EcConfigs = [
  { name: "L", ecl: qrcodegen.QrCode.Ecc.LOW,      desc: "2 blocks, 68 dcw each" },
  { name: "M", ecl: qrcodegen.QrCode.Ecc.MEDIUM,    desc: "4 blocks, 27 dcw each" },
  { name: "Q", ecl: qrcodegen.QrCode.Ecc.QUARTILE,  desc: "4 blocks, 19 dcw each" },
  { name: "H", ecl: qrcodegen.QrCode.Ecc.HIGH,      desc: "4 blocks, 15 dcw each" },
];

for (const ec of v6EcConfigs) {
  for (let mask = 0; mask < 8; mask++) {
    // Craft payload text that fits v6 for the given EC level
    const text = `V6-${ec.name}-MASK${mask}-ROBUST-TEST`;
    try {
      const p = runPreservationTest(
        `Test L — V6 EC:${ec.name} Mask:${mask} (${ec.desc})`,
        qrcodegen.QrSegment.makeSegments(text),
        ec.ecl,
        6, 6, mask
      );
      assert(p.version === 6, `Test L — V6 EC:${ec.name} Mask:${mask}: Version is 6`);
      assert(p.errorCorrection === ec.name, `Test L — V6 EC:${ec.name} Mask:${mask}: EC level matches`);
      assert(p.maskPattern === mask, `Test L — V6 EC:${ec.name} Mask:${mask}: Mask pattern matches`);
      assert(p.matrixSize === 41, `Test L — V6 EC:${ec.name} Mask:${mask}: Matrix size is 41×41`);
    } catch (e) {
      console.error(`Test L — V6 EC:${ec.name} Mask:${mask}: EXCEPTION: ${e.message}`);
    }
  }
}


// ============================================================
//  Test M — Multi-Block EC Stress Tests (v5-Q, v5-H, v6-M/Q/H)
// ============================================================
console.log("\n==================================================");
console.log("  TEST M: Multi-Block EC Stress Tests");
console.log("==================================================");

// Test M1: v5-Q with maximum-capacity byte payload (pushes RS to limit)
console.log("\n--- Test M1: V5-Q Max Byte Payload ---");
{
  // v5-Q: 2+2 blocks, 15+16 = 62 data bytes total
  const maxBytes = Array.from(new TextEncoder().encode("STRESS-V5Q-".repeat(5) + "END"));
  const p = runPreservationTest(
    "Test M1 — V5-Q Max Byte Payload (multi-block stress)",
    [qrcodegen.QrSegment.makeBytes(maxBytes)],
    qrcodegen.QrCode.Ecc.QUARTILE,
    5, 5, 4
  );
  assert(p.version === 5, "Test M1: Version is 5");
  assert(p.errorCorrection === "Q", "Test M1: EC is Q");
}

// Test M2: v5-H with mixed segments (numeric + byte)
console.log("\n--- Test M2: V5-H Mixed Segments ---");
{
  const mixedSegs = [
    qrcodegen.QrSegment.makeNumeric("1234567890"),
    qrcodegen.QrSegment.makeBytes(Array.from(new TextEncoder().encode("v5h-data"))),
  ];
  const p = runPreservationTest(
    "Test M2 — V5-H Mixed Segments (2+2 block stress)",
    mixedSegs,
    qrcodegen.QrCode.Ecc.HIGH,
    5, 5, 1
  );
  assert(p.version === 5, "Test M2: Version is 5");
  assert(p.errorCorrection === "H", "Test M2: EC is H");
}

// Test M3: v6-M with alphanumeric payload (4-block config)
console.log("\n--- Test M3: V6-M Alphanumeric ---");
{
  const p = runPreservationTest(
    "Test M3 — V6-M Alphanumeric (4-block stress)",
    [qrcodegen.QrSegment.makeAlphanumeric("V6-MEDIUM-FOUR-BLOCKS-ROBUSTNESS-CHECK-12345")],
    qrcodegen.QrCode.Ecc.MEDIUM,
    6, 6, 3
  );
  assert(p.version === 6, "Test M3: Version is 6");
  assert(p.errorCorrection === "M", "Test M3: EC is M");
}

// Test M4: v6-H with binary payload (4 blocks, highest redundancy)
console.log("\n--- Test M4: V6-H Binary Payload ---");
{
  // v6-H: 4 blocks, 15 data codewords each = 60 total
  const binPayload = [];
  for (let i = 0; i < 40; i++) binPayload.push(i ^ 0xAA);
  const p = runPreservationTest(
    "Test M4 — V6-H Binary Payload (4-block max redundancy)",
    [qrcodegen.QrSegment.makeBytes(binPayload)],
    qrcodegen.QrCode.Ecc.HIGH,
    6, 6, 7
  );
  assert(p.version === 6, "Test M4: Version is 6");
  assert(p.errorCorrection === "H", "Test M4: EC is H");
}

// Test M5: v5/v6 Unicode boundary — payload forces exact version boundary
console.log("\n--- Test M5: V5/V6 Unicode Boundary ---");
{
  const unicodePayload = Array.from(new TextEncoder().encode("🔒安全テスト-V5"));
  const p = runPreservationTest(
    "Test M5 — V5-L Unicode Boundary",
    [qrcodegen.QrSegment.makeBytes(unicodePayload)],
    qrcodegen.QrCode.Ecc.LOW,
    5, 5, 2
  );
  assert(p.version === 5, "Test M5: Version is 5");
}

// Test M6: v6-Q with ECI + multi-segment
console.log("\n--- Test M6: V6-Q ECI + Multi-Segment ---");
{
  const eciSeg = qrcodegen.QrSegment.makeEci(26);
  const dataSeg = qrcodegen.QrSegment.makeBytes(Array.from(new TextEncoder().encode("V6-Q-ECI-Test")));
  const p = runPreservationTest(
    "Test M6 — V6-Q ECI + Multi-Segment (4-block stress)",
    [eciSeg, dataSeg],
    qrcodegen.QrCode.Ecc.QUARTILE,
    6, 6, 5
  );
  assert(p.version === 6, "Test M6: Version is 6");
  assert(p.errorCorrection === "Q", "Test M6: EC is Q");
  assert(p.eci === 26, "Test M6: ECI assignment is 26");
}


console.log("\n==================================================");
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions.`);
console.log("==================================================");

if (failedTests > 0) {
  Deno.exit(1);
}

