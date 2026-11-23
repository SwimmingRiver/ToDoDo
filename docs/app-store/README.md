# App Store 제출 자료 (iOS 첫 출시)

제출 직전에 몰리지 않도록 계약·빌드와 무관한 자료를 미리 준비한 초안이다. App Store Connect 입력은 사용자가 직접 한다.

| 파일 | 내용 |
|---|---|
| [listing-ko.md](listing-ko.md) | 앱 이름·부제·키워드·프로모션 텍스트·설명(한국어) |
| [app-privacy.md](app-privacy.md) | App Privacy(개인정보 라벨) 답변 초안 + 개인정보처리방침과 어긋나는 곳 |
| [demo-data.md](demo-data.md) | 스크린샷 데모 데이터 세트, 넣는 방법, 촬영 규격 |
| [checklist.md](checklist.md) | URL·연령 등급·카테고리·심사 메모·수출 규정 등 나머지 메타데이터 |

확정 사항(재제안 금지): 월 4,900원 1종 · 캘린더 양방향 안 함 · iPhone 전용.

## 결정 사항 (11-23 사용자 확정)

1. **출시 시점**: 심사는 먼저 받고, 공개는 12-28 00:00(KST) 이후로 한다. "수동 출시"와 "날짜 지정 자동 출시" 모두 허용한다. 날짜를 지정할 때는 시간대를 확인한다. 이유: 앱의 Apple 로그인은 가이드라인 4.8 때문에 숨길 수 없고, 이 로그인으로 받는 정보는 4판(12-28 시행)부터 방침에 들어간다. ([checklist.md](checklist.md) §1)
2. **연령 등급: 16+**. 약관은 만 14세 미만 가입을 받지 않는데, Apple 등급에는 14+가 없다. ([checklist.md](checklist.md) §3)
3. **판매 국가: 대한민국만**. 구독 고지 문구가 "월 4,900원" 고정이다. 가격 현지화는 해외 판매를 할 때 후속 작업으로 한다. ([checklist.md](checklist.md) §2)

## 남은 확인

- **미확인**: Sentry `tododo-mobile` 프로젝트의 "IP 주소 저장 방지" 설정(사용자가 직접 확인). 꺼져 있으면 라벨에 "대략적 위치"를 추가한다. ([checklist.md](checklist.md) §8, [app-privacy.md](app-privacy.md))
- **방침 다음 판 후보(기록만)**: 앱 기기 저장소 고지, 오류 정보의 기기·앱 버전. 심사를 막지는 않는다. ([app-privacy.md](app-privacy.md) §방침 대조)
- 데모 시드 스크립트는 제안만 한 상태다. 사용자가 승인하면 별도 PR로 만든다. ([demo-data.md](demo-data.md))
