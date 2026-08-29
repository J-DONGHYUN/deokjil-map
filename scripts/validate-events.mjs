/**
 * events.json 배포 전 검증.
 *
 * 자동 갱신(.github/workflows/refresh-data.yml)은 사람이 안 보는 새벽에 돈다.
 * 팝가가 페이로드 형식을 바꾸면 crawler/sources/popga.mjs 의 정규식 추출이
 * 조용히 빈 값을 뱉는데, 그대로 커밋되면 틀린 데이터가 배포된다.
 *
 * 여기서 걸러 실패시킨다 — 낡은 데이터가 남는 편이 틀린 데이터보다 낫다.
 */
import { readFileSync } from 'node:fs'

const PATH = process.argv[2] ?? 'src/data/events.json'
const events = JSON.parse(readFileSync(PATH, 'utf8'))
const problems = []

/** 수집이 통째로 깨졌는지. 서울 생카·팝업이 이보다 적은 날은 없었다 */
const FLOOR = 30
if (events.length < FLOOR) {
  problems.push(`이벤트가 ${events.length}건뿐이다 (최소 ${FLOOR}건 기대). 수집이 깨졌을 가능성이 높다`)
}

for (const e of events) {
  const at = `${e.id} (${e.subject})`

  // 출처를 속이지 않는다 — CLAUDE.md 1번 규칙.
  // source_url 은 주최자 원문이어야 한다. 리스팅이 여기 오면 화면의
  // "공식 공지 보기" 가 경쟁 리스팅으로 연결된다
  if (!e.source_url) {
    problems.push(`${at}: source_url 이 없다`)
  } else if (/popga\.co\.kr|offmate/.test(e.source_url)) {
    problems.push(`${at}: source_url 이 리스팅이다 — ${e.source_url}`)
  }

  if (e.trust === 'official') {
    problems.push(`${at}: 확인되지 않은 것을 official 로 올렸다`)
  }

  if (!e.starts_on || !e.ends_on || e.starts_on > e.ends_on) {
    problems.push(`${at}: 기간이 뒤집혔거나 비어 있다 (${e.starts_on} ~ ${e.ends_on})`)
  }

  if (!Number.isFinite(e.place?.lat) || !Number.isFinite(e.place?.lng)) {
    problems.push(`${at}: 좌표가 없다 — 지도에 안 뜬다`)
  }
}

if (problems.length) {
  console.error(`검증 실패 — ${problems.length}건\n`)
  for (const p of problems.slice(0, 40)) console.error('  ' + p)
  if (problems.length > 40) console.error(`  ... 외 ${problems.length - 40}건`)
  process.exit(1)
}

console.log(`검증 통과 — ${events.length}건`)
