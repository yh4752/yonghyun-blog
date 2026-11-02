---
title: "RAG 평가에서 chunk보다 먼저 고정한 근거"
date: "2026-11-03"
type: "research"
project: "sigak"
tags: ["RAG", "Evaluation", "Search", "Testing", "Architecture"]
summary: "짧은 뉴스 대신 공개 운영 문서를 평가 corpus로 선택하고, chunk와 독립적인 근거·질문 쌍·사람 검토 gate를 만든 이유를 정리합니다. 70개 fixture와 3-query smoke가 보장하는 범위도 구분합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-ops-document-rag-evaluation.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation"]
---

# RAG 평가에서 chunk보다 먼저 고정한 근거

> 운영 문서의 어느 부분이 정답을 뒷받침하는지 먼저 고정하고, chunking과 검색 방식을 그 근거 위에서 비교하도록 준비했다.

## 짧은 뉴스를 나누면 무엇을 비교하게 될까

Sigak은 기술 글을 수집하고 검색·요약을 제공하는 서비스다. 기사 검색을 위한 catalog와 평가 도구는 이미 있었지만, 긴 문서를 나누어 검색하고 답변하는 RAG 실험에는 다른 입력이 필요했다.

2026년 6월 설계에 기록된 기존 41개 기사 catalog는 제목·요약·중요한 이유를 합쳐 기사당 평균 약 377자였다. 대부분이 하나의 chunk에 들어가면 fixed-size와 heading-aware chunking을 붙여도 문서 경계를 나누는 효과가 거의 드러나지 않는다. 이 수치는 당시 설계 자료의 관찰이며 현재 서비스 기사 길이를 다시 측정한 값은 아니다. [당시 문제 정의](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-20-ops-rag-evaluation-harness-design.md)

검색기를 비교하기 전에 풀어야 할 질문이 있었다. **서로 다르게 잘라 놓은 문서를 무엇을 기준으로 공정하게 채점할 것인가?** 작은 RAG 평가를 시작할 때 corpus, gold evidence, 질문 설계를 함께 검토하는 사례다.

## Corpus는 비교하고 싶은 차이가 드러나는 쪽으로 골랐다

| 선택지 | 장점 | 이번 실험에서 남는 문제 |
| --- | --- | --- |
| 기존 기사 catalog | 기사 검색 평가와 데이터를 재사용함 | 짧아서 chunk 경계의 효과를 보기 어려움 |
| 외부 공개 로봇 매뉴얼 | 긴 절차·표·경고문을 다룸 | 라이선스, PDF 파싱, 정답 검토의 범위가 커짐 |
| Sigak 공개 운영 문서 | heading·명령·장애 대응을 원문과 함께 검토함 | Markdown 중심이고 프로젝트 용어에 치우침 |

세 번째를 선택했다. 실행 방법, API 계약, projection rebuild와 fallback처럼 여러 절에 흩어진 정보를 질문으로 만들 수 있었다. 외부 문서를 추가하는 비용을 줄인 대신, 이 결과를 다른 도메인이나 PDF 전처리 성능으로 일반화하지 않는 제약을 받아들였다. [대안과 결정](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-20-ops-rag-evaluation-harness-design.md)

구현은 `experiments/rag-evaluation/`의 독립 Python 패키지에 두었다. README, 데모 흐름, API 명세 등을 포함한 공개 문서 7개만 읽고, 기존 FastAPI embedding 경계를 재사용한다. 제품의 기사 검색 API나 Elasticsearch·Qdrant index를 chunk 단위로 바꾸지는 않는다. [실행 준비 코드](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/runner.py)

## 정답은 chunk ID가 아니라 원문 위치에 둔다

Fixed-size는 token 수를 기준으로 자르고, heading-aware는 절과 문단·코드 블록을 고려한다. 두 방식은 chunk의 수와 경계가 다르다. 정답을 특정 chunk ID에 직접 달면 chunking을 바꿀 때 정답도 다시 만들어야 한다.

그래서 gold evidence에 원문 위치와 인용을 저장했다.

```txt
documentPath + headingPath + quote + quoteSha256 + evidenceId
                 ↓
각 chunking 결과에 근거를 다시 매핑
```

