import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: '가정예배 설교 AI',
  description: '성경과 예언의 신, 옵시디언 자료를 연결하는 개인 성경연구비서',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

