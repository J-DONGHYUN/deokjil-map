# crawler

이벤트 데이터 수집기. 앱과 분리돼 있고 로컬에서만 돌린다.

```
node crawler/run.mjs --limit 600 --days 75   # 수집 → data/raw/crawl/popga.json
node crawler/to-events.mjs                   # 정규화 → src/data/events.json
node crawler/to-events.mjs --all             # K-pop 필터 없이 전부
```

## 원칙

수집 자체보다 **어떻게 수집하느냐**가 이 프로젝트의 리스크다.
아래는 지키기로 한 선이며, 편의를 위해 낮추지 않는다.

1. **robots.txt 를 실행 전에 확인한다.** `run.mjs` 는 대상 경로가 허용되지 않으면
   아무것도 하지 않고 종료한다. 우회하지 않는다.
2. **자신을 밝힌다.** User-Agent 에 프로젝트명과 저장소 주소를 넣는다.
   브라우저인 척하지 않는다.
3. **요청 간격을 둔다.** 700ms 고정. 상대 서버에 부하를 주지 않는 것이 목적이지
   차단을 피하려는 것이 아니다.
4. **차단된 경로는 건드리지 않는다.** 팝플리의 `/api/` 처럼 robots.txt 가
   막아둔 경로는 접근하지 않는다. 내부 API 를 직접 호출하지 않는다.
5. **원본을 재게시하지 않는다.** 수집 원본은 `data/raw/` 에만 두고 커밋하지 않는다.
   앱에는 사실 정보(장소·기간·시간)만 싣고 **원문 링크를 반드시 노출**한다.
6. **출처를 속이지 않는다.** 팝가에서 온 데이터의 `source_url` 은 팝가 링크이고
   `trust` 는 `parsed` 다. 확인하지 않은 것을 `official` 로 올리지 않는다 —
   그 표기가 틀리면 poc-plan 1번의 정합성 방어가 통째로 무너진다.

## robots.txt 확인 결과 (2026-08-27)

| 사이트 | 규칙 | 판단 |
| --- | --- | --- |
| popga.co.kr | `User-Agent: * / Allow: /`, 차단은 `/login`·`/enterprise*` | `/popup/*` **허용** |
| popply.co.kr | `User-agent: * / Allow: /`, `Disallow: /api/`. ClaudeBot 명시 허용 | 페이지 허용, **API 금지** |
| dukplace.com | 봇별로 분리, 일부 크롤러 차단 | **수집 대상에서 제외** |

## 소스

### popga (`sources/popga.mjs`)

- 색인: `sitemap/2.xml` — 팝업 상세 2,800건 이상, `lastmod` 포함
- 상세는 서버 렌더링. Next.js RSC 페이로드 안에 팝업 레코드가 JSON 으로 들어 있다
- **좌표(`latitude`/`longitude`)가 포함돼 지오코딩이 필요 없다**
- 뽑는 필드: `title` `periodType` `openDate` `closeDate` `operationTime`
  `categories` `tags` `address` `roadAddress` `addressDetail` `latitude` `longitude`

RSC 페이로드 형식은 Next 버전에 따라 바뀔 수 있다. 필드명 앵커로 잘라내는 방식이라
전체 구조가 바뀌어도 필드명만 유지되면 계속 동작한다. 깨지면 `extract()` 만 고치면 된다.

### 검토했으나 쓰지 않는 것

- **팝플리** — 상세 페이지에 schema.org `Event` JSON-LD 가 있어 품질이 좋지만,
  사이트맵에 상세 URL 이 없어 색인을 만들 수 없다. 검색 페이지는 JS 렌더링이고
  내부 API 는 robots.txt 가 막았다. ID 순회는 무차별 스캔이라 하지 않는다
- **덕플레이스** — robots.txt 가 일부 크롤러를 막고 있고 403 을 반환한다
- **카카오 검색 API** — REST 키로 동작 확인. 생일카페 관련 문서가 잡히지만
  커뮤니티 잡담이 섞여 정밀도가 낮다. 생카 보강용으로 남겨둔다
- **X / 인스타그램** — 로그인 벽. poc-plan 5.3 대로 X API 는 쓰지 않는다

## 수집과 가공의 분리

`run.mjs` 는 원본을 그대로 저장하고, `to-events.mjs` 가 필터·정규화를 한다.
필터 기준을 바꿀 때 상대 서버를 다시 두드리지 않기 위한 분리다.

`to-events.mjs` 가 하는 일:

- 서울 밖 제외, 좌표 없는 것 제외
- **종료된 것 제외** — 지난 정보는 없는 정보보다 나쁘다 (poc-plan 4.3)
- K-pop 판정 — 카테고리(`연예인/셀럽` 등) 또는 태그로 1차 필터.
  팝가는 K-pop 여부를 구분하지 않으므로 **재현율을 우선**하고 정밀도는 사람이 올린다
- 주소·태그로 구역(`hongdae`/`hapjeong`/`seongsu`/…) 판정

## 남은 한계

**굿즈 품목 마스터가 없다.** 팝가 레코드에 굿즈 목록이 없어서 `goods` 는 빈 배열이다.
P1 홍보 훅이 "팝업 굿즈 품절 현황"이므로, 굿즈 라인업은 **팝업 공식 계정 스크린샷**을
`data/raw/popup/` 에 넣어 따로 채워야 한다.

**생카가 비어 있다.** 생카는 X·인스타가 원본이라 자동 수집 경로가 없다.
`data/raw/saengka/` 에 안내 이미지를 넣으면 파싱해서 채운다.
