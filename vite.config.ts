import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
export default defineConfig({
  server:{ host:true, port:5173 },
  plugins:[legacy({
    // iPad Air 1 = iOS 12.5.7 / Safari 12 — needs full transpilation of three@0.160
    targets:['iOS >= 12','Safari >= 12'],
    modernTargets:['defaults'],
    renderLegacyChunks:true,
    modernPolyfills:false,
  })],
  // ponytail: es2015 + legacy plugin transpiles three for Safari 12; ~12% larger but boots on Air
  build:{ target:'es2015', sourcemap:false, cssTarget:'ios12' },
});
