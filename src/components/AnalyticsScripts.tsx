import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'

/**
 * 환경변수를 여기서 직접 읽는다.
 *
 * lib/analytics.ts 는 'use client' 모듈이라, 거기서 export 한 상수를
 * 서버 컴포넌트가 import 하면 값이 아니라 클라이언트 참조로 치환된다.
 * 실제로 그렇게 짰다가 배포에서 스크립트 URL 이
 * `gtag/js?id=function(){throw Error(...)}` 로 나갔다.
 */
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? ''
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? ''

/**
 * 계측 스크립트 삽입.
 *
 * 세 도구 모두 ID 가 없으면 아무것도 넣지 않는다 — 키 없이도 개발이 돌아가야 한다.
 * Vercel Analytics 는 별도 키가 없고 Vercel 배포 환경에서만 실제로 전송된다.
 *
 * afterInteractive 로 넣는 이유는, 계측이 첫 렌더를 늦추면 그 자체가
 * 이탈을 만들어 지표를 왜곡하기 때문이다.
 */
export default function AnalyticsScripts() {
  return (
    <>
      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA4_ID}');
            `}
          </Script>
        </>
      )}

      {CLARITY_ID && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");
          `}
        </Script>
      )}

      <Analytics />
    </>
  )
}
