/**
 * 팝가(popga.co.kr) 수집기.
 *
 * robots.txt 가 `User-Agent: * / Allow: /` 이고 sitemap 을 공개한다.
 * 차단 경로는 /login, /enterprise* 뿐이며 우리는 /popup/* 만 읽는다.
 *
 * 상세 페이지는 서버 렌더링이고, Next.js RSC 페이로드 안에 팝업 데이터가
 * JSON 그대로 들어 있다 — 좌표까지 포함돼 지오코딩이 필요 없다.
 */
import { fetchText } from '../lib/http.mjs'

export const ORIGIN = 'https://popga.co.kr'
const SITEMAP = `${ORIGIN}/sitemap/2.xml`

/** 사이트맵에서 팝업 상세 URL을 갱신일과 함께 읽는다 */
export async function listPopupUrls() {
  const res = await fetchText(SITEMAP, { timeoutMs: 40_000 })
  if (!res.ok) throw new Error(`사이트맵을 읽지 못했다: ${res.status} ${res.error ?? ''}`)

  const entries = []
  const re = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g
  let m
  while ((m = re.exec(res.text))) {
    const [, loc, lastmod] = m
    if (/\/popup\/\d+$/.test(loc)) entries.push({ url: loc, lastmod })
  }
  // 최근에 손댄 것이 지금 열려 있을 가능성이 높다
  entries.sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1))
  return entries
}

/**
 * 상세 HTML에서 팝업 레코드를 뽑는다.
 *
 * RSC 페이로드는 JS 문자열 안에 JSON이 이스케이프된 채로 들어 있다.
 * 전체를 파싱하는 대신 필요한 필드만 앵커를 잡아 잘라낸다 —
 * 페이로드 형식은 Next 버전에 따라 바뀌지만 필드명은 잘 안 바뀐다.
 */
/** RSC 페이로드에 남아 있는 \uXXXX 를 실제 문자로 되돌린다 (예: F&B → F&B) */
function decodeUnicode(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export function extract(html, url) {
  const unescaped = html.replace(/\\"/g, '"').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')

  const pick = (key) => {
    const m = unescaped.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`))
    return m ? decodeUnicode(m[1].replace(/\\\\/g, '\\')) : null
  }
  const pickNum = (key) => {
    const m = unescaped.match(new RegExp(`"${key}":(-?\\d+(?:\\.\\d+)?)`))
    return m ? Number(m[1]) : null
  }
  const pickArray = (key) => {
    const m = unescaped.match(new RegExp(`"${key}":\\[([^\\]]*)\\]`))
    if (!m) return []
    return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => decodeUnicode(x[1]))
  }

  const title = pick('title')
  const openDate = pick('openDate')
  const closeDate = pick('closeDate')
  if (!title || !openDate || !closeDate) return null

  // categories 는 [{"id":42,"name":"연예인/셀럽"}, ...] 형태라 name 만 훑는다
  const catBlock = unescaped.match(/"categories":\[(.*?)\]/s)
  const categories = catBlock
    ? [...catBlock[1].matchAll(/"name":"((?:[^"\\]|\\.)*)"/g)].map((x) => decodeUnicode(x[1]))
    : []

  // benefits 는 [{"key":"현장 이벤트","value":"..."}] 형태.
  // 값이 빈 항목이 많아 실제 내용이 있는 것만 남긴다
  const benefitBlock = unescaped.match(/"benefits":\[(.*?)\](?=,"|\})/s)
  const benefits = benefitBlock
    ? [...benefitBlock[1].matchAll(/"key":"((?:[^"\\]|\\.)*)","value":"((?:[^"\\]|\\.)*)"/g)]
        .map((m) => ({ key: decodeUnicode(m[1]), value: decodeUnicode(m[2]).replace(/\\r\\n/g, '\n') }))
        .filter((b) => b.value.trim())
    : []

  // files[].path 중 대표 이미지. MAIN 썸네일이 목록 카드에 맞는 크기다
  const imagePaths = [...unescaped.matchAll(/"path":"(https:\/\/cdn\.popga\.co\.kr\/[^"]+)"/g)].map(
    (m) => m[1],
  )
  const mainImage = imagePaths.find((p) => p.includes('/main/')) ?? imagePaths[0] ?? null

  return {
    source: 'popga',
    source_url: url,
    title,
    subTitle: pick('subTitle') || null,
    periodType: pick('periodType'), // IN_PROGRESS | READY | ENDED
    openDate,
    closeDate,
    operationTime: pickArray('operationTime'),
    categories,
    tags: pickArray('tags'),
    address: pick('address'),
    addressDetail: pick('addressDetail'),
    roadAddress: pick('roadAddress'),
    latitude: pickNum('latitude'),
    longitude: pickNum('longitude'),

    // 공급처로 이어지는 링크들. 사용자를 원문으로 보내는 것이 정합성 방어의 핵심이다
    instagram: pick('instagram'),
    website: pick('website'),
    preReservationLink: pick('preReservationLink'),

    benefits,
    notice: pick('notice')?.replace(/\\r\\n/g, '\n') ?? null,
    additionalInformation: pick('additionalInformation'),
    ageRestrictionType: pick('ageRestrictionType'),
    image: mainImage,
  }
}

export async function fetchPopup(url) {
  const res = await fetchText(url)
  if (!res.ok) return { url, ok: false, status: res.status, error: res.error }
  const record = extract(res.text, url)
  if (!record) return { url, ok: false, status: res.status, error: '필드 추출 실패' }
  return { url, ok: true, record }
}
