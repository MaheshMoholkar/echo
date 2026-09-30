import type { NextConfig } from "next"

// FastAPI (api/) runs on the same machine. The browser only ever talks to
// this Next.js origin: /api/v1/* is proxied to FastAPI, while /api/auth/*
// belongs to Better Auth. Streaming (SSE) responses from FastAPI carry
// `Cache-Control: no-transform` so this proxy doesn't gzip-buffer them.
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000"
// The voice bot (voice/, Pipecat). Only WebRTC connection setup goes
// through here; the audio itself flows browser ⇄ bot directly.
const voiceUrl = process.env.VOICE_URL ?? "http://127.0.0.1:8001"

const nextConfig: NextConfig = {
  // The dev badge sits on top of the widget's message box in a small iframe.
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiUrl}/v1/:path*` },
      { source: "/api/voice/:path*", destination: `${voiceUrl}/:path*` },
    ]
  },
}

export default nextConfig
