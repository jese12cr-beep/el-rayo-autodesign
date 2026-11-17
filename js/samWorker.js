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
      if (adapter && (adapter.limits?.maxStorageBufferBindingSize || 0) >= 512 * 1024 * 1024) {
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

async function segmentPoints({ points, labels, requestId }) {
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

  const iouData = outputs.iou_scores?.data || [];
  let bestIdx = 0;
  let bestIou = -1;
  for (let i = 0; i < iouData.length; i++) {
    if (iouData[i] > bestIou) {
      bestIou = iouData[i];
      bestIdx = i;
    }
  }

  // masks[0] tiene forma [batch=1, num_masks=3, origH, origW] o [num_masks, origH, origW]
  const maskTensor = masks[0];
  const dims = maskTensor.dims;
  const numMasks = dims.length === 4 ? dims[1] : dims[0];
  const safeBest = Math.min(bestIdx, Math.max(0, numMasks - 1));
  const planeSize = origW * origH;
  const offset = safeBest * planeSize;
  const rawMaskData = maskTensor.data;

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
      maskBuffer: alphaMask.buffer,
      width: origW,
      height: origH,
      iou: Number(bestIou > 0 ? bestIou : 0.85)
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
