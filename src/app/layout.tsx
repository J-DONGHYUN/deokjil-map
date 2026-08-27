import type { Metadata, Viewport } from 'next'
import './globals.css'
import AnalyticsScripts from '@/components/AnalyticsScripts'

export const metadata: Metadata = {
  title: '모여라덕 — 서울 생카·팝업 지도',
  description:
    '오늘 서울 어디서 뭐 하는지 한눈에. 생일카페와 팝업을 지역·날짜로 모아 보여줍니다.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // 라이트 전용 — 기기 설정과 무관하게 같은 톤을 보여준다
  themeColor: '#fffafc',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  )
}
