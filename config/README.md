# Config Module (`@jmdt/face-zk-sdk/config`)

This module defines the default settings, limits, and environmental configurations for the Face+ZK SDK. 

## Overriding Defaults

When calling `initializeSdk(configOverrides)`, any values you provide will recursively merge with the defaults defined in this module.

### CDN Configuration (Critical)

By default, the SDK may point to an internal CDN URL for downloading necessary ONNX models and WASM binaries if they are not bundled locally. 

**WARNING:** Before releasing your app to production, you must override the `cdnBaseUrl` to point to an infrastructure you control, as internal test CDNs are not guaranteed to have public uptime.

```typescript
import { initializeSdk } from '@jmdt/face-zk-sdk/react-native';

await initializeSdk({
  models: {
    cdnBaseUrl: 'https://your-production-cdn.com/face-zk/v1'
  }
});
```

## Security Parameters

The configuration object also controls critical security aspects of the SDK, such as overriding the Liveness Provider and adjusting timeout boundaries for ZK proof generation. Refer to the TypeScript interfaces inside `core/types.ts` for the complete `FaceZkConfig` shape.
