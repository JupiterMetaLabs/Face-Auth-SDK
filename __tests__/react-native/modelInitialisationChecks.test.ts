/**
 * Copyright 2026 JupiterMeta Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Tests for react-native/utils/modelInitialisationChecks.ts
 *
 * expo-file-system/legacy and expo-asset are mocked — we only test the
 * logic of modelInitialisationChecks itself (which paths it checks,
 * how it classifies results), not the underlying file system.
 */

// ── Mocks (must be before imports) ─────────────────────────────────────────

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app-data/',
  cacheDirectory:    'file:///cache/',
  getInfoAsync:      jest.fn(),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync:       jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn().mockResolvedValue(undefined),
      localUri: 'file:///bundled/asset.onnx',
      uri:      'file:///bundled/asset.onnx',
    })),
  },
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import {
  modelInitialisationChecks,
} from '../../react-native/utils/modelInitialisationChecks';
import type { FaceZkModelsConfig } from '../../config/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockGetInfo = FileSystem.getInfoAsync as jest.MockedFunction<
  typeof FileSystem.getInfoAsync
>;

/** Returns a getInfoAsync response for an existing file. */
const EXISTS    = { exists: true,  isDirectory: false, uri: '', size: 1024 };
/** Returns a getInfoAsync response for a missing file. */
const NOT_EXISTS = { exists: false, isDirectory: false, uri: ''             };

/** Stable CDN URLs matching what buildModelUrls() would produce. */
const CDN = {
  detection:    'https://cdn.jmdt.io/face-zk/v1/det_500m.onnx',
  recognition:  'https://cdn.jmdt.io/face-zk/v1/w600k_mbf.onnx',
  antispoof:    'https://cdn.jmdt.io/face-zk/v1/antispoof.onnx',
  wasm:         'https://cdn.jmdt.io/face-zk/v1/zk_face_wasm_bg.wasm',
  zkWorkerHtml: 'https://cdn.jmdt.io/face-zk/v1/zk-worker.html',
};

