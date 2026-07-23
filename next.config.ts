import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingExcludes: {
    // 로컬 전용 네이티브 ML 의존성은 Vercel 서버리스 함수에 포함하지 않는다.
    // 웹 모드는 이 모듈을 실행하지 않고 작업 큐(메인 PC Companion)로 위임한다.
    '*': [
      'node_modules/onnxruntime-node/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/onnxruntime-common/**',
      'node_modules/@huggingface/transformers/**',
      'node_modules/sharp/**',
      'node_modules/@img/**',
    ],
    '/api/research': ['./next.config.ts'],
    '/api/sermon': ['./next.config.ts'],
    '/api/devices': ['./next.config.ts'],
    '/api/jobs/[id]': ['./next.config.ts'],
    '/api/settings': ['./next.config.ts'],
    '/api/sync': ['./next.config.ts'],
  },
}

export default nextConfig
