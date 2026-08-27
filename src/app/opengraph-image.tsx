import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '모여라덕 — 서울 생카·팝업 지도'

/**
 * 커뮤니티에 링크를 뿌릴 때 뜨는 미리보기 카드.
 *
 * OG 이미지가 없으면 커뮤니티 클릭률이 반토막 난다(poc-plan 8번).
 * 유입이 지표 0의 관문이므로 여기가 실질적으로 제품의 첫 화면이다.
 *
 * PNG 파일을 두는 대신 빌드 시점에 생성한다 — 문구나 색을 바꿀 때
 * 이미지 편집기를 거치지 않아도 된다.
 */
export const dynamic = 'force-static'

/**
 * satori(next/og)는 웹폰트를 스스로 받아오지 않으므로 폰트 데이터를 넘겨야 한다.
 * 넘기지 않으면 한글이 전부 빈 사각형으로 나온다.
 *
 * Google Fonts 는 `text=` 로 필요한 글자만 잘라주고,
 * 구형 User-Agent 로 요청하면 woff2 대신 satori 가 읽을 수 있는 TTF 를 준다.
 */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  // 구형 UA — 이걸 안 보내면 woff2 가 오고, satori 는 woff2 를 읽지 못한다
  const legacyUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/533.17.9'
  const cssUrl =
    'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800' +
    `&text=${encodeURIComponent(text)}`

  try {
    const css = await fetch(cssUrl, { headers: { 'User-Agent': legacyUA } }).then((r) => r.text())
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1]
    if (!url) return null
    return await fetch(url).then((r) => r.arrayBuffer())
  } catch {
    // 빌드 환경에 네트워크가 없을 수도 있다. 그때는 폰트 없이 렌더한다
    return null
  }
}

const TITLE = '모여라덕'
const SUB = '오늘 서울 어디서 뭐 하지?'
const TAGS = ['홍대', '합정', '성수', '강남', '용산', '잠실']
const FOOT = '생일카페 · 팝업 지도'

export default async function Image() {
  const font = await loadFont([TITLE, SUB, FOOT, ...TAGS].join(''))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: 'linear-gradient(135deg, #fff5f9 0%, #ffe4ee 55%, #ffd0e2 100%)',
          fontFamily: font ? 'Noto Sans KR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 128, color: '#b41f5c', letterSpacing: '-0.04em' }}>
          {TITLE}
        </div>

        <div style={{ display: 'flex', marginTop: 12, fontSize: 52, color: '#574149' }}>{SUB}</div>

        {/* 지역 칩 — 위치 축 제품이라는 걸 이미지에서 바로 읽히게 한다 */}
        <div style={{ display: 'flex', gap: 14, marginTop: 44 }}>
          {TAGS.map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                padding: '10px 26px',
                borderRadius: 999,
                background: '#ffffff',
                border: '3px solid #ff4d8d',
                color: '#b41f5c',
                fontSize: 34,
              }}
            >
              {t}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', marginTop: 52, fontSize: 36, color: '#7a6670' }}>{FOOT}</div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: 'Noto Sans KR', data: font, weight: 800 as const, style: 'normal' as const }]
        : [],
    },
  )
}
