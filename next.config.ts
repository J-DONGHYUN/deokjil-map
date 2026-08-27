import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 이벤트 안내 이미지를 재게시하지 않는다 (poc-plan 4.4) — 이미지 최적화 파이프라인 불필요
  images: { unoptimized: true },
}

export default nextConfig