원문 검증은 quote의 정규화한 공백과 hash를 확인한 뒤 지정한 문서·heading 안에 그 quote가 있는지 검사한다. 문서가 바뀌어 옛 인용이 사라지면 평가가 중단된다. 다만 문자열이 존재한다는 자동 검사만으로 그 인용이 정답을 충분히 뒷받침한다고 판정하지는 않는다. [Dataset·근거 검증](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/dataset.py)

같은 명령이 ‘정상 실행’ 절과 ‘장애 복구’ 절에 반복된다고 가정해 보자. Fixed window 하나가 두 heading을 걸치면 문제가 생긴다. chunk 안에 명령이 있고 heading 목록에 장애 복구가 있다는 이유만으로 잘못된 절의 문장을 정답으로 인정할 수 있다.

현재 chunk는 heading별 실제 본문 조각을 `sourceSections`에 보존한다. 근거를 매핑할 때도 같은 문서의 **같은 heading 조각 안에 정확한 quote가 있는지** 확인한다. Heading 목록과 본문 전체를 따로 검사하지 않는다. 이 사례는 서로 다른 분할 방식의 채점을 맞추기 위해 필요한 구현이었다. [Chunk 생성과 매핑](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/chunking.py)

## 질문 60개를 독립된 정보 요구 60개로 세지 않는다

운영 문서에는 API 이름과 설정명이 많다. 질문도 그 단어를 그대로 쓰면 BM25에 유리한 구성이 될 수 있다. 준비한 dataset은 24개 answerable intent마다 lexical 질문과 semantic paraphrase를 한 개씩 둔다. 두 질문은 정답과 근거를 공유한다. 여기에 unanswerable 12개를 더해 총 60개를 구성했고, semantic 질문 중 cross-lingual 항목은 16개다. [Dataset과 작성 의도](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/README.md)

표현이 다른 두 질문도 같은 정보 요구를 공유한다. 두 개를 독립 표본처럼 세면 비교의 확실성을 부풀릴 수 있다. 구현은 질문별 점수 차이를 intent별로 묶어 평균한 뒤 intent 단위로 10,000회 bootstrap한다. 전체 평균뿐 아니라 lexical·semantic·cross-lingual·질문 유형별 slice도 남긴다. 편향을 살펴볼 도구는 준비했지만, 초안의 자연스러움과 균형은 아직 검증하지 않았다. [지표 구현](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/metrics.py), [Runner의 slice·비교](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/runner.py)

지표 이름도 정의를 함께 읽어야 한다. 이 실험의 `Recall@5`는 관련 chunk가 하나라도 검색됐는지 보는 any-hit 비율이다. 전체 gold evidence 중 몇 개를 찾았는지는 `evidenceCoverageAt5`로 나눈다. 필요한 근거가 두 개일 때 하나만 검색해도 전자는 1, 후자는 0.5가 될 수 있다. Chunk 중복 수에 따라 달라지는 분모와 원문 근거의 분모를 구별한 계약이다. [Recall·evidence coverage](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/metrics.py)

## 실패와 사람 검토를 점수 바깥으로 숨기지 않는다

현재 구현한 조합은 fixed/heading × BM25/dense/hybrid의 6개다. Embedding 호출이 실패해 dense와 hybrid가 실행되지 못하면 그 실행을 `FAILED`로 남긴다. Answerable 질문의 점수는 0으로 평균에 포함한다. 실패 행을 빼고 성공한 질문만 계산해 결과가 좋아 보이는 것을 막는다. Unanswerable은 실행 결과에는 남기되 ranking 평균에서는 제외한다. 답변 거부의 정확성을 재는 생성 평가는 아직 별도 후속 작업이다. [실행·집계 코드](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/runner.py)

사람 검토가 끝나지 않으면 전체 retrieval을 중단한다. 60개 모두 `REVIEWED`이며 `naturalnessReview=NATURAL`이어야 실행된다. `--allow-draft`는 dataset 구조·근거를 확인하는 명령의 옵션이며 전체 retrieval의 우회 옵션이 아니다. 현재 dataset v3도 **60개 모두 DRAFT, 사람 검토 0개**다. `NATURAL`이라는 필드만 보고 사람 검토가 끝났다고 읽으면 안 된다. [검증 조건](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/dataset.py), [CLI 경계](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/cli.py)

