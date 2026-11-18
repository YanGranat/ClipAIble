# ClipAIble

웹 문서를 PDF, EPUB, FB2, Markdown 또는 오디오로 저장합니다.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## 사용 방법

1. 문서, 지원되는 동영상 또는 PDF를 엽니다.
2. Chrome 도구 모음에서 ClipAIble을 클릭합니다.
3. 출력 형식과 추출 모드를 선택합니다.
4. **저장**을 클릭합니다.

페이지의 마우스 오른쪽 버튼 메뉴에서도 저장할 수 있습니다. 로컬 PDF를 처리하려면 Chrome 확장 프로그램 설정에서 파일 접근을 허용하거나, 안내가 나타나면 해당 파일을 선택하세요. 파일 선택이 필요한 경우 확장 프로그램 팝업을 열어 두세요.

웹 문서에서 **자동** 모드는 로컬 휴리스틱과 사용 가능한 캐시된 선택자를 사용합니다. **AI Selector**는 AI 서비스에 CSS 선택자를 요청한 다음 일치하는 페이지 내용을 추출합니다. **AI Extract**는 AI 서비스에 내용의 구조화를 요청합니다. PDF에서는 자동 모드가 텍스트 레이어를 추출하고, AI 모드는 렌더링된 페이지를 처리합니다.

설정에서 텍스트 및 이미지 번역, 문서 스타일, 목차를 지정할 수 있습니다. 팝업에서는 요약이나 핵심 주장도 생성할 수 있습니다. 오디오에는 설정된 TTS 서비스를 사용하거나, 음성 모델을 다운로드한 후 로컬에서 실행되는 Piper를 사용할 수 있습니다.

선택한 AI 및 TTS 기능에 필요한 API 키를 추가하세요. 설정을 내보낼 때 API 키는 포함되지 않습니다. 통계와 선택자 캐시는 선택적으로 포함할 수 있습니다.

## 개발

설치, 빌드 및 테스트 방법은 [영문 기본 가이드](../README.md#development)를 참조하세요.

[권한](../PERMISSIONS.md) · [개인정보 처리방침](../PRIVACY.md) · [기술 개요](technical-overview.md)
