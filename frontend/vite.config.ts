import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev:web:phone` uses mode "phone":
//  - HTTPS with a self-signed certificate (phones only allow GPS on HTTPS pages)
//  - listens on the Wi-Fi network (--host) so a phone can open it
//  - the app calls /api/... on its own address; Vite forwards that to the local API on this laptop,
//    so the phone never needs to reach port 3000 directly.
export default defineConfig(({ mode }) => {
  const phone = mode === "phone";
  return {
    plugins: [react(), ...(phone ? [basicSsl({ name: "locdrop-dev" })] : [])],
    server: {
      port: 5173,
      host: phone ? true : undefined,
      proxy: {
        "/api": {
          target: process.env.API_TARGET ?? "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
