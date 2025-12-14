# ✂️ ClipAIble

> **AI 기반 기사 추출기** — 웹의 모든 기사를 PDF, EPUB, FB2, Markdown 또는 오디오로 저장. 11개 언어로 번역. 모든 웹사이트에서 작동.

![버전](https://img.shields.io/badge/버전-2.9.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-확장-프로그램-green)
![라이선스](https://img.shields.io/badge/라이선스-MIT-brightgreen)

---

## ✨ ClipAIble이란?

ClipAIble은 인공지능을 사용하여 모든 웹페이지에서 기사 콘텐츠를 지능적으로 추출합니다 — 광고, 내비게이션, 팝업 및 불필요한 요소를 제거합니다. 그런 다음 선호하는 형식으로 내보냅니다:

- 📄 **PDF** — 아름답고 사용자 정의 가능한 스타일
- 📚 **EPUB** — Kindle, Kobo, Apple Books에 적합
- 📖 **FB2** — PocketBook, FBReader에 적합
- 📝 **Markdown** — 노트용 일반 텍스트
- 🎧 **오디오 (MP3/WAV)** — AI 내레이션으로 듣기

모든 형식이 **11개 언어로 번역**을 지원합니다 — 이미지의 텍스트 번역도 가능합니다!

---

## 🚀 기능

### 🤖 AI 기반 추출
- **두 가지 모드**: AI Selector (빠름, 재사용 가능) 및 AI Extract (철저함)
- **여러 제공업체 지원**: OpenAI GPT (GPT-5.2, GPT-5.2-pro, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **비디오 지원**: YouTube/Vimeo 비디오에서 자막 추출 및 기사로 변환 (v2.9.0)
- **지능형 감지**: 기사의 주요 내용을 찾고 자동으로 불필요한 요소 제거
- **구조 보존**: 제목, 이미지, 코드 블록, 테이블, 각주

### 🎧 오디오 내보내기
- **5개의 TTS 제공업체**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100개 이상의 음성**: 11개 OpenAI + 9개 ElevenLabs + 30개 Google Gemini + 49개 Qwen + 14개 Respeecher (영어 및 우크라이나어)
- **속도 조절**: 0.5x ~ 2.0x (OpenAI/ElevenLabs만)
- **우크라이나어 지원**: Respeecher를 통한 전용 우크라이나어 음성
- **다국어 발음**: 각 언어에 맞는 올바른 발음
- **지능형 텍스트 정리**: AI가 URL, 코드 및 비음성 콘텐츠 제거

### 🌍 번역
- **11개 언어**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **지능형 감지**: 기사가 이미 대상 언어인 경우 번역 건너뜀
- **이미지 번역**: 이미지의 텍스트 번역 (Gemini를 통해)
- **현지화된 메타데이터**: 날짜 및 레이블이 선택된 언어에 맞게 조정

### 🎨 PDF 사용자 정의
- **4가지 사전 설정**: 다크, 라이트, 세피아, 고대비
- **사용자 정의 가능한 색상**: 배경, 텍스트, 제목, 링크
- **11가지 글꼴** 선택 가능
- **페이지 모드**: 단일 연속 페이지 또는 다중 페이지 A4 형식

### ⚡ 지능형 기능
- **비디오 지원**: YouTube/Vimeo 비디오에서 자막 추출 및 기사로 변환 (v2.9.0)
- **오디오 전사**: 자막을 사용할 수 없을 때 자동 전사 (gpt-4o-transcribe)
- **오프라인 모드**: 선택자 캐싱 — 반복 사이트에 AI 불필요
- **통계**: 저장 수 추적, 기록 보기
- **목차**: 제목에서 자동 생성
- **요약**: AI가 작성한 2-3단락 요약
- **컨텍스트 메뉴**: 우클릭 → "기사를 PDF로 저장"
- **언제든지 취소**: 한 번의 클릭으로 처리 중지

### 🔒 보안
- **API 키 암호화** AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **키는 내보내지 않음** — 설정 백업에서 제외
- **모든 데이터 로컬** — 제3자에게 전송되지 않음

---

## ⚠️ 알려진 제한사항

### 파일 형식
- **WAV 형식** (Qwen/Respeecher): 파일이 매우 클 수 있습니다 (긴 기사의 경우 10-50MB+). 더 작은 파일 크기를 위해 MP3 형식 사용을 고려하세요.
- **문자 제한**: 
  - Qwen TTS: 세그먼트당 600자
  - Respeecher TTS: 세그먼트당 450자
  - 텍스트는 문장/단어 경계에서 지능적으로 자동 분할됩니다

### 기술적 제약
- **Keep-alive 요구사항**: Chrome MV3는 최소 1분의 keep-alive 간격이 필요합니다. 긴 처리 작업은 몇 분이 걸릴 수 있습니다.
- **이미지의 CORS**: 웹사이트가 cross-origin 요청을 차단하는 경우 일부 이미지가 로드되지 않을 수 있습니다. 확장 프로그램은 이러한 이미지를 건너뜁니다.
- **취소가 즉시 적용되지 않음**: 취소는 모든 백그라운드 프로세스를 완전히 중지하는 데 몇 초가 걸릴 수 있습니다.
- **큰 HTML**: 매우 큰 HTML (>500KB)이 있는 페이지는 처리하는 데 더 오래 걸릴 수 있습니다.

### 브라우저 호환성
- **Chrome/Edge/Brave/Arc**: 완전히 지원됨
- **Firefox**: 지원되지 않음 (다른 확장 프로그램 API 사용)
- **Safari**: 지원되지 않음 (다른 확장 프로그램 API 사용)

---

## 📦 설치

1. 이 저장소를 **복제**
2. Chrome 열기 → `chrome://extensions/`
3. **개발자 모드** 활성화
4. **압축 해제된 확장 프로그램을 로드합니다** 클릭 → 폴더 선택

### 요구 사항

- Chrome, Edge, Brave 또는 Arc 브라우저
- 최소 하나의 제공업체의 API 키 (아래 참조)

---

## 🔑 API 키 얻기

### OpenAI (GPT 모델 + 오디오)

1. [platform.openai.com](https://platform.openai.com/)로 이동
2. 가입 또는 로그인
3. **API Keys** (왼쪽 메뉴)로 이동하거나 직접 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)로 이동
4. **"Create new secret key"** 클릭
5. 키 복사 (`sk-...`로 시작)
6. **Settings → Billing**에서 결제 정보 추가 (API 사용에 필요)

> **참고:** OpenAI 키는 오디오 내보내기 (TTS)에 필요합니다. 다른 형식은 모든 제공업체와 함께 작동합니다.

### Google Gemini

1. [Google AI Studio](https://aistudio.google.com/)로 이동
2. Google 계정으로 로그인
3. **"Get API key"** 클릭하거나 직접 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)로 이동
4. **"Create API key"** 클릭
5. 키 복사 (`AIza...`로 시작)

> **팁:** Gemini는 이미지 텍스트 번역 기능도 활성화합니다.

### Anthropic Claude

1. [console.anthropic.com](https://console.anthropic.com/)로 이동
2. 가입 또는 로그인
3. **API Keys**로 이동
4. **"Create Key"** 클릭
5. 키 복사 (`sk-ant-...`로 시작)
6. **Plans & Billing**에서 크레딧 추가

### Qwen3-TTS-Flash（오디오）

1. [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)로 이동
2. 가입 또는 로그인
3. **API Keys** 또는 **Model Studio**로 이동
4. API 키 생성
5. 키 복사（`sk-...`로 시작）

> **참고:** Qwen3-TTS-Flash는 49개의 음성을 제공하며, 전용 러시아어 음성（Alek）을 포함합니다. 24kHz 고정 WAV 형식.

### Respeecher（오디오 - 영어 및 우크라이나어）

1. [Respeecher Space](https://space.respeecher.com/)로 이동
2. 가입 또는 로그인
3. **API Keys**로 이동
4. API 키 생성
5. 키 복사

> **참고:** Respeecher는 영어와 우크라이나어를 지원하며 전용 우크라이나어 음성을 제공합니다. 22.05kHz 고정 WAV 형식.

### 어떤 것을 선택해야 할까요?

| 제공업체 | 최적 용도 | 오디오 | 이미지 번역 |
|----------|-----------|--------|-------------|
| **OpenAI** | 일반 사용, 오디오 내보내기, 비디오 전사 | ✅ | ❌ |
| **Gemini** | 빠른 추출, 이미지 번역, 오디오 내보내기（30개 음성） | ✅ | ✅ |
| **Claude** | 긴 기사, 복잡한 페이지 | ❌ | ❌ |
| **Grok** | 빠른 추론 작업 | ❌ | ❌ |
| **OpenRouter** | 여러 모델 액세스 | ❌ | ❌ |
| **Qwen** | 오디오 내보내기（49개 음성, 러시아어 지원） | ✅ | ❌ |
| **Respeecher** | 오디오 내보내기（우크라이나어） | ✅ | ❌ |

**권장 사항:** 모든 기능 (추출 + 오디오)을 얻기 위해 OpenAI로 시작하세요. 우크라이나어 텍스트에는 Respeecher를 사용하세요.

---

## 🎯 빠른 시작

1. 도구 모음의 **ClipAIble** 아이콘 클릭
2. API 키 입력 → **키 저장**
3. 모든 기사로 이동
4. **PDF로 저장** 클릭 (또는 다른 형식 선택)
5. 완료! 파일이 자동으로 다운로드됩니다

**팁:** 아무 곳이나 우클릭 → **"기사를 PDF로 저장"**

---

## ⚙️ 설정

### 추출 모드

| 모드 | 속도 | 최적 용도 |
|------|------|-----------|
| **AI Selector** | ⚡ 빠름 | 대부분의 사이트, 블로그, 뉴스 |
| **AI Extract** | 🐢 철저함 | 복잡한 페이지, Notion, SPA |

### AI 모델

| 제공업체 | 모델 | 참고 |
|----------|------|------|
| OpenAI | GPT-5.2 | 최신, 중간 추론 |
| OpenAI | GPT-5.2-pro | 향상됨, 중간 추론 |
| OpenAI | GPT-5.1 | 균형 |
| OpenAI | GPT-5.1 (high) | 최고 품질 |
| Anthropic | Claude Sonnet 4.5 | 긴 기사에 적합 |
| Google | Gemini 3 Pro | 빠름 |
| Grok | Grok 4.1 Fast Reasoning | 빠른 추론 |

### 오디오 음성

**OpenAI（11개 음성）：** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs（9개 음성）：** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS（30개 음성）：** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash（49개 음성）：** Elias（기본값）, Alek（러시아어）및 10개 언어의 음성 포함

**Respeecher（14개 음성）：** 4개 영어（Samantha, Neve, Gregory, Vincent）+ 10개 우크라이나어 음성

### 스타일 사전 설정 (PDF)

| 사전 설정 | 배경 | 텍스트 |
|-----------|------|--------|
| 다크 | `#303030` | `#b9b9b9` |
| 라이트 | `#f8f9fa` | `#343a40` |
| 세피아 | `#faf4e8` | `#5d4e37` |
| 고대비 | `#000000` | `#ffffff` |

---

## 📊 통계 및 캐시

**📊 통계** 클릭하여 보기:
- 총 저장 수, 이번 달 카운트
- 형식별 분류
- 링크가 있는 최근 기록
- 오프라인 모드용 캐시된 도메인

### 오프라인 모드

ClipAIble은 도메인별로 AI 생성 선택자를 캐시합니다:
- **두 번째 방문 = 즉시** — API 호출 없음
- **자동 무효화** — 추출 실패 시 지움
- **수동 제어** — 개별 도메인 삭제

---

## 💾 설정 가져오기/내보내기

**⚙️ 설정** → **가져오기/내보내기**

- 모든 설정 내보내기 (보안을 위해 API 키 제외)
- 선택 사항: 통계 및 캐시 포함
- 병합 또는 덮어쓰기 옵션으로 가져오기

---

## 🔧 문제 해결

| 문제 | 해결 방법 |
|------|-----------|
| 빈 콘텐츠 | **AI Extract** 모드 시도 |
| 잘못된 API 키 | 키 형식 확인 (sk-..., AIza..., sk-ant-...) |
| 이미지 누락 | 일부 사이트는 cross-origin 차단; 작은 이미지 필터링 |
| 느린 오디오 | 긴 기사는 청크로 분할; 진행 표시줄 관찰 |

---

## 🏗️ 아키텍처

```
clipaible/
├── manifest.json       # 확장 프로그램 구성
├── popup/              # UI (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # 콘텐츠 추출
│   ├── translation/    # 번역 및 언어 감지
│   ├── generation/     # PDF, EPUB, FB2, MD, 오디오
│   ├── cache/          # 선택자 캐싱
│   ├── stats/          # 사용 통계
│   └── utils/          # 구성, 암호화, 유틸리티
├── print/              # PDF 렌더링
├── config/             # 스타일
└── lib/                # JSZip
```

---

## 🔐 보안 및 개인정보 보호

- **암호화**: Web Crypto API를 통한 AES-256-GCM
- **키 파생**: PBKDF2, 100,000 반복
- **추적 없음**: 분석 없음, 원격 로깅 없음
- **로컬 전용**: 모든 데이터가 브라우저에 유지됩니다

---

## 📋 권한

| 권한 | 이유 |
|------|------|
| `activeTab` | 현재 탭에서 기사 읽기 |
| `storage` | 설정을 로컬에 저장 |
| `scripting` | 추출 스크립트 주입 |
| `downloads` | 생성된 파일 저장 |
| `debugger` | Chrome 인쇄 API를 통한 PDF 생성 |
| `alarms` | 긴 작업 중 worker 활성 유지 |
| `contextMenus` | 우클릭 메뉴 |

자세한 내용은 [PERMISSIONS.md](PERMISSIONS.md)를 참조하세요.

---

## 🤝 기여

1. 저장소 포크
2. 기능 브랜치 생성: `git checkout -b feature/cool-thing`
3. 커밋: `git commit -m 'Add cool thing'`
4. 푸시: `git push origin feature/cool-thing`
5. Pull Request 열기

---

## 📜 라이선스

MIT License — [LICENSE](LICENSE) 참조

---

<p align="center">
  <b>ClipAIble</b> — 저장. 읽기. 듣기. 어디서나.
</p>

