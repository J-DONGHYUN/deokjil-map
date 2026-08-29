/**
 * 서울시 주요 121장소 → 우리 구역 매핑표 생성.
 *
 *   node scripts/hotspots.mjs
 *
 * 서울시 실시간 인구데이터 API 는 좌표가 아니라 **정해진 121곳의 이름·코드**로만
 * 조회된다. 우리 구역(hongdae·seongsu…)은 주소를 보고 우리가 붙인 이름이라
 * 서울시 목록과 아무 관계가 없다. 그 둘을 잇는 표가 없으면 API 를 부를 수가 없다.
 *
 * 열린데이터광장 OA-21778 의 공개 첨부파일 두 개를 쓴다.
 *   - 목록 xlsx : AREA_CD · AREA_NM · CATEGORY
 *   - 영역 zip  : 121곳의 폴리곤(WGS84). 좌표계가 우리와 같아 변환이 필요 없다
 *
 * 원본은 data/raw/ 에만 두고 커밋하지 않는다 (CLAUDE.md).
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const RAW = 'data/raw/hotspots'
const OUT = 'src/data/hotspots.json'
const EVENTS = 'src/data/events.json'
const DOWNLOAD = 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false'
// 크롤러 원칙 2 — 자신을 밝힌다. 브라우저인 척하지 않는다
const UA = 'moyeora-deok/0.1 (+https://github.com/J-DONGHYUN/deokjil-map)'

/** 열린데이터광장 첨부파일 내려받기 */
async function fetchFile(seq, dest) {
  if (existsSync(dest)) return console.log(`  건너뜀 (이미 있음) ${dest}`)
  const res = await fetch(DOWNLOAD, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ infId: 'OA-21778', seq: String(seq), infSeq: '2' }),
  })
  if (!res.ok) throw new Error(`다운로드 실패 seq=${seq}: ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`  받음 ${dest}`)
}

/** xlsx 는 zip + XML 이다. 의존성을 늘리지 않으려고 직접 읽는다 */
function readXlsx(path) {
  const dir = `${RAW}/xlsx`
  execSync(`rm -rf "${dir}" && mkdir -p "${dir}" && unzip -q -o "${path}" -d "${dir}"`)
  const shared = readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8')
  const strs = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
  )
  const sheet = readFileSync(`${dir}/xl/worksheets/sheet1.xml`, 'utf8')
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
    [...r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => {
      const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
      if (v === undefined) return ''
      return /t="s"/.test(c[1]) ? strs[+v] : v
    }),
  )
}

/** 셰이프파일(.shp/.dbf). 폴리곤과 속성만 있으면 되므로 최소한만 읽는다 */
function readShapefile(dir) {
  const base = readdirSync(dir).find((f) => f.endsWith('.shp')).slice(0, -4)

  const dbf = readFileSync(`${dir}/${base}.dbf`)
  const nRec = dbf.readUInt32LE(4)
  const headLen = dbf.readUInt16LE(8)
  const recLen = dbf.readUInt16LE(10)
  const fields = []
  for (let p = 32; dbf[p] !== 0x0d; p += 32) {
    fields.push({ name: dbf.toString('utf8', p, p + 11).replace(/\0.*$/, ''), len: dbf[p + 16] })
  }
  const attrs = []
  for (let i = 0; i < nRec; i++) {
    let off = headLen + i * recLen + 1
    const row = {}
    for (const f of fields) {
      row[f.name] = dbf.toString('utf8', off, off + f.len).trim()
      off += f.len
    }
    attrs.push(row)
  }

  const shp = readFileSync(`${dir}/${base}.shp`)
  const total = shp.readInt32BE(24) * 2
  const shapes = []
  let p = 100
  while (p < total) {
    const len = shp.readInt32BE(p + 4) * 2
    const c = p + 8
    if (shp.readInt32LE(c) === 5) {
      const nParts = shp.readInt32LE(c + 36)
      const nPts = shp.readInt32LE(c + 40)
      const parts = []
      for (let i = 0; i < nParts; i++) parts.push(shp.readInt32LE(c + 44 + i * 4))
      const ptStart = c + 44 + nParts * 4
      const pts = []
      for (let i = 0; i < nPts; i++) {
        pts.push([shp.readDoubleLE(ptStart + i * 16), shp.readDoubleLE(ptStart + i * 16 + 8)])
      }
      shapes.push(parts.map((s, i) => pts.slice(s, i + 1 < parts.length ? parts[i + 1] : nPts)))
    } else {
      shapes.push([])
    }
    p = c + len
  }
  return attrs.map((a, i) => ({ ...a, rings: shapes[i] }))
}

const R = 6371
const rad = (x) => (x * Math.PI) / 180
const distKm = (p, q) => {
  const a = Math.sin(rad(q[1] - p[1]) / 2) ** 2 +
    Math.cos(rad(p[1])) * Math.cos(rad(q[1])) * Math.sin(rad(q[0] - p[0]) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
const inRing = (p, r) => {
  let hit = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
/** 부호 없는 대략 면적. 폴리곤이 겹칠 때 더 좁은(구체적인) 쪽을 고르는 데 쓴다 */
const ringArea = (rings) =>
  Math.abs(rings.reduce((s, r) => {
    let t = 0
    for (let i = 0; i < r.length; i++) {
      const [x1, y1] = r[i]
      const [x2, y2] = r[(i + 1) % r.length]
      t += x1 * y2 - x2 * y1
    }
    return s + t / 2
  }, 0))

/**
 * 라벨을 얹을 대표 좌표.
 *
 * 면적 중심(centroid)을 쓰되, 오목한 모양이면 중심이 영역 밖으로 떨어질 수 있다.
 * 그때는 꼭짓점 평균으로 물러선다 — 라벨이 엉뚱한 동네에 찍히는 것보다 낫다.
 */
function centerOf(rings) {
  const ring = rings.reduce((a, b) => (a.length >= b.length ? a : b), [])
  let cx = 0
  let cy = 0
  let a2 = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const cross = x1 * y2 - x2 * y1
    a2 += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }
  if (a2 !== 0) {
    const c = [cx / (3 * a2), cy / (3 * a2)]
    if (rings.some((r) => inRing(c, r))) return c
  }
  const n = ring.length || 1
  return [
    ring.reduce((s, p) => s + p[0], 0) / n,
    ring.reduce((s, p) => s + p[1], 0) / n,
  ]
}

/** 좌표 소수 자리. 5자리면 약 1m 라 도시 구역을 그리는 데 넘친다 */
const COORD_DIGITS = 5
const round = (rings) =>
  rings.map((r) => r.map((p) => [+p[0].toFixed(COORD_DIGITS), +p[1].toFixed(COORD_DIGITS)]))

/**
 * 영역 밖 좌표를 위한 보정.
 * 121곳 폴리곤은 상권 핵심만 덮어 가장자리가 비어 있다 —
 * 용산 이벤트 21건이 전부 용산역 영역 밖으로 떨어졌는데 실제 거리는 250~340m 였다.
 */
const NEAR_KM = 0.5

async function main() {
  mkdirSync(RAW, { recursive: true })
  console.log('① 원본 내려받기')
  await fetchFile(15, `${RAW}/places121.xlsx`)
  await fetchFile(16, `${RAW}/areas121.zip`)

  console.log('② 파싱')
  const rows = readXlsx(`${RAW}/places121.xlsx`).slice(1).filter((r) => r[2])
  const catOf = Object.fromEntries(rows.map((r) => [r[2], r[0]]))

  const areaDir = `${RAW}/areas`
  execSync(`rm -rf "${areaDir}" && mkdir -p "${areaDir}" && unzip -q -o "${RAW}/areas121.zip" -d "${areaDir}"`)
  const shpDir = `${areaDir}/${readdirSync(areaDir)[0]}`
  const areas = readShapefile(shpDir).map((a) => ({ ...a, size: ringArea(a.rings) }))
  console.log(`  장소 ${rows.length}곳 · 영역 ${areas.length}개`)

  console.log('③ 이벤트를 관측소에 배정')
  const events = JSON.parse(readFileSync(EVENTS, 'utf8'))
  const assign = (e) => {
    const p = [e.place.lng, e.place.lat]
    const inside = areas.filter((a) => a.rings.some((r) => inRing(p, r))).sort((x, y) => x.size - y.size)
    if (inside.length) return inside[0]
    const best = areas
      .map((a) => ({ a, d: Math.min(...a.rings.flatMap((r) => r.map((v) => distKm(p, v)))) }))
      .sort((x, y) => x.d - y.d)[0]
    return best && best.d <= NEAR_KM ? best.a : null
  }

  // 'etc'(그 외 서울)는 강동·서대문처럼 서로 먼 곳이 섞인 자루라
  // 관측소 하나로 대표할 수 없다. 이 구역은 혼잡도를 표시하지 않는다
  const SKIP = new Set(['etc'])

  const tally = {}
  for (const e of events) {
    if (SKIP.has(e.place.district)) continue
    const a = assign(e)
    if (!a) continue
    tally[e.place.district] ??= {}
    tally[e.place.district][a.AREA_CD] = (tally[e.place.district][a.AREA_CD] ?? 0) + 1
  }

  /**
   * 구역별 대표 관측소.
   *
   * 한 관측소가 두 구역을 대표하지 못하게 막는다. 서울시 '홍대 관광특구' 영역이
   * 넓어서 우리 합정 이벤트 15건 중 10건까지 삼키는데, 그대로 두면 홍대와 합정
   * 칩이 같은 숫자를 보여줘 비교가 무의미해진다. 이벤트가 많은 구역이 먼저 가져가고
   * 나머지는 차순위로 내려간다.
   */
  const nameOf = Object.fromEntries(areas.map((a) => [a.AREA_CD, a.AREA_NM]))
  const order = Object.entries(tally)
    .map(([d, m]) => [d, m, Object.values(m).reduce((s, n) => s + n, 0)])
    .sort((a, b) => b[2] - a[2])

  const taken = new Set()
  const map = {}
  const report = []
  for (const [district, m, total] of order) {
    const ranked = Object.entries(m).sort((a, b) => b[1] - a[1])
    const pick = ranked.find(([cd]) => !taken.has(cd))
    if (!pick) {
      report.push([district, total, '없음 (관측소가 이미 다른 구역에 배정됨)'])
      continue
    }
    taken.add(pick[0])
    const shape = areas.find((a) => a.AREA_CD === pick[0])
    map[district] = {
      code: pick[0],
      name: nameOf[pick[0]],
      category: catOf[pick[0]] ?? '',
      // 실시간 지도가 구역을 색으로 칠하는 데 쓴다. 9곳이라 20KB 남짓이다
      center: centerOf(shape.rings),
      rings: round(shape.rings),
    }
    const share = ranked.map(([cd, n]) => `${nameOf[cd]} ${n}`).join(' · ')
    report.push([district, total, `${nameOf[pick[0]]} (${pick[1]}/${total})   [${share}]`])
  }

  console.log('\n구역        건수   대표 관측소')
  for (const [d, n, s] of report) console.log(`  ${d.padEnd(11)}${String(n).padStart(4)}   ${s}`)

  // 좌표 배열만 한 줄로 눌러 쓴다. 들여쓰기를 그대로 두면 파일이 세 배가 되는데,
  // 이 파일은 번들에 그대로 실려서 사용자가 내려받는 용량이 된다
  const RINGS = '@@RINGS@@'
  let out = JSON.stringify(
    {
      source: '서울 열린데이터광장 OA-21778 · 주요 121장소 목록/영역',
      note: 'scripts/hotspots.mjs 로 생성한다. 손으로 고치지 말 것',
      districts: Object.fromEntries(
        Object.entries(map).map(([k, v]) => [k, { ...v, rings: `${RINGS}${k}` }]),
      ),
    },
    null,
    2,
  )
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(`"${RINGS}${k}"`, JSON.stringify(v.rings))
  }
  writeFileSync(OUT, out + '\n')
  const kb = Math.round(readFileSync(OUT).length / 1024)
  console.log(`\n저장: ${OUT} (${Object.keys(map).length}개 구역 · ${kb}KB)`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
