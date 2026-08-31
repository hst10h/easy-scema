import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["bullmq", "ioredis", "googleapis", "stripe", "postgres", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  },
  server: {
    host: "0.0.0.0",
  },
  ssr: {
    external: ["bullmq", "ioredis", "googleapis", "stripe", "postgres", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  },
  plugins: [vinext()],
});