/** Expected local store paths derived from CDN URLs. */
const STORE = 'file:///app-data/face-zk-models/';
const PATH = {
  detection:    `${STORE}det_500m.onnx`,
  recognition:  `${STORE}w600k_mbf.onnx`,
  antispoof:    `${STORE}antispoof.onnx`,
  wasm:         `${STORE}zk_face_wasm_bg.wasm`,
  zkWorkerHtml: `${STORE}zk-worker.html`,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('modelInitialisationChecks — module sources', () => {
  it('reports ready when all required sources are Metro-bundled modules', async () => {
    const config: FaceZkModelsConfig = {
      detection:   { module: 1 },
      recognition: { module: 2 },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(true);
    expect(result.present).toEqual(['detection', 'recognition']);
    expect(result.missing).toEqual([]);
    // No file-system calls needed for module sources
    expect(mockGetInfo).not.toHaveBeenCalled();
  });

  it('includes optional module sources in present when configured', async () => {
    const config: FaceZkModelsConfig = {
      detection:   { module: 1 },
      recognition: { module: 2 },
      antispoof:   { module: 3 },
      wasm:        { module: 4 },
      zkWorkerHtml:{ module: 5 },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(true);
    expect(result.present).toEqual(['detection', 'recognition', 'antispoof', 'wasm', 'zkWorkerHtml']);
    expect(result.missing).toEqual([]);
  });
});

describe('modelInitialisationChecks — url sources (all present)', () => {
  it('reports ready when all CDN models exist in documentDirectory', async () => {
    mockGetInfo.mockResolvedValue(EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:    { url: CDN.detection },
      recognition:  { url: CDN.recognition },
      antispoof:    { url: CDN.antispoof },
      wasm:         { url: CDN.wasm },
      zkWorkerHtml: { url: CDN.zkWorkerHtml },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(true);
    expect(result.present).toEqual(['detection', 'recognition', 'antispoof', 'wasm', 'zkWorkerHtml']);
    expect(result.missing).toEqual([]);
  });

  it('checks the correct documentDirectory paths for each CDN URL', async () => {
    mockGetInfo.mockResolvedValue(EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
    };

    await modelInitialisationChecks(config);

    expect(mockGetInfo).toHaveBeenCalledWith(PATH.detection);
    expect(mockGetInfo).toHaveBeenCalledWith(PATH.recognition);
  });
});

describe('modelInitialisationChecks — url sources (all missing)', () => {
  it('reports not ready when no models exist on device', async () => {
    mockGetInfo.mockResolvedValue(NOT_EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(['detection', 'recognition']);
    expect(result.present).toEqual([]);
  });
});

describe('modelInitialisationChecks — partial presence', () => {
  it('correctly splits present and missing when some files exist', async () => {
    // detection present, recognition missing
    mockGetInfo.mockImplementation(async (path: string) => {
      if (path === PATH.detection) return EXISTS as any;
      return NOT_EXISTS as any;
    });

    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
      antispoof:   { url: CDN.antispoof },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.present).toEqual(['detection']);
    expect(result.missing).toEqual(['recognition', 'antispoof']);
  });

  it('only one required model missing marks ready as false', async () => {
    mockGetInfo.mockImplementation(async (path: string) => {
      if (path === PATH.recognition) return NOT_EXISTS as any;
      return EXISTS as any;
    });

    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain('recognition');
    expect(result.present).toContain('detection');
  });
});

describe('modelInitialisationChecks — localUri sources', () => {
  it('reports present when localUri file exists', async () => {
    mockGetInfo.mockResolvedValue(EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:   { localUri: 'file:///on-device/det_500m.onnx' },
      recognition: { localUri: 'file:///on-device/w600k_mbf.onnx' },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(true);
    expect(mockGetInfo).toHaveBeenCalledWith('file:///on-device/det_500m.onnx');
    expect(mockGetInfo).toHaveBeenCalledWith('file:///on-device/w600k_mbf.onnx');
  });

  it('reports missing when localUri file does not exist', async () => {
    mockGetInfo.mockResolvedValue(NOT_EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:   { localUri: 'file:///gone/det_500m.onnx' },
      recognition: { module: 1 },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain('detection');
    expect(result.present).toContain('recognition');
  });
});

describe('modelInitialisationChecks — optional models not configured', () => {
  it('does not include unconfigured optional models in present or missing', async () => {
    mockGetInfo.mockResolvedValue(EXISTS as any);

    // Only required models — no antispoof, wasm, zkWorkerHtml
    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.present).not.toContain('antispoof');
    expect(result.present).not.toContain('wasm');
    expect(result.present).not.toContain('zkWorkerHtml');
    expect(result.missing).not.toContain('antispoof');
    expect(result.missing).not.toContain('wasm');
    expect(result.missing).not.toContain('zkWorkerHtml');
  });

  it('ready is true when only required models are present and optionals are unconfigured', async () => {
    mockGetInfo.mockResolvedValue(EXISTS as any);

    const config: FaceZkModelsConfig = {
      detection:   { url: CDN.detection },
      recognition: { url: CDN.recognition },
      // antispoof / wasm / zkWorkerHtml intentionally omitted
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(true);
  });
});

describe('modelInitialisationChecks — source with no resolvable value', () => {
  it('treats an empty ModelSource ({}) as missing', async () => {
    const config: FaceZkModelsConfig = {
      detection:   {},   // no module, url, or localUri
      recognition: { module: 1 },
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain('detection');
    expect(result.present).toContain('recognition');
  });
});

describe('modelInitialisationChecks — mixed source types', () => {
  it('handles a mix of module, url-present, url-missing, and localUri sources', async () => {
    mockGetInfo.mockImplementation(async (path: string) => {
      // antispoof URL is on device, wasm localUri is missing
      if (path === PATH.antispoof)                       return EXISTS    as any;
      if (path === 'file:///on-device/wasm.wasm')        return NOT_EXISTS as any;
      return EXISTS as any;
    });

    const config: FaceZkModelsConfig = {
      detection:    { module: 1 },                              // always present
      recognition:  { url: CDN.recognition },                   // getInfoAsync → not called with this branch, mock returns EXISTS
      antispoof:    { url: CDN.antispoof },                     // exists
      wasm:         { localUri: 'file:///on-device/wasm.wasm' }, // missing
      zkWorkerHtml: { module: 5 },                              // always present
    };

    const result = await modelInitialisationChecks(config);

    expect(result.ready).toBe(false);
    expect(result.present).toEqual(
      expect.arrayContaining(['detection', 'recognition', 'antispoof', 'zkWorkerHtml']),
    );
    expect(result.missing).toEqual(['wasm']);
  });
});
