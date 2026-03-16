/**
 * Face+ZK SDK – UI Config Resolver
 *
 * Merges user-supplied UiConfig with SDK defaults so flow components
 * always have a complete, resolved theme and string set.
 */

import type { UiConfig, FaceZkTheme, FaceZkStrings } from "../../core/types";

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_THEME: FaceZkTheme = {
  colors: {
    primary: "#4CAF50",
    background: "#000000",
    surface: "rgba(255,255,255,0.1)",
    text: "#ffffff",
    textMuted: "#aaaaaa",
    error: "#F44336",
  },
  borderRadius: 8,
};

export const DEFAULT_STRINGS: Required<FaceZkStrings> = {
  loadingInitializing: "Initializing...",
  loadingModels: "Loading face recognition models...",
  loadingCapturing: "Capturing image...",
  loadingProcessing: "Processing reference image...",
  loadingEmbedding: "Processing face...",
  loadingMatching: "Matching face...",
  loadingZkProof: "Generating cryptographic proof...",

  verificationSuccessTitle: "Verified!",
  verificationSuccessSubtitle: "Match: {score}%",
  enrollmentSuccessTitle: "Reference Enrolled",
  enrollmentSuccessSubtitle: "Your reference has been successfully enrolled.",

  verificationErrorTitle: "Verification Failed",
  enrollmentErrorTitle: "Enrollment Failed",

  cancelButton: "Cancel",
  retryButton: "Try Again",
};

// ============================================================================
// Resolved types
// ============================================================================

export interface ResolvedTheme extends FaceZkTheme {
  colors: Required<FaceZkTheme["colors"]>;
  borderRadius: number;
}

export interface ResolvedUiConfig {
  theme: ResolvedTheme;
  strings: Required<FaceZkStrings>;
  renderLoading?: UiConfig["renderLoading"];
  renderSuccess?: UiConfig["renderSuccess"];
  renderError?: UiConfig["renderError"];
  renderOverlay?: UiConfig["renderOverlay"];
}

// ============================================================================
// Resolver
// ============================================================================

export function resolveUiConfig(uiConfig: UiConfig = {}): ResolvedUiConfig {
  const userColors = uiConfig.theme?.colors ?? {};
  const userTheme = uiConfig.theme ?? {};

  return {
    theme: {
      colors: {
        ...DEFAULT_THEME.colors,
        ...userColors,
      },
      borderRadius: userTheme.borderRadius ?? DEFAULT_THEME.borderRadius!,
    },
    strings: {
      ...DEFAULT_STRINGS,
      ...(uiConfig.strings ?? {}),
    },
    renderLoading: uiConfig.renderLoading,
    renderSuccess: uiConfig.renderSuccess,
    renderError: uiConfig.renderError,
    renderOverlay: uiConfig.renderOverlay,
  };
}

/**
 * Replace `{score}` placeholder in a string template.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
