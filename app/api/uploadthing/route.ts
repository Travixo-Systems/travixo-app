import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Export routes for Next.js App Router
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,

  // Optional: Add custom config
  config: {
    // Enable more detailed logging in development
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "error",
  },
});