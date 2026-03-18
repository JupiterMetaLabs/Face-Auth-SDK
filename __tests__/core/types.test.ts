import { isSdkError } from '../../core/types';

describe('isSdkError', () => {
  it('returns true for a valid SdkError', () => {
    expect(isSdkError({ code: 'NO_FACE', message: 'No face detected' })).toBe(true);
    expect(isSdkError({ code: 'ZK_ERROR', message: 'Proof failed' })).toBe(true);
    expect(isSdkError({ code: 'LIVENESS_FAILED', message: '' })).toBe(true);
  });

  it('returns false for a plain Error object', () => {
    expect(isSdkError(new Error('something'))).toBe(false);
  });

  it('returns false for a Node.js-style error with arbitrary code', () => {
    expect(isSdkError({ code: 'ENOENT', message: 'file not found' })).toBe(false);
    expect(isSdkError({ code: 'ECONNREFUSED', message: 'connection refused' })).toBe(false);
  });

  it('returns false for null and non-objects', () => {
    expect(isSdkError(null)).toBe(false);
    expect(isSdkError(undefined)).toBe(false);
    expect(isSdkError('NO_FACE')).toBe(false);
    expect(isSdkError(42)).toBe(false);
  });

  it('returns false when code is valid but message is missing', () => {
    expect(isSdkError({ code: 'NO_FACE' })).toBe(false);
  });

  it('returns false when message is not a string', () => {
    expect(isSdkError({ code: 'NO_FACE', message: 123 })).toBe(false);
  });

  it('returns true for SdkError with optional details', () => {
    expect(
      isSdkError({ code: 'SYSTEM_ERROR', message: 'boom', details: { stage: 'matching' } }),
    ).toBe(true);
  });
});
