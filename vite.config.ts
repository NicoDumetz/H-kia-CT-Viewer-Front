import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: [
        "@cornerstonejs/dicom-image-loader",
        "@cornerstonejs/nifti-volume-loader",
      ],
      include: [
        "@cornerstonejs/codec-charls/decodewasmjs",
        "@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs",
        "@cornerstonejs/codec-openjpeg/decodewasmjs",
        "@cornerstonejs/codec-openjph/wasmjs",
        "dicom-parser",
        "fflate",
        "nifti-reader-js",
      ],
    },
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (url) => url.replace(/^\/api/, ""),
        },
      },
    },
    worker: {
      format: "es",
    },
  };
});
