# On-device OCR for Indonesian receipts

Researched 2026-10-14. **No source compares engines on Indonesian receipts**, and none documents line-item extraction. The recommendation below is a shortlist plus a benchmark plan, not a verdict.

## Candidates

| Engine | Runs on | Evidence | Gaps |
| --- | --- | --- | --- |
| **Tesseract.js** (WASM port of Tesseract) | Browser/PWA, Node, so desktop wrapper too | Apache-2.0; language chosen in `createWorker`; language files cached after first use; one worker can process many images; no PDF support | Indonesian (`ind`) data availability and size not confirmed from the page; a general receipt study (not Indonesian) reports Tesseract degrading to ~15% character error on faded receipts and ~18% on mobile photos |
| **PaddleOCR.js** (`@paddleocr/paddleocr-js`, PP-OCRv5 on ONNX Runtime Web) | Browser/PWA, desktop wrapper | Returns per-line polygon, text, score and timings; worker mode; WASM or WebGPU backend; custom models loadable from a URL as `.tar` with `inference.onnx` | Latin/Indonesian model coverage unconfirmed (docs only show `lang: "ch"`); model sizes, license, offline caching not stated; COOP/COEP headers required for threaded WASM or WebGPU; version maturity unclear |
| **Google ML Kit Text Recognition v2** | Android and iOS only | Latin script supported; returns blocks, lines, elements with boxes and confidence | Indonesian not named; no web support; relevant only to the later native app |
| Apple Vision | iOS/macOS | not researched | unverified |

General receipt evidence (not Indonesian): a 1,000-image study ranks PaddleOCR best (character error 3.21%) and Tesseract worst on degraded photos. A 2025 Indonesian study using ML Kit with a detector reports 85.7% F1 for the whole system, so OCR alone is not isolated. A 2026 vendor benchmark notes Indonesian receipts fall outside both PaddleOCR's and EasyOCR's training data. Treat all as indicative only.

## Line items

Every engine returns lines or words with bounding boxes, not receipt structure. Turning that into items (name, quantity, price, subtotal, PPN, service, total) means our own post-processing: group boxes into rows, detect price columns, parse `Rp` and dot-thousands, find labelled totals. The one local Indonesian receipt project found only extracts store, date, and total with rules, and had not been tested on real receipts. An on-device LLM could structure the text, but nothing here confirms it is feasible in a PWA.

## What this means for the spec

- **OCR is best-effort; the review/edit step is mandatory**, as already decided. The feature must be fully usable with manual entry.
- **Likely shape**: one OCR engine interface, with browser/desktop implementations first and ML Kit (or equivalent) added when native mobile exists.
- **Hosting constraint**: threaded WASM or WebGPU needs COOP/COEP headers, which affect the PWA, any embedded third-party content, and the Cloudflare setup. Plain single-thread WASM avoids it at a speed cost.
- **Download size and caching**: OCR models are fetched once and cached; the PWA must handle that offline-first and show progress.
- **Unknowns that decide the choice** need a real test: Indonesian accuracy, model size, speed on a mid-range phone, line-item recoverability.

## Unverified

- PP-OCRv5 Latin/Indonesian model availability and sizes; PaddleOCR.js license.
- Tesseract.js `ind` model size and accuracy on struk.
- ML Kit and Apple Vision Indonesian support.
- Whether an on-device LLM for structuring is practical in a browser.

## Sources

- Tesseract.js: https://github.com/naptha/tesseract.js
- ML Kit Text Recognition v2: https://developers.google.com/ml-kit/vision/text-recognition/v2
- PaddleOCR.js README: https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.3.2/README.md
- PaddleOCR browser deployment: https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html
- Local Indonesian receipt OCR project (untested on real receipts): https://dev.to/bangkah/building-a-local-first-receipt-ocr-app-and-being-honest-about-what-i-tested-3oai
- Open-source OCR receipt comparison (ResearchGate): https://www.researchgate.net/publication/399040735_Comparative_Analysis_of_Open-Source_OCR_Frameworks_for_Receipt_Data_Extraction_and_Post-Processing

## Benchmark result (2026-10-16)

Run on 14 real restaurant receipts (private, not in the repo), scored against hand-made ground truth.

- PaddleOCR.js 0.3.2 (PP-OCRv5 mobile): printed total, subtotal, service and tax found 100%; line items (name and price) recovered 98%.
- Tesseract.js 5.1.1 (`ind`): total 71%, lines 47%; fails on tilted or dark-table photos.
- Both Apache-2.0. PaddleOCR needs about 21.5 MB of models plus a 25 MB ONNX wasm runtime, and works single-thread without COOP/COEP.
- PaddleOCR returns separate boxes, so row grouping, unit-price and discount line handling, thousands-separator detection and Indonesian keyword matching are our own work. Checking that item prices sum to the printed subtotal caught every parser failure; use it on the review screen.
- Speed: 2.6-3.2 s per image on a Mac. On an iPhone (Firefox for iOS, single-thread jsep build) 3.6 min per image, cause unexplained. Safari, the installed PWA, the plain WASM build with threads, and Tesseract.js on a phone are untested.
- Not covered: minimarket, warung, faded thermal and flat camera photos.
