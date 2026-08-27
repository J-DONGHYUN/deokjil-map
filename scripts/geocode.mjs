/**
 * 주소 → 좌표 지오코딩 배치 (파이프라인 ③).
 *
 *   node scripts/geocode.mjs [파일경로]
 *
 * 기본 대상은 src/data/events.json.
 * place.lat / place.lng 가 비어 있는 항목만 카카오 로컬 API로 채운다.
 * 이미 좌표가 있으면 건너뛰므로 여러 번 돌려도 안전하다.
 *
 * 좌표가 틀리면 지도 제품은 통째로 죽는다 — 정합성 비검증 원칙의 유일한 예외라
 * 실패 항목을 조용히 넘기지 않고 끝에 모아 보고한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const TARGET = process.argv[2] ?? 'src/data/events.json'
const KEY = readKey()

// 카카오 로컬 API 쿼터는 넉넉하지만, 연속 호출로 순간 부하를 주지 않는다
const DELAY_MS = 120

/** 서울 대략 경계. 밖으로 찍히면 주소가 잘못 파싱된 것이라 실패로 본다 */
const SEOUL = { minLat: 37.4, maxLat: 37.72, minLng: 126.76, maxLng: 127.19 }

function readKey() {
  const fromEnv = process.env.KAKAO_REST_KEY
  if (fromEnv) return fromEnv
  try {
    const env = readFileSync('.env.local', 'utf8')
    const line = env.split(/\r?\n/).find((l) => l.startsWith('KAKAO_REST_KEY='))
    if (line) return line.slice('KAKAO_REST_KEY='.length).trim()
  } catch {
    /* .env.local 없음 */
  }
  console.error('KAKAO_REST_KEY 가 없습니다. .env.local 에 넣어주세요.')
  process.exit(1)
}

async function lookup(query, kind) {
  // address: 지번·도로명 주소용 / keyword: 상호명용
  const base =
    kind === 'address'
      ? 'https://dapi.kakao.com/v2/local/search/address.json'
      : 'https://dapi.kakao.com/v2/local/search/keyword.json'

  const res = await fetch(`${base}?query=${encodeURIComponent(query)}&size=1`, {
    headers: { Authorization: `KakaoAK ${KEY}` },
  })
  if (!res.ok) {
    const body = await res.text()
    // 카카오는 JavaScript 키를 REST 엔드포인트에 쓰면 이 메시지를 낸다.
    // 두 키 모두 32자라 눈으로 구분이 안 되므로 여기서 짚어준다.
    if (res.status === 401 && body.includes('KA Header')) {
      console.error(
        [
          '',
          '  KAKAO_REST_KEY 에 JavaScript 키가 들어간 것 같습니다.',
          '  카카오 개발자 콘솔 › 앱 설정 › 앱 키 에서 "REST API 키"를 넣어주세요.',
          '',
        ].join('\n'),
      )
      process.exit(1)
    }
    throw new Error(`카카오 API ${res.status} ${body}`)
  }

  const doc = (await res.json()).documents?.[0]
  if (!doc) return null
  return { lat: Number(doc.y), lng: Number(doc.x) }
}

function inSeoul({ lat, lng }) {
  return lat >= SEOUL.minLat && lat <= SEOUL.maxLat && lng >= SEOUL.minLng && lng <= SEOUL.maxLng
}

const events = JSON.parse(readFileSync(TARGET, 'utf8'))
const failures = []
let filled = 0
let skipped = 0

for (const ev of events) {
  const p = ev.place
  if (typeof p.lat === 'number' && typeof p.lng === 'number' && p.lat && p.lng) {
    skipped++
    continue
  }

  let hit = null
  try {
    // 주소 우선. 실패하면 상호명으로 재시도 — 신설 카페는 주소 DB에 늦게 오른다
    if (p.address) hit = await lookup(p.address, 'address')
    if (!hit && p.name) hit = await lookup(`${p.name} ${p.address ?? ''}`.trim(), 'keyword')
  } catch (err) {
    failures.push({ id: ev.id, name: p.name, reason: err.message })
    await sleep(DELAY_MS)
    continue
  }

  if (!hit) {
    failures.push({ id: ev.id, name: p.name, reason: '검색 결과 없음' })
  } else if (!inSeoul(hit)) {
    failures.push({
      id: ev.id,
      name: p.name,
      reason: `서울 밖 좌표 (${hit.lat}, ${hit.lng}) — 주소 확인 필요`,
    })
  } else {
    p.lat = hit.lat
    p.lng = hit.lng
    filled++
    console.log(`  ${ev.id} ${p.name} → ${hit.lat}, ${hit.lng}`)
  }

  await sleep(DELAY_MS)
}

writeFileSync(TARGET, JSON.stringify(events, null, 2) + '\n', 'utf8')

console.log(`\n채움 ${filled} · 건너뜀 ${skipped} · 실패 ${failures.length}`)
if (failures.length) {
  console.log('\n좌표를 못 채운 항목 — 수동 확인이 필요합니다:')
  for (const f of failures) console.log(`  ${f.id} ${f.name}: ${f.reason}`)
  process.exitCode = 1
}
