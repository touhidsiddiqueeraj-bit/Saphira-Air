import { defineConfig } from 'vite';
export default defineConfig({
  server:{ host:true, port:5173 },
  // ponytail: es2015 = Safari 12 / iPad Air 1 parses it; modern browsers still fine, ~8% larger
  build:{ target:'es2015', sourcemap:false, cssTarget:'ios12' },
});
