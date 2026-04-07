# Config Module (`@jupitermetalabs/face-zk-sdk/config`)

This module defines the default settings, limits, and environmental configurations for the Face+ZK SDK.

## Overriding Defaults

When calling `initializeSdk(configOverrides)`, any values you provide will recursively merge with the defaults.

---

### Model Sources

Pass each model as a `ModelSource` — either a local bundled module or a remote URL:

```typescript
import { initializeSdk } from '@jupitermetalabs/face-zk-sdk/react-native';

// Bundled (recommended — no network dependency at runtime)
await initializeSdk({
  models: {
    detection:   { module: require('./assets/models/det_500m.onnx') },
    recognition: { module: require('./assets/models/w600k_mbf.onnx') },
    antispoof:   { module: require('./assets/models/antispoof.onnx') },
    ageGender:   { module: require('./assets/models/genderage.onnx') }, // optional
  },
});

// CDN / remote URL (models downloaded and cached on first use)
await initializeSdk({
  models: {
    detection:   { url: 'https://your-cdn.com/face-zk/det_500m.onnx' },
    recognition: { url: 'https://your-cdn.com/face-zk/w600k_mbf.onnx' },
    antispoof:   { url: 'https://your-cdn.com/face-zk/antispoof.onnx' },
  },
});
```

> **Production note:** If using CDN URLs, point to infrastructure you control. Do not rely on `cdn.jmdt.io` in production as it is not guaranteed for public uptime.

---

### Runtime Asset Overrides (`runtimeAssets`)

Since v0.3.3 all WebView runtime assets (ONNX Runtime WASM, liveness scripts, MediaPipe, face-guidance) are **bundled inside the SDK** and loaded automatically — no extra setup needed.

If you need to override them (e.g. self-hosting on a CDN, using a custom ORT build, or reducing bundle size), use the `runtimeAssets` config field:

```typescript
await initializeSdk({
  models: { /* ... */ },
  runtimeAssets: {
    // Override the ONNX Runtime JS + WASM
    ortJs:   { url: 'https://your-cdn.com/ort/ort.min.js' },
    ortWasm: { url: 'https://your-cdn.com/ort/ort-wasm-simd.wasm' },

    // Override liveness WebView assets
    livenessHtml:      { url: 'https://your-cdn.com/liveness/index.html' },
    livenessJs:        { url: 'https://your-cdn.com/liveness/liveness.js' },
    antispoofJs:       { url: 'https://your-cdn.com/liveness/antispoof.js' },

    // Override MediaPipe face mesh assets
    mediapipeJs:       { url: 'https://your-cdn.com/mediapipe/face_mesh.js' },
    mediapipeWasm:     { url: 'https://your-cdn.com/mediapipe/face_mesh_solution_simd_wasm_bin.wasm' },
    mediapipeData:     { url: 'https://your-cdn.com/mediapipe/face_mesh_solution_packed_assets.data' },
  },
});
```

Each field accepts the same `ModelSource` shape (`{ module }` or `{ url }` or `{ localUri }`). Any field you omit falls back to the bundled default.

---

### Security Parameters

The configuration object also controls critical security aspects such as the Liveness Provider and ZK proof generation timeouts. Refer to the TypeScript interfaces in `core/types.ts` for the complete `FaceZkConfig` shape.
