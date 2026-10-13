import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In `npm run dev`, serve api/drip.js the way Vercel does in production,
// so the gas top-up works locally when FUNDER_PRIVATE_KEY is in .env.local.
function localApi() {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use("/api/drip", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
        const shim = {
          status(code) {
            res.statusCode = code;
            return shim;
          },
          json(obj) {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(obj));
          },
        };
        const { default: handler } = await server.ssrLoadModule("/api/drip.js");
        await handler(req, shim);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), localApi()],
    server: { host: true, port: 5173 },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
