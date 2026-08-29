/**
 * 수집 원본 → events.json 정규화.
 *
 *   node crawler/to-events.mjs [--out src/data/events.json] [--all]
 *
 * 수집(run.mjs)과 가공을 분리해둔 이유는, 필터 기준을 바꿀 때마다
 * 상대 서버를 다시 두드리지 않기 위해서다.
 *
 * 기본은 K-pop 관련만 남긴다. --all 을 주면 카테고리 필터를 끄고 전부 내보낸다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'src/data/events.json'
const KEEP_ALL = args.includes('--all')
const IN_POPGA = 'data/raw/crawl/popga.json'
const IN_OFFMATE = 'data/raw/crawl/offmate.json'

function readRecords(path) {
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf8')).records ?? []
}

/** 서울만 다룬다 (poc-plan 4.2) */
const SEOUL_PREFIX = '서울'

/**
 * 구역 판정.
 *
 * 순서가 중요하다 — 세부 구역(홍대·합정·성수)이 구(區) 단위보다 먼저 걸려야 한다.
 * 팬덤의 동선 단위가 "마포구"가 아니라 "홍대"이기 때문이다.
 * 세부 구역에 안 걸리는 것만 구 단위로 떨어진다.
 *
 * 도로명은 동(洞) 이름과 다르다. '동교동'만 넣으면 '동교로34길'이 통째로 샌다 —
 * 실제로 홍대 권역 23건이 'etc'에 쌓여 있었다. 도로명을 따로 나열하는 이유다.
 *
 * 반대로 넓게 잡으면 다른 구의 같은 이름에 걸린다. 광진구에도 뚝섬로가 있고
 * 은평구에도 신사동이 있다. 그런 이름은 구(區)와 함께 볼 때만 인정한다.
 */
const DISTRICT_RULES = [
  {
    district: 'hongdae',
    // 연남·동교는 홍대와 걸어서 이어지는 한 동선이라 따로 가르지 않는다.
    // 마포구 신촌로는 홍대입구역 권역이다 — 서대문구 신촌로(진짜 신촌)와 다르다
    test: (a) =>
      /서교동|홍대|홍익로|와우산로|어울마당로|동교동|동교로|성미산로|월드컵북로|연남/.test(a) ||
      (/마포구/.test(a) && /신촌로/.test(a)) ||
      // 양화로는 합정역에서 홍대입구역까지 관통해 이름만으로는 못 가른다.
      // 홍대입구역이 160번대라 150 이상을 홍대로 본다. 그 아래는 합정 규칙이 받는다
      /양화로\s*(1[5-9]\d|[2-9]\d\d)/.test(a),
  },
  {
    // 망원은 합정에 붙인다. 도보권이고 단독으로는 표본이 너무 적다
    district: 'hapjeong',
    test: (a) => /합정|양화로|독막로|잔다리로|망원|희우정로|월드컵로/.test(a),
  },
  {
    // 뚝섬로·아차산로는 광진구에도 있다. 성동구일 때만 성수로 본다
    district: 'seongsu',
    test: (a) => /성수|연무장|서울숲/.test(a) || (/성동구/.test(a) && /뚝섬|아차산로/.test(a)),
  },
  {
    // '신사'는 은평구에도 있다. 강남·서초 안에서만 인정한다
    district: 'gangnam',
    test: (a) =>
      /강남|압구정|청담|삼성동|역삼|논현|테헤란로/.test(a) ||
      (/강남구|서초구/.test(a) && /신사/.test(a)),
  },
  { district: 'konkuk', test: (a) => /건대|화양동|능동로/.test(a) },
  { district: 'jamsil', test: (a) => /잠실|송파구|올림픽로/.test(a) },
  { district: 'yeouido', test: (a) => /여의도|여의대로|영등포구/.test(a) },
  { district: 'yongsan', test: (a) => /용산|이태원|한남|아이파크몰/.test(a) },
  { district: 'myeongdong', test: (a) => /명동|중구|을지로|충무로/.test(a) },
  { district: 'jongno', test: (a) => /종로|인사동|익선동|삼청/.test(a) },
]

