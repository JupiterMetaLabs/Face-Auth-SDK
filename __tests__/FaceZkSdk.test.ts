import { FaceZkSdk } from '../FaceZkSdk';
import type { FaceZkConfig } from '../config/types';

// ---------------------------------------------------------------------------
// Minimal valid config for all tests
// ---------------------------------------------------------------------------

const MINIMAL_CONFIG: FaceZkConfig = {
  models: {
    detection: { url: 'https://cdn.example.com/det.onnx' },
    recognition: { url: 'https://cdn.example.com/rec.onnx' },
  },
};

// ---------------------------------------------------------------------------
// Test isolation: reset module-level state before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  FaceZkSdk.reset();
});

// ---------------------------------------------------------------------------
// C-9: init() re-entry guard
// ---------------------------------------------------------------------------

describe('FaceZkSdk.init — re-initialization guard (C-9)', () => {
  it('succeeds on first call when state is "uninitialized"', async () => {
    await expect(FaceZkSdk.init(MINIMAL_CONFIG)).resolves.toBeUndefined();
    expect(FaceZkSdk.isInitialized()).toBe(true);
  });

  it('throws "Already initialized" when init() is called a second time', async () => {
    await FaceZkSdk.init(MINIMAL_CONFIG);
    await expect(FaceZkSdk.init(MINIMAL_CONFIG)).rejects.toThrow('Already initialized');
  });

  it('allows re-initialization after reset()', async () => {
    await FaceZkSdk.init(MINIMAL_CONFIG);
    FaceZkSdk.reset();
    await expect(FaceZkSdk.init(MINIMAL_CONFIG)).resolves.toBeUndefined();
  });

  it('getState() transitions: uninitialized → ready', async () => {
    expect(FaceZkSdk.getState()).toBe('uninitialized');
    await FaceZkSdk.init(MINIMAL_CONFIG);
    expect(FaceZkSdk.getState()).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe('FaceZkSdk.init — config validation', () => {
  it('throws when config is missing entirely', async () => {
    await expect(FaceZkSdk.init(null as any)).rejects.toThrow('config must be an object');
  });

  it('throws when models.detection is missing', async () => {
    await expect(
      FaceZkSdk.init({ models: { detection: null as any, recognition: { url: 'x' } } }),
    ).rejects.toThrow('config.models.detection is required');
  });

  it('throws when models.recognition is missing', async () => {
    await expect(
      FaceZkSdk.init({ models: { detection: { url: 'x' }, recognition: null as any } }),
    ).rejects.toThrow('config.models.recognition is required');
  });

  it('throws when a model source has none of module/url/localUri', async () => {
    await expect(
      FaceZkSdk.init({ models: { detection: {}, recognition: { url: 'x' } } }),
    ).rejects.toThrow('must have at least one of');
  });

  it('sets state to "error" when config validation fails', async () => {
    await FaceZkSdk.init(null as any).catch(() => {});
    expect(FaceZkSdk.getState()).toBe('error');
    expect(FaceZkSdk.getInitError()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getConfig() and isInitialized()
// ---------------------------------------------------------------------------

describe('FaceZkSdk.getConfig', () => {
  it('throws when called before init()', () => {
    expect(() => FaceZkSdk.getConfig()).toThrow('Not initialized');
  });

  it('returns config after successful init()', async () => {
    await FaceZkSdk.init(MINIMAL_CONFIG);
    expect(FaceZkSdk.getConfig()).toBe(MINIMAL_CONFIG);
  });
});
