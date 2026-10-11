const RUBBERBAND_WASM_URL = '/rubberband.wasm';

let wasmBytes: Promise<ArrayBuffer> | null = null;

/** Load Rubber Band WASM on the main thread (AudioWorklet has no fetch). */
export function loadRubberbandWasmBytes(): Promise<ArrayBuffer> {
  if (!wasmBytes) {
    wasmBytes = fetch(RUBBERBAND_WASM_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${RUBBERBAND_WASM_URL} (${response.status})`);
      }
      return response.arrayBuffer();
    });
  }
  return wasmBytes;
}
