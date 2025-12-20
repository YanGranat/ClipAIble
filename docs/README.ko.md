# ✂️ ClipAIble

> **AI 기반 기사 추출기** — 웹의 모든 기사를 PDF, EPUB, FB2, Markdown 또는 오디오로 저장. 11개 언어로 번역. 모든 웹사이트에서 작동.

![버전](https://img.shields.io/badge/버전-3.1.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-확장-프로그램-green)
![라이선스](https://img.shields.io/badge/라이선스-MIT-brightgreen)

**[⬇️ Chrome Web Store에서 설치](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ ClipAIble이란?

ClipAIble은 인공지능을 사용하여 모든 웹페이지에서 기사 콘텐츠를 지능적으로 추출합니다 — 광고, 내비게이션, 팝업 및 불필요한 요소를 제거합니다. 그런 다음 선호하는 형식으로 내보냅니다:

- 📄 **PDF** — 아름답고 사용자 정의 가능한 스타일
- 📚 **EPUB** — Kindle, Kobo, Apple Books에 적합
- 📖 **FB2** — PocketBook, FBReader에 적합
- 📝 **Markdown** — 노트용 일반 텍스트
- 🎧 **오디오** — AI 내레이션으로 듣기

모든 형식이 **11개 언어로 번역**을 지원합니다 — 이미지의 텍스트 번역도 가능합니다!

---

## 🚀 기능

### 🤖 AI 기반 추출
- **세 가지 모드**: 자동 (AI 없음, 빠름), AI Selector (빠름, 재사용 가능) 및 AI Extract (철저함)
- **자동 모드**: AI 없이 문서 생성 — API 키 불필요, 즉시 추출
- **여러 제공업체 지원**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **비디오 지원**: YouTube/Vimeo 비디오에서 자막 추출 및 기사로 변환 (v3.0.0)
  - 여러 추출 방법 및 폴백
  - 우선순위: 수동 자막 > 자동 생성 > 번역
  - AI 처리: 타임스탬프 제거, 단락 병합, 오류 수정
  - 자막을 사용할 수 없을 때 오디오 전사 폴백
- **지능형 감지**: 기사의 주요 내용을 찾고 자동으로 불필요한 요소 제거
- **향상된 폴백 전략**: 안정적인 콘텐츠 추출을 위한 6가지 다른 전략
- **구조 보존**: 제목, 이미지, 코드 블록, 테이블, 각주
- **선택자 캐싱**: 캐시 사용 및 활성화를 위한 독립적인 설정

### 🎧 오디오 내보내기
- **5개의 TTS 제공업체**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100개 이상의 음성**: 11개 OpenAI + 9개 ElevenLabs + 30개 Google Gemini + 49개 Qwen + 14개 Respeecher (영어 및 우크라이나어)
- **속도 조절**: 0.5x ~ 2.0x (OpenAI/ElevenLabs만; Google/Qwen/Respeecher는 고정 속도 사용)
- **형식 지원**: MP3 (OpenAI/ElevenLabs) 또는 WAV (Google/Qwen/Respeecher)
- **다국어 발음**: 각 언어에 맞는 올바른 발음
- **우크라이나어 지원**: Respeecher를 통한 전용 우크라이나어 음성 (10개 음성)
- **지능형 텍스트 정리**: AI가 URL, 코드 및 비음성 콘텐츠 제거
- **제공업체별 기능**:
  - **ElevenLabs**: 모델 선택 (v2, v3, Turbo v2.5), 형식 선택, 고급 음성 설정
  - **Google Gemini 2.5 TTS**: 모델 선택 (pro/flash), 30개 음성, 24k 문자 제한
  - **Qwen**: 러시아어 음성 (Alek)을 포함한 49개 음성, 600자 제한
  - **Respeecher**: 고급 샘플링 매개변수 (temperature, repetition_penalty, top_p)

### 🌍 번역
- **11개 언어**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **지능형 감지**: 기사가 이미 대상 언어인 경우 번역 건너뜀
- **이미지 번역**: 이미지의 텍스트 번역 (Gemini를 통해)
- **현지화된 메타데이터**: 날짜 및 레이블이 선택된 언어에 맞게 조정

### 🎨 PDF 사용자 정의
- **4가지 사전 설정**: 다크, 라이트, 세피아, 고대비
- **사용자 정의 가능한 색상**: 배경, 텍스트, 제목, 링크
- **11가지 글꼴**: 기본값 (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **글꼴 크기**: 조정 가능 (기본값: 31px)
- **페이지 모드**: 단일 연속 페이지 또는 다중 페이지 A4 형식


### ⚡ 지능형 기능
- **비디오 지원**: YouTube/Vimeo 비디오에서 자막 추출 및 기사로 변환 (v3.0.0)
  - 직접 자막 추출 (YouTube/Vimeo의 API 키 불필요)
  - AI 처리: 타임스탬프 제거, 단락 병합, 오류 수정
  - 오디오 전사 폴백: 자막을 사용할 수 없을 때 자동 전사 (gpt-4o-transcribe)
  - 완전한 파이프라인 통합: 번역, 목차, 요약, 모든 내보내기 형식
- **요약 생성**: 모든 기사 또는 비디오의 상세한 AI 요약 생성
  - **"요약 생성"** 버튼을 클릭하여 완전한 요약 생성
  - 일반 기사 및 YouTube/Vimeo 비디오에서 작동
  - 팝업이 닫혀도 생성 계속 (백그라운드에서 실행)
  - 클립보드에 복사 또는 Markdown 파일로 다운로드
  - 포맷된 텍스트로 확장/축소 표시
  - 주요 아이디어, 개념, 예제 및 결론을 포함한 상세한 요약
- **요약 (TL;DR)**: AI가 작성한 2-4문장의 짧은 요약, 문서에 포함
  - 선택적 기능: 설정에서 활성화하여 PDF/EPUB/FB2/Markdown에 짧은 요약 추가
  - 내보낸 문서의 시작 부분에 나타남
  - 상세한 요약과 다름 (이것은 간단한 개요)
- **오프라인 모드**: 선택자 캐싱 — 반복 사이트에 AI 불필요
  - 독립적인 설정: 캐시된 선택자 사용 및 캐싱 활성화를 별도로 설정
  - 추출 실패 시 자동 무효화
  - 도메인별 수동 캐시 관리
- **통계**: 저장 수 추적, 기록 보기
- **목차**: 제목에서 자동 생성
- **컨텍스트 메뉴**: 우클릭 → "기사를 PDF/EPUB/FB2/Markdown/오디오로 저장"
- **언제든지 취소**: 한 번의 클릭으로 처리 중지
- **설정 가져오기/내보내기**: 모든 설정의 백업 및 복원 (보안을 위해 API 키 제외)

### 🔒 보안
- **API 키 암호화** AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **키는 내보내지 않음** — 설정 백업에서 제외
- **모든 데이터 로컬** — 제3자에게 전송되지 않음

---

## ⚠️ 알려진 제한사항

### 파일 형식
- **WAV 형식** (Google/Qwen/Respeecher): 파일이 매우 클 수 있습니다 (긴 기사의 경우 10-50MB+). MP3 형식 (OpenAI/ElevenLabs)은 더 작은 파일 크기를 제공합니다.
- **요청당 문자 제한**: 
  - OpenAI TTS: 4096자
  - ElevenLabs: 5000자
  - Google Gemini 2.5 TTS: 24000자
  - Qwen TTS: 600자
  - Respeecher TTS: 450자
  - 텍스트는 문장/단어 경계에서 지능적으로 자동 분할됩니다

### 기술적 제약
- **Keep-alive 요구사항**: Chrome MV3는 최소 1분의 keep-alive 간격이 필요합니다. 긴 처리 작업은 몇 분이 걸릴 수 있습니다. 확장 프로그램은 통합된 keep-alive 메커니즘 (1분마다 알람 + 2초마다 상태 저장)을 사용하여 service worker가 중지되는 것을 방지합니다.
- **이미지의 CORS**: 웹사이트가 cross-origin 요청을 차단하는 경우 일부 이미지가 로드되지 않을 수 있습니다. 확장 프로그램은 이러한 이미지를 건너뜁니다.
- **취소가 즉시 적용되지 않음**: 취소는 모든 백그라운드 프로세스를 완전히 중지하는 데 몇 초가 걸릴 수 있습니다.
- **Service Worker 복구**: 작업은 service worker 재시작 후 자동으로 재개됩니다 (2시간 이내).

### 브라우저 호환성
- **Chrome/Edge/Brave/Arc**: 완전히 지원됨
- **Firefox**: 지원되지 않음 (다른 확장 프로그램 API 사용)
- **Safari**: 지원되지 않음 (다른 확장 프로그램 API 사용)

---

## 📦 설치

### 옵션 1: Chrome Web Store에서 설치 (권장)

**[⬇️ Chrome Web Store에서 ClipAIble 설치](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### 옵션 2: 수동 설치 (개발자 모드)

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

> **팁:** Gemini는 이미지 텍스트 번역 기능과 Google Gemini 2.5 TTS (30개 음성)도 활성화합니다. TTS의 경우 동일한 Gemini API 키를 사용하거나 전용 Google TTS API 키를 설정할 수 있습니다. Google Cloud Console에서 Generative Language API를 활성화해야 합니다.

### Anthropic Claude

1. [console.anthropic.com](https://console.anthropic.com/)로 이동
2. 가입 또는 로그인
3. **API Keys**로 이동
4. **"Create Key"** 클릭
5. 키 복사 (`sk-ant-...`로 시작)
6. **Plans & Billing**에서 크레딧 추가

### ElevenLabs (오디오)

1. [ElevenLabs](https://elevenlabs.io/)로 이동
2. 가입 또는 로그인
3. **Profile** → **API Keys**로 이동
4. API 키 생성
5. 키 복사

> **참고:** ElevenLabs는 고품질 TTS로 9개의 프리미엄 음성을 제공합니다. 속도 조절 (0.25-4.0x) 및 형식 선택 (MP3 고품질 기본값: mp3_44100_192)을 지원합니다. 모델: Multilingual v2, v3 (기본값), Turbo v2.5. 고급 음성 설정 (stability, similarity, style, speaker boost) 사용 가능.

### Google Gemini 2.5 TTS (오디오)

1. [Google AI Studio](https://aistudio.google.com/)로 이동
2. Google 계정으로 로그인
3. **"Get API key"** 클릭하거나 직접 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)로 이동
4. **"Create API key"** 클릭
5. 키 복사 (`AIza...`로 시작)
6. [Google Cloud Console](https://console.cloud.google.com/)에서 **Generative Language API** 활성화
7. (선택 사항) 모델에 필요한 경우 결제 활성화

> **참고:** Google Gemini 2.5 TTS는 30개의 음성을 제공합니다. 동일한 Gemini API 키를 사용하거나 전용 Google TTS API 키를 설정할 수 있습니다. 24kHz에서 고정 WAV 형식. 모델: `gemini-2.5-pro-preview-tts` (주요) 또는 `gemini-2.5-flash-preview-tts` (더 빠름).

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
| **OpenAI** | 일반 사용, 오디오 내보내기, 비디오 전사 | ✅ (11개 음성) | ❌ |
| **Gemini** | 빠른 추출, 이미지 번역, 오디오 내보내기（30개 음성） | ✅ (30개 음성) | ✅ |
| **Claude** | 긴 기사, 복잡한 페이지 | ❌ | ❌ |
| **Grok** | 빠른 추론 작업 | ❌ | ❌ |
| **OpenRouter** | 여러 모델 액세스 | ❌ | ❌ |
| **ElevenLabs** | 오디오 내보내기（9개 음성, 고품질） | ✅ (9개 음성) | ❌ |
| **Qwen** | 오디오 내보내기（49개 음성, 러시아어 지원） | ✅ (49개 음성) | ❌ |
| **Respeecher** | 오디오 내보내기（우크라이나어） | ✅ (14개 음성) | ❌ |

**권장 사항:** 
- **추출용**: OpenAI 또는 Gemini로 시작 (빠르고 안정적)
- **오디오용**: 일반 사용에는 OpenAI, 고품질에는 ElevenLabs, 30개 음성에는 Google Gemini 2.5 TTS, 러시아어에는 Qwen, 우크라이나어에는 Respeecher
- **이미지 번역용**: Gemini API 키 필요

---

## 🎯 빠른 시작

1. 도구 모음의 **ClipAIble** 아이콘 클릭
2. API 키 입력 → **키 저장**
3. 모든 기사로 이동
4. **PDF로 저장** 클릭 (또는 다른 형식 선택)
5. 완료! 파일이 자동으로 다운로드됩니다

**팁:**
- 아무 곳이나 우클릭 → **"기사를 PDF로 저장"**
- **"요약 생성"**을 클릭하여 상세한 AI 요약 생성 (팝업이 닫혀도 작동)
- 설정에서 **"TL;DR 생성"** 활성화하여 문서에 짧은 요약 추가

---

## ⚙️ 설정

### 인터페이스

- **테마**: 헤더에서 다크, 라이트 또는 자동 (시스템 따름) 선택
- **언어**: 헤더에서 인터페이스 언어 (11개 언어) 선택
- **사용자 정의 모델**: 모델 선택기 옆의 "+" 버튼을 통해 자체 AI 모델 추가

### 추출 모드

| 모드 | 속도 | 최적 용도 |
|------|------|-----------|
| **자동** | ⚡⚡ 즉시 | 간단한 기사, API 키 불필요 |
| **AI Selector** | ⚡ 빠름 | 대부분의 사이트, 블로그, 뉴스 |
| **AI Extract** | 🐢 철저함 | 복잡한 페이지, Notion, SPA |

### AI 모델

| 제공업체 | 모델 | 참고 |
|----------|------|------|
| OpenAI | GPT-5.2 | 최신, 중간 추론 (기본값) |
| OpenAI | GPT-5.2-high | 향상됨, 높은 추론 |
| OpenAI | GPT-5.1 | 균형 |
| OpenAI | GPT-5.1 (high) | 최고 품질, 높은 추론 |
| Anthropic | Claude Sonnet 4.5 | 긴 기사에 적합 |
| Google | Gemini 3 Pro | 빠른 추출, 이미지 번역 |
| Grok | Grok 4.1 Fast Reasoning | 빠른 추론 |
| OpenRouter | 다양한 모델 | 여러 제공업체 액세스 |

**사용자 정의 모델:** 모델 선택기 옆의 **"+"** 버튼을 클릭하여 사용자 정의 모델을 추가합니다 (예: `gpt-4o`, `claude-opus-4.5`). 사용자 정의 모델은 드롭다운 메뉴에 나타나며 필요에 따라 숨기기/표시할 수 있습니다.

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

**사용자 정의 색상:** 색상 선택기로 배경, 텍스트, 제목 및 링크를 사용자 정의합니다. 각 색상에 대한 개별 재설정 버튼 (↺) 또는 **"모두 기본값으로 재설정"**으로 모든 스타일을 복원합니다.

---

## 📊 통계 및 캐시

**📊 통계** 클릭하여 보기:
- 총 저장 수, 이번 달 카운트
- 형식별 분류 (PDF, EPUB, FB2, Markdown, 오디오)
- 원본 기사에 대한 링크가 있는 최근 기록 (최근 50개 저장)
  - 링크를 클릭하여 원본 기사 열기
  - ✕ 버튼을 클릭하여 개별 기록 항목 삭제
  - 형식, 도메인, 처리 시간 및 날짜 표시
- 오프라인 모드용 캐시된 도메인
- **통계 활성화/비활성화**: 통계 수집 토글
- **통계 지우기**: 모든 통계를 재설정하는 버튼
- **캐시 지우기**: 모든 캐시된 선택자를 제거하는 버튼
- 캐시에서 개별 도메인 삭제

## 📝 요약 생성

모든 기사 또는 비디오의 상세한 AI 요약 생성:

1. 모든 기사 또는 YouTube/Vimeo 비디오로 이동
2. 팝업에서 **"요약 생성"** 버튼 클릭
3. 요약이 백그라운드에서 생성됩니다 (팝업을 닫을 수 있습니다)
4. 준비되면 요약이 옵션과 함께 나타납니다:
   - **복사** 클립보드로
   - **다운로드** Markdown 파일로
   - **확장/축소** 전체 텍스트 보기
   - **닫기** 요약 숨기기

**기능:**
- 기사 및 YouTube/Vimeo 비디오에서 작동
- 팝업이 닫혀도 생성 계속
- 주요 아이디어, 개념, 예제 및 결론을 포함한 상세한 요약
- 제목, 목록 및 링크가 있는 포맷된 텍스트
- 자동 저장 — 닫을 때까지 유지됩니다

**참고:** 요약 생성은 문서 내보내기와 별개입니다. 전체 문서를 저장하지 않고 콘텐츠를 빠르게 이해하는 데 사용합니다.

### 오프라인 모드

ClipAIble은 도메인별로 AI 생성 선택자를 캐시합니다:
- **두 번째 방문 = 즉시** — API 호출 없음
- **자동 무효화** — 추출 실패 시 지움
- **수동 제어** — 개별 도메인 삭제
- **독립적인 설정**:
  - **캐시된 선택자 사용**: 캐시가 존재하는 경우 페이지 분석 건너뛰기 (더 빠름)
  - **캐싱 활성화**: 추출 후 새 선택자를 캐시에 저장
  - 두 설정 모두 유연한 제어를 위해 독립적으로 작동합니다

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
| 요약이 생성되지 않음 | API 키 확인, 페이지 콘텐츠가 로드되었는지 확인, 다시 시도 |
| 요약 생성 시간 초과 | 매우 긴 기사는 최대 45분이 걸릴 수 있습니다; 기다리거나 더 짧은 콘텐츠로 시도 |

---

## 🏗️ 아키텍처

```
clipaible/
├── manifest.json       # 확장 프로그램 구성
├── popup/              # UI (HTML, CSS, JS)
│   ├── popup.js       # 메인 오케스트레이션 (2670줄)
│   ├── core.js        # 비즈니스 로직 (1459줄)
│   ├── handlers.js    # 이벤트 핸들러 (1567줄)
│   ├── ui.js          # UI 관리
│   ├── stats.js       # 통계 표시
│   └── settings.js    # 설정 관리
├── scripts/
│   ├── background.js   # Service worker (2635줄)
│   ├── content.js      # YouTube용 콘텐츠 스크립트
│   ├── locales.js      # UI 현지화 (11개 언어)
│   ├── message-handlers/ # 메시지 핸들러 모듈 (v3.0.2+)
│   │   ├── index.js    # 메시지 라우터
│   │   ├── utils.js    # 핸들러 유틸리티
│   │   ├── simple.js   # 간단한 핸들러
│   │   ├── stats.js    # 통계 핸들러
│   │   ├── cache.js    # 캐시 핸들러
│   │   ├── settings.js # 설정 핸들러
│   │   ├── processing.js # 처리 핸들러
│   │   ├── video.js    # 비디오/자막 핸들러
│   │   ├── summary.js  # 요약 생성 도우미
│   │   └── complex.js  # 복잡한 핸들러
│   ├── api/            # AI & TTS 제공업체
│   │   ├── openai.js   # OpenAI (GPT 모델)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTS 라우터
│   │   └── index.js    # API 라우터
│   ├── extraction/     # 콘텐츠 추출
│   │   ├── prompts.js  # AI 프롬프트
│   │   ├── html-utils.js # HTML 유틸리티
│   │   ├── video-subtitles.js # YouTube/Vimeo 자막 추출
│   │   └── video-processor.js # AI 자막 처리
│   ├── translation/    # 번역 및 언어 감지
│   ├── generation/     # PDF, EPUB, FB2, MD, 오디오
│   ├── cache/          # 선택자 캐싱
│   ├── stats/          # 사용 통계
│   ├── settings/       # 설정 가져오기/내보내기
│   ├── state/          # 처리 상태 관리
│   └── utils/          # 구성, 암호화, 유틸리티
│       ├── video.js    # 비디오 플랫폼 감지
│       ├── validation.js # 검증 유틸리티
│       └── api-error-handler.js # 공통 API 오류 처리
├── print/              # PDF 렌더링
├── config/             # 스타일
├── lib/                # JSZip
├── docs/               # 현지화된 README 파일
└── memory-bank/        # 프로젝트 문서
```

---

## 🔐 보안 및 개인정보 보호

- **암호화**: Web Crypto API를 통한 AES-256-GCM
- **키 파생**: PBKDF2, 100,000 반복
- **추적 없음**: 분석 없음, 원격 로깅 없음
- **로컬 전용**: 모든 데이터가 브라우저에 유지됩니다

---

## 📋 권한

ClipAIble은 기능하기 위해 다음 권한이 필요합니다. 모든 권한은 명시된 목적에만 사용됩니다:

| 권한 | 이유 |
|------|------|
| `activeTab` | 확장 프로그램 아이콘을 클릭하거나 컨텍스트 메뉴를 사용할 때 현재 페이지를 읽어 콘텐츠를 추출합니다. 확장 프로그램은 현재 보고 있는 탭에만 액세스합니다. |
| `storage` | 설정(API 키, 스타일 기본 설정, 언어 선택) 및 통계를 브라우저에 로컬로 저장합니다. 데이터는 디바이스를 떠나지 않습니다. |
| `scripting` | 콘텐츠 추출 스크립트를 웹 페이지에 주입합니다. 이 스크립트는 페이지 DOM에서 기사 콘텐츠(텍스트, 이미지, 제목)를 찾아 추출합니다. |
| `downloads` | 생성된 파일(PDF, EPUB, FB2, Markdown, 오디오)을 컴퓨터에 저장합니다. 이 권한이 없으면 확장 프로그램이 파일을 다운로드할 수 없습니다. |
| `debugger` | **PDF 생성 전용** — Chrome의 내장 print-to-PDF 기능을 사용하여 적절한 페이지 레이아웃과 스타일로 고품질 PDF를 생성합니다. 디버거는 PDF 생성 중에만 연결되고 완료 후 즉시 분리됩니다. 이것은 Chrome 확장 프로그램에서 사용자 정의 스타일의 PDF를 생성하는 유일한 방법입니다. |
| `alarms` | 긴 작업(큰 기사, 번역) 중에 백그라운드 service worker를 활성 상태로 유지합니다. Chrome Manifest V3는 30초 후 service worker를 일시 중지하지만 기사 처리에는 몇 분이 걸릴 수 있습니다. 통합된 keep-alive 메커니즘 (1분마다 알람 + 2초마다 상태 저장)을 MV3 규칙에 따라 사용합니다. |
| `contextMenus` | 웹 페이지의 우클릭 컨텍스트 메뉴에 "ClipAIble로 저장" 옵션(PDF/EPUB/FB2/MD/오디오)을 추가합니다. |
| `notifications` | 컨텍스트 메뉴의 "저장" 기능을 사용할 때 데스크톱 알림을 표시합니다. 오류가 있는 경우(예: API 키 누락) 알림을 표시합니다. |
| `unlimitedStorage` | 선택자 캐시 및 임시 인쇄 데이터를 로컬에 저장합니다. 이를 통해 AI를 다시 호출하지 않고 더 빠른 반복 추출이 가능합니다(오프라인 모드). |

### 호스트 권한

| 권한 | 이유 |
|------|------|
| `<all_urls>` | 방문하는 모든 웹사이트에서 콘텐츠를 추출합니다. 확장 프로그램은 다음을 수행해야 합니다: 1) 기사 콘텐츠를 찾기 위해 페이지 HTML 읽기, 2) 기사에 포함된 이미지 다운로드, 3) AI/TTS 제공업체(OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher)에 API 호출 수행. 확장 프로그램은 명시적으로 저장하는 페이지에만 액세스합니다 — 자체적으로 웹을 탐색하지 않습니다. |

**보안 참고:** 모든 API 키는 AES-256-GCM을 사용하여 암호화되며 로컬에만 저장됩니다. 키는 구성한 AI 제공업체를 제외하고 서버로 내보내지거나 전송되지 않습니다.

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

