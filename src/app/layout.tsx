import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘 뭐 열려? — 생카·팝업 지도',
  description:
    '서울에서 오늘 열리는 생일카페와 팝업을 위치·날짜로 모아 봅니다. 팝업 굿즈 품절 현황은 공식 공지 기준으로 함께 표시합니다.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101215' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
