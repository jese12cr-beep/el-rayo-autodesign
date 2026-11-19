/* El Rayo — Web Worker MobileSAM (@huggingface/transformers@3.1.2) */
import {
  SamModel,
  AutoProcessor,
  RawImage,
  Tensor,
  env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "Xenova/slimsam-77-uniform";
const FALLBACK_MODEL_ID = "Xenova/sam-vit-base";

let model = null;
let processor = null;
let cachedImageInputs = null;
let cachedEmbeddings = null;
let activeDevice = "wasm";
let initPromise = null;

async function detectComputeDevice() {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter && (adapter.limits?.maxStorageBufferBindingSize || 0) >= 900 * 1024 * 1024) {
        return "webgpu";
      }
    } catch {
      // Fallback a WASM si WebGPU falla o está bloqueado
    }
  }
  return "wasm";
}

function disposeEmbeddings() {
  if (!cachedEmbeddings) return;
  for (const key of Object.keys(cachedEmbeddings)) {
    try {
      cachedEmbeddings[key]?.dispose?.();
    } catch {
      // Ignorar si ya fue liberado
    }
  }
  cachedEmbeddings = null;
}

async function initModel() {
  if (model && processor) {
    self.postMessage({ type: "ready", device: activeDevice });
    return;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    activeDevice = await detectComputeDevice();
    self.postMessage({
      type: "status",
      stage: "loading",
      device: activeDevice,
      progress: 12,
      message: `Cargando MobileSAM (${activeDevice.toUpperCase()})…`
    });

    const progressCallback = info => {
      if (info && typeof info.progress === "number") {
        self.postMessage({
          type: "status",
          stage: "downloading",
          device: activeDevice,
          progress: Math.max(5, Math.min(95, Math.round(info.progress))),
          message: `Descargando ${info.file || "MobileSAM"} (${Math.round(info.progress)}%)…`
        });
      }
    };

    try {
      processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
      model = await SamModel.from_pretrained(MODEL_ID, {
        device: activeDevice,
        dtype: activeDevice === "webgpu" ? "fp32" : "q8",
        progress_callback: progressCallback
      });
    } catch {
      activeDevice = "wasm";
      self.postMessage({
        type: "status",
        stage: "fallback",
        device: "wasm",
        progress: 25,
        message: "Cambiando a motor WASM compatible…"
      });
      try {
        processor = processor || (await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: progressCallback }));
        model = await SamModel.from_pretrained(MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback: progressCallback
        });
      } catch {
        processor = await AutoProcessor.from_pretrained(FALLBACK_MODEL_ID, { progress_callback: progressCallback });
        model = await SamModel.from_pretrained(FALLBACK_MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback: progressCallback
        });
      }
    }

    self.postMessage({ type: "ready", device: activeDevice });
  })().catch(err => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

async function encodeImage({ rgbaBuffer, width, height }) {
  await initModel();
  disposeEmbeddings();

  const rgba = new Uint8ClampedArray(rgbaBuffer);
  const rawImg = new RawImage(rgba, width, height, 4);
  cachedImageInputs = await processor(rawImg);
  cachedEmbeddings = await model.get_image_embeddings(cachedImageInputs);
  self.postMessage({ type: "encoded", width, height });
}

async function segmentPoints({ points, labels, requestId, preferFullObject = true, mode = "replace" }) {
  if (!model || !processor || !cachedEmbeddings || !cachedImageInputs) {
    throw new Error("La imagen aún no ha sido codificada por MobileSAM.");
  }

  const origH = cachedImageInputs.original_sizes[0][0];
  const origW = cachedImageInputs.original_sizes[0][1];
  const rH = cachedImageInputs.reshaped_input_sizes[0][0];
  const rW = cachedImageInputs.reshaped_input_sizes[0][1];

  const flatPoints = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    flatPoints[i * 2] = (points[i][0] / origW) * rW;
    flatPoints[i * 2 + 1] = (points[i][1] / origH) * rH;
  }

  const inputPoints = new Tensor("float32", flatPoints, [1, 1, points.length, 2]);
  const inputLabels = new Tensor(
    "int64",
    BigInt64Array.from(labels.map(v => BigInt(v))),
    [1, 1, labels.length]
  );

  const outputs = await model({
    ...cachedEmbeddings,
    input_points: inputPoints,
    input_labels: inputLabels
  });

  const masks = await processor.post_process_masks(
    outputs.pred_masks,
    cachedImageInputs.original_sizes,
    cachedImageInputs.reshaped_input_sizes
  );

  const maskTensor = masks[0];
  const dims = maskTensor.dims;
  const numMasks = dims.length === 4 ? dims[1] : dims[0];
  const planeSize = origW * origH;
  const rawMaskData = maskTensor.data;
  const iouData = outputs.iou_scores?.data || [];

  let topIou = -1;
  for (let m = 0; m < numMasks; m++) {
    const score = iouData[m] ?? 0.5;
    if (score > topIou) topIou = score;
  }

  let bestIdx = 0;
  let bestScore = -1;
  for (let m = 0; m < numMasks; m++) {
    const off = m * planeSize;
    let hits = 0;
    const step = 16;
    for (let i = 0; i < planeSize; i += step) {
      const val = rawMaskData[off + i];
      if (val === true || val > 0) hits++;
    }
    const covRatio = hits / (planeSize / step);
    const iou = iouData[m] ?? 0.5;

    let rank = iou;
    if (preferFullObject && iou >= topIou - 0.14 && covRatio >= 0.04 && covRatio <= 0.78) {
      // Prefiere la silueta completa de carrocería frente a micro-subpiezas (ej. faro o emblema)
      rank = iou + Math.min(0.45, covRatio * 1.1);
    }
    if (rank > bestScore) {
      bestScore = rank;
      bestIdx = m;
    }
  }

  const safeBest = Math.min(bestIdx, Math.max(0, numMasks - 1));
  const offset = safeBest * planeSize;

  const alphaMask = new Uint8Array(planeSize);
  for (let i = 0; i < planeSize; i++) {
    const val = rawMaskData[offset + i];
    alphaMask[i] = val === true || val > 0 ? 255 : 0;
  }

  try {
    inputPoints.dispose?.();
    inputLabels.dispose?.();
    outputs.pred_masks?.dispose?.();
    outputs.iou_scores?.dispose?.();
  } catch {
    // Limpieza best-effort
  }

  self.postMessage(
    {
      type: "mask",
      requestId,
      mode,
      maskBuffer: alphaMask.buffer,
      width: origW,
      height: origH,
      iou: Number((iouData[safeBest] ?? 0.85))
    },
    [alphaMask.buffer]
  );
}

self.onmessage = async event => {
  const { type, payload } = event.data || {};
  try {
    if (type === "init") {
      await initModel();
    } else if (type === "encode") {
      await encodeImage(payload);
    } else if (type === "segment") {
      await segmentPoints(payload);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err?.message || String(err)
    });
  }
};
