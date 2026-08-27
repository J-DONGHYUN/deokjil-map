/**
 * 오프메이트(offmate.kr) 수집기 — 생일카페.
 *
 * robots.txt 가 `User-agent: * / Allow: /` 이고 차단 경로가 없다. 사이트맵도 공개한다.
 *
 * 상세 페이지는 Next.js SSR 이고 __NEXT_DATA__ 에 레코드가 통째로 들어 있다.
 * 좌표(cafeAddressLat/Lng)와 아티스트(memberName/groupName)가 구조화돼 있어
 * 지오코딩도, K-pop 화이트리스트도 필요 없다 — 팝가에서 겪은 두 문제가 여기선 없다.
 */
import { fetchText } from '../lib/http.mjs'

export const ORIGIN = 'https://www.offmate.kr'

/** 생일카페 상세가 모여 있는 사이트맵. 색인 페이지가 아니라 이쪽을 직접 읽는다 */
const SITEMAP = 'https://offmate.kr/sitemap-2.xml'

const DETAIL_RE = /\/place\/birthday-cafe\/detail\/\d+$/

export async function listCafeUrls() {
  const res = await fetchText(SITEMAP, { timeoutMs: 60_000 })
  if (!res.ok) throw new Error(`사이트맵을 읽지 못했다: ${res.status} ${res.error ?? ''}`)

  const entries = []
  const re = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g
  let m
  while ((m = re.exec(res.text))) {
    const [, loc, lastmod] = m
    if (DETAIL_RE.test(loc)) entries.push({ url: loc, lastmod })
  }
  // 최근에 손댄 것이 지금 열려 있을 가능성이 높다
  entries.sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1))
  return entries
}

/** "2026.08.30" → "2026-08-30". 우리 스키마는 사전순 비교가 되는 형식을 쓴다 */
function toIsoDate(dotted) {
  if (!dotted) return null
  const m = dotted.match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function extract(html, url) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)
  if (!m) return null

  let cafe
  try {
    cafe = JSON.parse(m[1])?.props?.pageProps?.birthdayCafe
  } catch {
    return null
  }
  if (!cafe) return null

  const startDate = toIsoDate(cafe.startDate)
  const endDate = toIsoDate(cafe.endDate)
  if (!startDate || !endDate) return null

  return {
    source: 'offmate',
    source_url: url,
    id: cafe.id,
    /** 생카 이름 (예: "HEART BEATS") */
    name: cafe.name ?? null,
    cafeName: cafe.cafeAddressName ?? null,
    address: cafe.cafeAddress ?? null,
    latitude: typeof cafe.cafeAddressLat === 'number' ? cafe.cafeAddressLat : null,
    longitude: typeof cafe.cafeAddressLng === 'number' ? cafe.cafeAddressLng : null,
    startDate,
    endDate,
    /** 운영 시간. 비어 있는 레코드가 많다 */
    startAt: cafe.startAt ?? null,
    endAt: cafe.endAt ?? null,

    // 아티스트가 구조화돼 있어 K-pop 판정이 자동이다
    memberName: cafe.artist?.memberName ?? null,
    groupName: cafe.artist?.groupName ?? null,
    birthDate: cafe.artist?.birthDate ?? null,

    // 특전. ID 배열이라 이름 매핑은 아직 없다 — 개수만으로도 "특전 N종" 표기가 된다
    specialGoods: cafe.specialGoods ?? [],
    firstComeGoods: cafe.firstComeGoods ?? [],
    optionalSpecialGoods: cafe.optionalSpecialGoods ?? [],

    // 주최자 계정. 원문으로 보내는 링크가 된다
    snsType: cafe.snsType ?? null,
    twitterId: cafe.twitterId ?? null,
    instagramId: cafe.instagramId ?? null,

    images: Array.isArray(cafe.images) ? cafe.images : [],
    isHostVerified: Boolean(cafe.isHostVerified),
  }
}

export async function fetchCafe(url) {
  const res = await fetchText(url)
  if (!res.ok) return { url, ok: false, status: res.status, error: res.error }
  const record = extract(res.text, url)
  if (!record) return { url, ok: false, status: res.status, error: '__NEXT_DATA__ 추출 실패' }
  return { url, ok: true, record }
}