/**
 * K-pop 판정 — 아티스트 화이트리스트 대조.
 *
 * 팝가 카테고리는 "연예인/셀럽"까지만 구분하고 K-pop 여부를 알려주지 않는다.
 * 카테고리만 쓰면 브랜드 팝업(앰버서더 태그)·일본 가수·게임 IP 가 전부 섞여 들어온다.
 * 실제로 재현율 우선 필터에서는 43건 중 실제 K-pop 이 5~8건이었다.
 *
 * 그래서 화이트리스트로 간다. 커버리지가 줄어드는 것은 감수한다 —
 * "K-pop 만" 이라는 요구와 높은 재현율은 이 데이터로는 양립하지 않는다.
 * 누락이 보이면 crawler/kpop-artists.json 에만 추가하면 되고,
 * 수집 원본이 남아 있어 다시 긁지 않아도 된다.
 */
const ARTISTS = JSON.parse(readFileSync('crawler/kpop-artists.json', 'utf8')).groups

/** 정규화: 공백·기호를 지우고 소문자로. "스트레이 키즈" 와 "스트레이키즈" 를 같게 본다 */
const norm = (s) => s.toLowerCase().replace(/[\s()·&.,'-]/g, '')

/**
 * 짧은 이름은 부분일치로 쓰면 안 된다.
 * 한국어는 단어 경계가 없어서 "카이"가 "서울스카이"·"아카이브"에,
 * "조이"가 "조이올팍"에 걸린다. 실제로 오탐이 4건 나왔다.
 *
 * 그래서 길이로 갈랐다.
 *  - 4자 이상: 제목·태그 어디든 부분일치 허용
 *  - 3자 이하: 태그와 '정확히' 같을 때만 인정 (태그는 사람이 단 라벨이라 신뢰도가 높다)
 */
const LONG_NAME_MIN = 4

const NEEDLES = ARTISTS.flatMap((g) => [g.name, ...(g.aliases ?? [])]).map((n) => ({
  raw: n,
  key: norm(n),
}))

const LONG_NEEDLES = NEEDLES.filter((n) => n.key.length >= LONG_NAME_MIN)
const SHORT_NEEDLES = NEEDLES.filter((n) => n.key.length >= 2 && n.key.length < LONG_NAME_MIN)

/** 애니·게임·캐릭터 IP 는 K-pop 이 아니다. 카테고리로 먼저 쳐낸다 */
function isNonKpopIp(rec) {
  return rec.categories.some((c) => /애니|캐릭터|게임|웹툰|만화/.test(c))
}

/** 매칭된 아티스트명을 돌려준다. 없으면 null */
function matchArtist(rec) {
  if (isNonKpopIp(rec)) return null

  const hay = norm([rec.title, rec.subTitle ?? '', rec.tags.join(' ')].join(' '))
  const long = LONG_NEEDLES.find((n) => hay.includes(n.key))
  if (long) return long.raw

  const tagKeys = new Set(rec.tags.map(norm))
  const short = SHORT_NEEDLES.find((n) => tagKeys.has(n.key))
  return short ? short.raw : null
}

/**
 * 생일카페 판정.
 * 팝가는 팝업 전문이라 생카가 많지 않지만 섞여 들어온다.
 * 제목이 "정국 생일카페 - 24시 꾸꾸 편의점" 형태라 대상과 장소를 여기서 가른다.
 */
function parseBirthdayCafe(title) {
  const m = title.match(/^(.+?)\s*생일\s*카페\s*(?:[-–—]\s*(.+))?$/)
  if (!m) return null
  return { subject: m[1].trim(), place: m[2]?.trim() || null }
}

/**
 * 주소가 정본이다.
 *
 * 태그를 주소와 한 덩어리로 붙여 보면 다른 지점명·행사 태그가 섞여
 * "중구 남대문로"가 강남으로 분류된다. 여러 지점을 함께 여는 팝업은
 * 태그에 지점명이 전부 들어 있어서다.
 *
 * 그래서 주소로 먼저 판정하고, 주소만으로 못 가른 것에만 태그를 본다.
 * 태그에는 구(區)가 없으므로 구 조건이 붙은 규칙은 태그로 걸리지 않는다 —
 * 그게 의도한 동작이다.
 */
function districtOf(address, tags = '') {
  const byAddress = DISTRICT_RULES.find((r) => r.test(address))
  if (byAddress) return byAddress.district

  const byTag = tags ? DISTRICT_RULES.find((r) => r.test(tags)) : null
  return byTag ? byTag.district : 'etc'
}

/**
 * 대상 유형 판정.
 * 생카는 이미 버추얼·애니 캐릭터·배우로 확장됐고 스키마도 열어뒀다(poc-plan 7번).
 * 팝가 카테고리가 유일한 단서라 여기서 최대한 갈라둔다.
 */
function subjectTypeOf(rec) {
  const cats = rec.categories.join(' ')
  const tags = rec.tags.join(' ')
  if (/애니|캐릭터|게임/.test(cats)) return 'character'
  if (/버추얼|버튜버|플레이브|VTuber/i.test(`${cats} ${tags}`)) return 'virtual'
  if (/배우|드라마|영화/.test(cats)) return 'actor'
  return 'idol'
}

function toEvent(rec, artist) {
  const address = rec.roadAddress || rec.address || ''

  const cafe = parseBirthdayCafe(rec.title)

  // 장소명은 addressDetail(실제 공간 이름)이 정본이다.
  // 다만 "1F"·"2층"·"지층"처럼 층 표기만 들어 있는 경우가 있어 그건 장소명이 아니다.
  const detail = rec.addressDetail?.trim() ?? ''
  // "1F" "2층" "지층" "지하1층" "로비" 처럼 층·구획 표기만 있는 것은 장소명이 아니다
  const isFloorOnly = /^(지하|지|B)?\s*\d*\s*(F|층|로비|LOBBY)$/i.test(detail) || detail.length <= 2
  const buildingFromAddress = (rec.address ?? '')
    .match(/\(([^)]*)\)\s*$/)?.[1]
    ?.split(',')
    .pop()
    ?.trim()

  // 생카는 제목 뒤쪽이 카페명이라 그것을 우선한다
  const placeName =
    (!isFloorOnly && detail) || cafe?.place || buildingFromAddress || address || rec.title

  return {
    id: `pg_${rec.source_url.split('/').pop()}`,
    place: {
      name: placeName,
      address,
      lat: rec.latitude,
      lng: rec.longitude,
      district: districtOf(address, rec.tags.join(' ')),
      kind: cafe ? 'cafe' : 'popup_venue',
    },
    // 카드에는 대상명이 앞에 와야 한다.
    // 생카는 제목 앞쪽이 대상명이고, 팝업은 매칭된 아티스트명을 쓴다 —
    // 팝업 제목은 "아임도넛 X 키스오브라이프 팝업 @홍대"처럼 브랜드가 앞서는 경우가 많다
    subject: cafe?.subject ?? artist ?? rec.title.replace(/\s*팝업(\s*스토어)?\s*$/, '').trim(),
    title: rec.title,
    subject_type: subjectTypeOf(rec),
    kind: cafe ? 'birthday_cafe' : 'popup',
    starts_on: rec.openDate,
    ends_on: rec.closeDate,
    ...(rec.operationTime?.length ? { open_hours: rec.operationTime.join(' / ') } : {}),
    // 공식 원문이 있으면 그쪽으로 보낸다. 팝가 링크는 백업으로 남긴다 —
    // 사용자를 공급처로 보내는 것이 정합성 방어의 핵심이다 (poc-plan 1번)
    source_url: rec.instagram || rec.website || rec.source_url,
    ...(rec.instagram || rec.website ? { listing_url: rec.source_url } : {}),
    ...(rec.preReservationLink ? { reservation_url: rec.preReservationLink } : {}),
    ...(rec.image ? { image_url: rec.image } : {}),
    ...(rec.benefits?.length
      ? { perks: rec.benefits.map((b) => `${b.key}: ${b.value}`).join('\n') }
      : {}),
    ...(rec.notice ? { conditions: rec.notice } : {}),
    // 팝가가 정리한 것을 우리가 다시 정리했다. 공식 채널에서 직접 받은 것이 아니므로
    // official 로 올리지 않는다 (poc-plan 1번 정합성 교란 방어)
    trust: 'parsed',
    goods: [],
  }
}

/**
 * 오프메이트 레코드 → 이벤트.
 *
 * 아티스트가 구조화돼 있어 K-pop 화이트리스트가 필요 없고,
 * 좌표도 들어 있어 지오코딩이 필요 없다.
 */
function offmateToEvent(rec) {
  const address = rec.address ?? ''
  const hours =
    rec.startAt && rec.endAt ? `${rec.startAt} ~ ${rec.endAt}` : null

  // 주최자 계정이 원문이다. 없으면 오프메이트 상세로 떨어진다
  const host =
    rec.snsType === 'twitter' && rec.twitterId
      ? `https://x.com/${rec.twitterId.replace(/^@/, '')}`
      : rec.instagramId
        ? `https://www.instagram.com/${rec.instagramId.replace(/^@/, '')}`
        : null

  const perkCount =
    rec.specialGoods.length + rec.firstComeGoods.length + rec.optionalSpecialGoods.length

  return {
    id: `om_${rec.id}`,
    place: {
      // 생카는 카페가 장소다. 생카 이름(rec.name)은 이벤트명이지 장소명이 아니다
      name: rec.cafeName || address || rec.name || '장소 미정',
      address,
      lat: rec.latitude,
      lng: rec.longitude,
      district: districtOf(address),
      kind: 'cafe',
    },
    // 멤버명이 대상이다. 그룹명은 검색·필터에서 쓰이도록 제목에 남긴다
    subject: rec.memberName ?? rec.groupName ?? rec.name ?? '',
    title: [rec.groupName, rec.memberName, rec.name].filter(Boolean).join(' · '),
    subject_type: 'idol',
    kind: 'birthday_cafe',
    starts_on: rec.startDate,
    ends_on: rec.endDate,
    ...(hours ? { open_hours: hours } : {}),
    // 특전 이름 매핑은 아직 없다. 개수만으로도 "특전 N종"이 표시된다
    ...(perkCount ? { perks: `특전 ${perkCount}종` } : {}),
    source_url: host ?? rec.source_url,
    ...(host ? { listing_url: rec.source_url } : {}),
    ...(rec.images?.[0] ? { image_url: rec.images[0] } : {}),
    trust: rec.isHostVerified ? 'partner' : 'parsed',
    goods: [],
  }
}

const today = new Date().toISOString().slice(0, 10)

const popgaRecords = readRecords(IN_POPGA)
const offmateRecords = readRecords(IN_OFFMATE)

const rows = popgaRecords
  .filter((r) => (r.roadAddress || r.address || '').startsWith(SEOUL_PREFIX))
  .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
  .filter((r) => r.closeDate >= today) // 끝난 것은 목록에서 뺀다 (poc-plan 4.3)
  .map((r) => ({ rec: r, artist: matchArtist(r), cafe: parseBirthdayCafe(r.title) }))
  // 생일카페는 그 자체가 팬덤 행사라 화이트리스트를 통과시킨다.
  // 멤버 이름이 목록에 없어도 "○○ 생일카페"면 K-pop 행사로 본다
  .filter(({ artist, cafe }) => KEEP_ALL || artist || cafe)

// 오프메이트는 전국이라 서울만 남긴다. 좌표가 없으면 지도에 못 찍으니 제외한다
const cafeEvents = offmateRecords
  .filter((r) => (r.address ?? '').startsWith('서울'))
  .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
  .filter((r) => r.endDate >= today)
  .map(offmateToEvent)

const all = [...rows.map(({ rec, artist }) => toEvent(rec, artist)), ...cafeEvents]

/**
 * 원문을 못 찾은 것은 싣지 않는다.
 *
 * 두 소스 모두 주최자 계정이 없으면 `source_url` 이 리스팅 주소로 떨어진다.
 * 그대로 두면 화면의 "공식 공지 보기" 가 경쟁 리스팅으로 연결된다 — 출처를
 * 속이는 것이고, 앱에 원문 링크를 반드시 노출한다는 규칙도 깨진다.
 *
 * 빼는 쪽을 고른 이유: 링크 없이 정보만 실으면 사용자가 확인할 방법이 없다.
 * 커버리지가 조금 줄더라도 실린 것은 전부 원문으로 이어지는 편이 낫다.
 */
const isListing = (url) => !url || /popga\.co\.kr|offmate/.test(url)
const events = all.filter((e) => !isListing(e.source_url))
const dropped = all.length - events.length

events.sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(events, null, 2) + '\n', 'utf8')

const byDistrict = {}
for (const e of events) byDistrict[e.place.district] = (byDistrict[e.place.district] ?? 0) + 1

const popupCount = events.filter((e) => e.kind === 'popup').length

console.log(
  `팝가 ${popgaRecords.length} + 오프메이트 ${offmateRecords.length} → ` +
    `서울·진행중${KEEP_ALL ? '' : '·K-pop'} ${events.length}건 ` +
    `(팝업 ${popupCount} · 생카 ${events.length - popupCount})`,
)
// 조용히 줄어들면 수집이 깨진 것과 구분되지 않는다. 항상 드러낸다
if (dropped) console.log(`원문 없어 제외: ${dropped}건`)
console.log('구역별:', byDistrict)
console.log(`저장: ${OUT}`)
