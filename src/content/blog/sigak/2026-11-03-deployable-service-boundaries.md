---
title: "로컬에서 켜진 앱을 배포 가능한 서비스로 확인하기"
date: "2026-11-03"
type: "architecture"
project: "sigak"
tags: ["Infra", "Backend", "Architecture", "Testing"]
summary: "화면이 열린다는 사실과 서비스를 다른 서버에서 재현할 수 있다는 사실은 달랐습니다. 소스 이미지·단일 공개 경로·분리된 데이터 볼륨·자동 수집을 어떤 근거로 확인했는지 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-deployable-service-boundaries.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-02-url-source-registry-and-archive-retention", "sigak/2026-11-02-on-demand-ai-summary-budget"]
---

# 로컬에서 켜진 앱을 배포 가능한 서비스로 확인하기

> 개발 환경의 실행 상태를 옮겨 놓는 대신, 소스에서 이미지를 만들고 공개 요청·운영 요청·저장 데이터를 나눴다. 임시 외부 접속과 상시 운영의 검증 범위도 구분했다.

## 화면이 열린 뒤에 남은 질문

Sigak은 React, Spring Boot, FastAPI와 여러 저장소를 함께 사용한다. 개발 환경에서 이 서비스들이 켜져 있다는 사실만으로는 다른 서버에서도 같은 상태를 만들 수 있는지 알 수 없었다. 브라우저가 어떤 주소를 호출해야 하는지, DB와 검색 엔진의 포트를 공개해도 되는지, 기존 데이터가 어디에 남는지도 정해야 했다.

사용할 서버와 도메인은 아직 없었다. 먼저 한 서버로 이전할 수 있는 구성을 만들고, 로컬과 임시 외부 주소에서 HTTP 경계를 확인했다. 이 글은 2026-10-30 작업 기록과 현재 배포 파일을 대조한 설명이다. 이번 글을 위해 새 서버를 만들거나 운영 앱을 다시 배포하지 않았다.

## 배포 구성이 맡을 일을 좁혔다

| 선택지 | 얻는 것 | 감수할 점 |
| --- | --- | --- |
| 개발 Compose를 그대로 공개 | 기존 실행 구성을 재사용 | 개발용 host 포트와 운영 경로까지 노출할 수 있음 |
| 화면과 API를 따로 배포 | 각각의 배포 주기를 분리 | 공개 주소·CORS·API 접근 설정을 함께 관리해야 함 |
| 별도 단일 서버 Compose와 Caddy | 한 공개 주소와 내부 서비스 연결을 재현 | 한 서버에 묶인 장애와 자원 한계 |

세 번째를 택했다. Spring을 유일한 공개 API 경계로 유지하고 FastAPI는 내부 AI 역할에 집중한다. 클라우드별 관리 기능을 먼저 늘리기보다 소스 빌드와 네트워크·데이터 경계를 검증하려는 선택이었다.

```txt
브라우저
  -> Caddy
       ├─ 정적 React 파일과 화면 경로
       └─ 허용한 공개 API -> Spring Boot
                              ├─ PostgreSQL
                              ├─ 검색·그래프 저장소
                              └─ 내부 FastAPI
```

현재 `infra/deploy/compose.yml`은 web에만 host 포트를 지정한다. 기본 bind는 `127.0.0.1`, HTTP 포트는 8088이다. DB·검색 엔진·AI는 이 배포 파일에서 host 포트를 갖지 않는다. 서버를 옮길 때는 이 네트워크 분리와 함께 방화벽·관리자 인증도 확인해야 한다.

## SPA fallback보다 API 제한을 먼저 적용했다

화면 경로의 새로고침은 `index.html`로 돌아와야 한다. 하지만 모든 알 수 없는 경로를 화면으로 바꾸면 내부 API를 요청해도 정상 HTML 응답을 받을 수 있다. 접근을 차단했는지 요청 경로가 틀렸는지 알아보기 어려워진다.

Caddy의 `route`에서 API 제한을 화면 fallback보다 먼저 처리했다. 현재 설정은 처음 배포 때의 ‘공개 조회만 허용’에서 요약 요청 한 경로가 추가된 상태다.

| 요청 | 현재 처리 |
| --- | --- |
| 허용된 기사·연구 GET/HEAD | Spring으로 전달 |
| 기사 한 건의 요약 POST | 지정한 경로만 Spring으로 전달 |
| 그 외 API 쓰기 요청 | 405 |
| 내부·알 수 없는 API의 GET/HEAD | 404 |
| 화면 경로 | 정적 파일 또는 `index.html` |

‘모든 POST를 차단한다’고 설명하면 지금 코드를 잘못 읽은 것이다. 요약 POST는 필요하지만 수집·rebuild 같은 운영 작업은 공개 경로에서 허용하지 않는다. Spring 쪽의 Origin 검사와 작업·예산 제한도 별도로 적용된다.

## 새 배포 DB와 개발 DB를 섞지 않았다

PostgreSQL은 원본이고 검색·그래프 저장소는 다시 만들 수 있는 projection이다. 그래도 배포 구성을 만들었다고 개발 DB가 자동으로 복사되지는 않는다.

초기 기록에서 개발 DB는 41개 기사였지만 새 배포 DB는 seed 5개로 시작했다. Compose 프로젝트와 named volume을 분리한 결과다. 두 값은 그때의 초기 관측으로 한정한다.