이 평가 패키지의 reranker·생성기·LLM judge·답변 calibration은 미구현이다. 전체 흐름처럼 보이는 `run` 명령도 Checkpoint B 미구현을 알리고 실패한다. 모델 설정값이나 8개 조합을 검증하는 함수가 존재한다는 사실과 그 조합을 실제 실행할 수 있다는 사실은 구분했다. [현재 범위와 후속 계획](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/README.md)

## 검증

2026-11-03 배치에서 평가 패키지의 기존 fixture 70개가 통과했다. 이는 근거 매핑·실행·집계 계약의 검사이며 사람 검토나 전체 multilingual·생성·judge 실험을 새로 실행한 것은 아니다.

아래 결과는 **2026-10-10 개발 로그에 남은 과거 실행 기록**이다. 코드·dataset·기록을 읽고 대조했다. 아래 표는 당시 실행과 관측이다. [당시 검증 기록](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-10-10-dev-log.md)

| 과거 실행 | 기록된 결과 | 보장 범위 |
| --- | --- | --- |
| 평가 패키지 `.venv/bin/python -m pytest` | 70 passed | Fixture 기반 근거 매핑·실행·집계 규칙 |
| `validate-dataset --allow-draft` | 24 intent, 48 answerable, 12 unanswerable, reviewed 0 | 구조·원문 근거 자동 검증 |
| `prepare-review` | 60개 검토 문서 생성 | 사람이 검토할 입력 준비 |
| Deterministic `evaluate-retrieval --smoke` | 3-query, 18-run, 실행 실패 0 | HTTP 연결과 artifact 생성 |
| `build-report` | Report 생성, 한계 문구 확인 | 같은 run 결과를 읽어 보고서로 변환 |

당시 smoke는 dirty snapshot과 hash 기반 deterministic embedding을 사용했다. 의미 검색의 품질, chunking 우열, latency 개선을 입증하지 않는다. 현재 runner도 full 평가에서 deterministic embedding을 거부하고, report에는 6개 baseline과 생성 평가의 미완 범위를 표시한다. [Runner](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/runner.py), [Report 제한 문구](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/report.py)

미검증은 전체 60-query multilingual retrieval, reranking을 포함한 8개 조합, 생성 답변의 정확성·충실성·거부 정확성, judge와 사람 판단의 일치도다. 사람의 dataset 검토를 거쳐 corpus·질문을 고정하고 나서야 이 비교를 진행할 수 있다.

## 코드에서 다시 볼 지점

| 파일 | 다시 확인할 판단 |
| --- | --- |
| [dataset.py](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/dataset.py) | 질문 pair의 정답·근거 일치, 사람 검토, 원문 quote 검사 |
| [chunking.py](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/chunking.py) | Fixed window가 heading을 걸칠 때 근거를 잘못 인정하지 않는 조건 |
| [metrics.py](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/metrics.py) | Any-hit Recall과 evidence coverage, intent bootstrap의 분모 |
| [runner.py](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/rag-evaluation/rag_evaluation/runner.py) | 실패한 질문의 0점 처리와 corpus·dataset·설정 snapshot |

## 다시 설명할 질문

1. 뉴스 catalog를 그대로 사용하면 chunking 비교에서 어떤 차이를 보기 어려운가?
2. Chunk ID를 정답으로 저장하는 방식과 evidence span을 저장하는 방식은 유지 비용이 어떻게 다른가?
3. 같은 quote가 이웃 heading에 반복될 때 `sourceSections`가 필요한 이유는 무엇인가?
4. Lexical·semantic pair를 독립 표본으로 취급하면 어떤 판단이 과해질 수 있는가?
5. 원문 인용 자동 검사가 통과해도 사람이 정답과 answerability를 봐야 하는 이유는 무엇인가?
6. 70개 fixture와 18-run smoke를 근거로 말할 수 없는 품질 주장은 무엇인가?

이 글은 설계·구현·과거 실행 기록을 Codex로 대조해 작성했다. 사용자 개인의 이해나 검토가 끝났다고 대신 서술하지 않았다. 위 질문의 답은 실제 근거를 읽고 설명하는 과정에서 확인할 항목으로 남긴다.
