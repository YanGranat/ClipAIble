# ClipAIble

AI 기반 기사 추출기. 모든 웹사이트에서 작동합니다.

**[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)에서 이용 가능**

## 기능

ClipAIble은 웹페이지에서 기사 콘텐츠를 추출하여 다양한 형식으로 변환합니다:
- PDF 문서
- EPUB 파일
- FB2 파일
- Markdown 텍스트
- 오디오 파일

**특별 기능:**
- **YouTube/Vimeo 지원**: 동영상 자막을 추출하고 이를 바탕으로 기사 생성
- **PDF 처리**: 온라인 PDF와 로컬 PDF 파일 지원
- **콘텐츠 번역**: 기사를 11개 언어로 번역
- **이미지 번역**: AI를 사용하여 이미지의 텍스트 번역
- **TLDR 생성**: 문서 내에 짧은 요약 생성
- **요약 패널**: 처리 후 팝업에 기사 요약 표시

## 사용 방법

1. 브라우저 도구 모음에서 ClipAIble 아이콘을 클릭
2. 기사, YouTube 동영상 또는 PDF 열기
3. 원하는 형식 선택 (PDF, EPUB, FB2, Markdown 또는 Audio)
4. 저장 클릭

**대체 저장 방법:**
- 웹페이지에서 마우스 오른쪽 버튼을 클릭하고 컨텍스트 메뉴 옵션 사용

**로컬 PDF 파일의 경우**: AI 모드에서는 브라우저 제한으로 인해 PDF 파일 선택을 요청받습니다.

## 설정

### 추출 모드

- **AI Selector**: 대부분의 사이트에서 권장되는 모드. AI를 사용하여 기사 콘텐츠를 찾습니다.
- **Automatic**: API 키 없이 작동하는 기본 모드.
- **AI Extractor**: AI를 사용하는 대안 모드 (정기적인 사용에는 권장되지 않음).

### 성능 기능

- **셀렉터 캐시**: 이전에 방문한 사이트의 처리를 가속화하기 위해 AI가 학습한 셀렉터 재사용

### 출력 형식

- **PDF**: 4개의 사전 설정 스타일 (어두운, 밝은, 세피아, 높은 대비)과 사용자 정의 가능한 글꼴/색상으로 서식된 문서 생성
- **EPUB**: Kindle 같은 리더기용 구조화된 전자책 생성
- **FB2**: PocketBook 및 다른 리더기용 구조화된 전자책 생성
- **Markdown**: 제목과 목록을 포함한 기사 구조 유지
- **Audio**: 6개의 다른 TTS 서비스를 사용하여 텍스트를 음성으로 변환

### 번역

콘텐츠를 다음 언어로 번역할 수 있습니다: 영어, 러시아어, 우크라이나어, 독일어, 프랑스어, 스페인어, 이탈리아어, 포르투갈어, 중국어, 일본어, 한국어.

### 오디오

다양한 TTS 제공업체를 사용하여 오디오를 생성할 수 있습니다:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (영어와 우크라이나어만)
- Piper (오프라인, API 키 불필요)

## API 키 (선택사항)

AI 기능을 위해 이러한 제공업체의 API 키를 추가할 수 있습니다:

### OpenAI
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)에서 키를 얻으세요

### Google Gemini
[aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 키를 얻으세요

TTS의 경우 Google Cloud Console에서 [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)를 활성화하세요

### Anthropic Claude
[console.anthropic.com](https://console.anthropic.com/)에서 키를 얻으세요

### DeepSeek
[platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)에서 키를 얻으세요

### ElevenLabs
[elevenlabs.io](https://elevenlabs.io/)에서 키를 얻으세요

### Qwen
[alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)에서 키를 얻으세요

### Respeecher
[space.respeecher.com](https://space.respeecher.com/)에서 키를 얻으세요

## 추가 기능

- **통계**: 기록과 월간 카운터로 저장한 기사 추적
- **설정 가져오기/내보내기**: 설정 백업 및 복원
- **11개 언어 인터페이스**: 다시 시작하지 않고 언어 간 전환
- **안전한 저장**: API 키는 저장 전에 암호화됩니다

## 권한

확장 프로그램이 작동하려면 이러한 권한이 필요합니다:
- 방문하는 웹페이지 읽기
- 컴퓨터에 파일 저장
- AI 제공업체에 API 호출하기 (해당 기능을 사용할 때만)

**보안**: 모든 API 키는 브라우저에 저장되기 전에 암호화됩니다.

---

ClipAIble은 웹 기사를 추출하고 변환합니다.