중지·재시작은 데이터를 보존하는 작업과 구분한다. 기존 DB가 있는 상태에서 환경 파일의 비밀번호만 바꿔도 DB 사용자 값이 자동으로 바뀌는 것은 아니다. 실제 환경 파일은 Git에서 제외하고, 예시 파일에는 필요한 설정 이름만 남겼다.

이 구조는 단일 서버 재시작과 데이터 분리를 다룬다. 자동 백업과 복원 시험, 여러 서버의 고가용성까지 확인한 구성은 아니다.

## 소스 빌드는 개발 머신 밖의 조건을 드러냈다

당시 이미지 빌드에서는 두 문제가 드러났다. 선택한 JDK Alpine 태그가 이 ARM 호스트를 지원하지 않아 Jammy 기반으로 바꿨고, Linux의 깨끗한 의존성 설치에서는 개발 머신에 이미 설치된 상태로 보이지 않던 lockfile 항목 누락을 확인했다.

현재 backend Dockerfile은 JDK 빌드 단계에서 `bootJar`를 만들고 JRE 단계에 옮긴다. 실행 사용자를 별도로 두고, 연구 API가 읽는 보존된 실험 자료도 이미지에 포함한다. 단순히 노트북의 실행 디렉터리를 복사해 작동을 기대하는 방식과 구분했다.

과거 이미지 빌드 성공은 지금 새 환경에서 다시 빌드한 증거가 아니다. 2026-11-02 기록에는 외부 Gradle 다운로드 때문에 깨끗한 backend Docker 소스 빌드가 후속으로 남아 있다. 이 글에서도 해당 재현을 완료했다고 쓰지 않았다.

## 자동 수집은 완료한 뒤 10분을 기다린다

처음 배포 구성을 만들 때는 수집 예약이 없었고, 후속 작업에서 기존 Spring 수집 파이프라인에 연결했다. 개발 기본값은 off, 배포 기본값은 on이다. 초기 대기는 30초이고, 완료한 뒤 10분을 기다리는 fixed-delay 방식이다.

따라서 벽시계의 매 정각·10분마다 시작하는 스케줄과 다르다. 수집이 오래 걸리면 다음 시작도 그만큼 늦어진다. 단일 backend 안에서 중복 실행을 막고, 부분 저장이나 projection 실패가 남으면 다음 회차에서 복구할 상태를 확인한다.

수집 출처는 별도의 registry 정책을 따른다. 초기 기록의 여섯 출처와 토스·우아한형제들·D2로 좁힌 최근 운영 기록을 구분해야 한다. 이번 배치에서는 활성 목록을 실서버에서 다시 조회하지 않았다.

## 검증: HTTP 경계, 소스 검사, 상시 운영을 구분했다

초기 2026-10-30 기록에는 source image 빌드, Caddy 설정 검사, 로컬 HTTP smoke 6개와 임시 HTTPS 주소에서 같은 6개 검사를 통과한 결과가 있다. 요약 POST가 추가된 후에는 smoke가 7개로 늘었다. 서로 다른 시점의 검사 수를 한 번의 결과처럼 합치지 않았다.

이번 2026-11-03 배치에서는 backend 344개·`check`, frontend 70개·lint/build, AI 70개와 평가 fixture를 실행해 통과를 확인했다. 운영 서비스·수집 예약·projection을 다시 실행하거나 새 이미지를 배포한 것은 아니다.

```bash
# 저장소 루트: 운영 서비스와 분리된 기존 테스트
./backend/gradlew -p backend test check

# 아래 HTTP smoke는 과거 배포 관측 때 실행한 명령이다.
# 이 글 작성에서는 재실행하지 않았다.
python3 infra/deploy/smoke_test.py http://127.0.0.1:8088
```

임시 터널은 외부에서 접근할 경로가 있다는 증거다. 컴퓨터와 터널 프로세스를 계속 켜 둬야 하는 상태를 상시 호스팅이나 사용자 도메인의 TLS 운영과 같다고 보지는 않았다. 장기 수집 성공률과 지연 분포, 서버 자원 여유도 추가 관측이 필요하다.

## 코드와 운영 기록에서 다시 볼 것

| 근거 | 확인할 판단 |
| --- | --- |
| [배포 Compose](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/infra/deploy/compose.yml) | 어떤 포트를 공개하고 데이터를 어디에 남기는가 |
| [Caddy 경로](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/infra/deploy/Caddyfile) | API 제한과 화면 fallback을 어떤 순서로 적용하는가 |
| [backend 이미지](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/Dockerfile) | 소스·실험 자료·실행 환경을 어떻게 재현하는가 |
| [HTTP smoke](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/infra/deploy/smoke_test.py) | HTTP 결과로 어떤 경계를 검사하는가 |
| [자동 수집](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/CollectionAutomationService.kt) | 실패 뒤 다음 실행에서 무엇을 복구하는가 |
| [초기 실행 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-10-30-dev-log.md) | 이미지·로컬 HTTP·임시 외부 접속의 관측을 구분했는가 |

다시 설명할 질문은 세 가지다. 개발 설정을 그대로 공개하지 않은 이유는 무엇인가? 외부 URL을 열 수 있는 것과 상시 운영을 검증한 것은 어떻게 다른가? PostgreSQL 원본을 남긴 채 projection 실패를 복구하려면 어떤 상태가 필요한가?

배포 구성과 검사·기록 정리에는 Codex를 활용했다. 이 글은 실제 파일과 관측 범위를 설명하며 클라우드 자원 구매나 상시 서버 운영 경험을 추가한 글은 아니다.
