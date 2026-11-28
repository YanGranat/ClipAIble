# ClipAIble

웹 문서를 PDF, EPUB, FB2, Markdown 또는 오디오로 저장합니다.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## 사용 방법

1. 문서, 지원되는 동영상 또는 PDF를 엽니다.
2. Chrome 도구 모음에서 ClipAIble을 클릭합니다.
3. 출력 형식과 추출 모드를 선택합니다.
4. **저장**을 클릭합니다.

페이지의 마우스 오른쪽 버튼 메뉴에서도 저장할 수 있습니다. 로컬 PDF를 처리하려면 Chrome 확장 프로그램 설정에서 파일 접근을 허용하거나, 안내가 나타나면 해당 파일을 선택하세요. 파일 선택이 필요한 경우 확장 프로그램 팝업을 열어 두세요.

웹 문서에서 **자동** 모드는 로컬 휴리스틱과 사용 가능한 캐시된 선택자를 사용합니다. **AI Selector**는 AI 서비스에 CSS 선택자를 요청한 다음 일치하는 페이지 내용을 추출합니다. **AI Extract**는 AI 서비스에 내용의 구조화를 요청합니다. PDF에서는 자동 모드가 텍스트 레이어를 추출하고, AI 모드는 렌더링된 페이지를 처리합니다. **OCR (Tesseract)**는 PDF의 모든 페이지에서 텍스트를 로컬로 인식합니다.

YouTube나 Vimeo 동영상을 내보내려면 자막과 문서 처리에 선택한 AI 서비스의 API 키가 필요합니다. **자동** 모드에도 적용됩니다.

설정에서 텍스트 및 이미지 번역, 문서 스타일, 목차를 지정할 수 있습니다. 팝업에서는 요약이나 핵심 주장도 생성할 수 있습니다. 오디오는 설정한 음성 합성 서비스로 만들거나 Piper 또는 Supertonic 모델을 내려받은 뒤 기기에서 생성할 수 있습니다.

선택한 AI 및 음성 합성 기능에 필요한 API 키를 추가하세요. JSON 백업에는 설정과 사용자 지정 프롬프트가 들어갑니다. 통계, 기록, 선택자 캐시도 넣을 수 있습니다. API 키는 백업에서 제외됩니다. 가져올 때 빠진 기록과 새 사이트의 규칙을 추가하거나 선택한 데이터 항목을 백업의 내용으로 바꿀 수 있습니다. [설정 백업](../README.md#export-and-restore-settings)을 참조하세요.

## 개발

설치, 빌드 및 테스트 방법은 [영문 기본 가이드](../README.md#development)를 참조하세요.

[권한](../PERMISSIONS.md) · [개인정보 처리방침](../PRIVACY.md) · [기술 개요](technical-overview.md)
