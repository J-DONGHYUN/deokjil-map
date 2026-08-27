# src/data

## events.json

앱이 읽는 **유일한 이벤트 소스**. 빌드타임에 번들된다.

> **현재 들어있는 것은 샘플 8건이다.**
> Day 1 수집 결과가 나오면 이 파일을 통째로 교체한다.
> 화면 코드는 이 파일의 내용을 가정하지 않으므로 교체만으로 끝난다.

샘플은 실제 일정이 아니다. 대상·장소명은 가상이고 `source_url`은 전부 `example.com`이다.
실제 일정으로 오인될 여지를 없애기 위한 것이므로, **실 데이터를 넣을 때까지 이 규칙을 유지한다.**

### 샘플이 커버하는 경우의 수

필터·표시 로직을 전부 태우도록 구성했다.

| 축 | 포함된 값 |
| --- | --- |
| `district` | hongdae(3) · hapjeong(2) · seongsu(2) · gangnam(1) |
| `kind` | birthday_cafe(6) · popup(2) |
| `subject_type` | idol(6) · virtual(1) · character(1) — 아이돌에 묶지 않는 스키마 확인용 |
| `trust` | parsed(6) · official(2) |
| 기간 | 종료 임박(evt_0004) · 진행 중 · 주말만 · 다음 주 시작 |
| `goods` | 팝업 2건만 보유. 생카는 빈 배열 |

`evt_0004`는 **오늘 종료**되도록 잡아뒀다. 종료 임박 표시와 날짜 필터 경계를 확인하는 용도다.

### 파이프라인

```
① 소스 링크 수집 (수동)
② 안내 이미지·텍스트 → 구조화 JSON (Claude 배치)
③ 주소 → 좌표 지오코딩 (scripts/geocode.mjs, 카카오 로컬 API)
④ events.json 커밋
```

원본(트윗 덤프, 안내 이미지)은 `data/raw/`에 두고 **커밋하지 않는다** — `.gitignore` 처리됨.
안내 이미지 자체를 재게시하지 않는다는 원칙(poc-plan 4.4) 때문이다.

### 스키마

`src/types.ts`의 `EventItem`이 정본이다.
전체 구상(bridge-plan-full.md 7번) Postgres 스키마와 필드명을 일치시켜 두었으므로,
PoC 통과 후 승격 시 매핑 없이 그대로 넘어간다.
