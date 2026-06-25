# PDF to AsciiDoc 변환기

PDF 문서를 AsciiDoc(`.adoc`) 형식으로 변환하는 Node.js CLI 도구입니다.

## 설치

```bash
npm install
```

## 사용법

### 단일 파일 변환

```bash
node converter.js 문서.pdf
# → 문서.adoc 생성 (같은 폴더)
```

```bash
node converter.js 문서.pdf -o 결과.adoc
# → 지정한 경로에 저장
```

### 디렉토리 일괄 변환

```bash
node converter.js ./pdfs/ -d
# → pdfs/ 폴더 안의 모든 .pdf 파일을 .adoc으로 변환

node converter.js ./pdfs/ -d -o ./docs/
# → docs/ 폴더에 변환 결과 저장
```

### 헤더 없이 변환 (본문만)

```bash
node converter.js 문서.pdf --no-header
```

## 변환 규칙

| PDF 내용 | AsciiDoc 변환 결과 |
|----------|-------------------|
| 모두 대문자 짧은 줄 | `== 제목` (레벨 2) |
| `1.`, `1.2.` 번호 제목 | `==`, `===` (깊이에 따라) |
| `•`, `-`, `*` 글머리 | `* 항목` (비순서 목록) |
| `1)`, `1.` 번호 목록 | `. 항목` (순서 목록) |
| 탭/다중공백으로 구분된 줄 | `\|===` 표 |
| 일반 텍스트 | 단락 |

## 출력 예시

```adoc
= 문서 제목
홍길동
2024-01-15
:toc: left
:toclevels: 3
:sectnums:
:icons: font

== 1장 개요

본 문서는 예시입니다.

=== 1.1 배경

* 첫 번째 항목
* 두 번째 항목

[cols="1,1,1",options="header"]
|===
| 이름
| 나이
| 직책
...
|===
```

## 의존성

- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF 텍스트 추출
- [commander](https://www.npmjs.com/package/commander) — CLI 파싱
- [chalk](https://www.npmjs.com/package/chalk) — 컬러 출력
