# Docker 개발환경 설정

## 작업 내용

### 추가된 파일

| 파일 | 위치 | 용도 |
|------|------|------|
| `docker-compose.yml` | 프로젝트 루트 | MongoDB 컨테이너 설정 |

### 변경된 파일

없음 (기존 코드 수정 없이 Docker 환경 추가)

---

## 설정 내용

```yaml
# docker-compose.yml
services:
  mongodb:
    image: mongo:7           # MongoDB 7 버전 공식 이미지
    container_name: tododo-mongo
    ports:
      - "27017:27017"        # 호스트:컨테이너 포트 매핑
    volumes:
      - mongo-data:/data/db  # 데이터 영속성 (컨테이너 삭제해도 데이터 유지)

volumes:
  mongo-data:                # 명명된 볼륨 선언
```

---

## 사용법

### 기본 명령어

```bash
# MongoDB 컨테이너 실행 (백그라운드)
docker-compose up -d

# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs

# 컨테이너 종료
docker-compose down

# 컨테이너 + 데이터 삭제 (주의: 데이터 사라짐)
docker-compose down -v
```

### 개발 워크플로우

```bash
# 1. MongoDB 실행
docker-compose up -d

# 2. 서버 실행 (새 터미널)
cd server && npm run start:dev

# 3. 클라이언트 실행 (새 터미널)
cd client && npm run dev
```

---

## 기존 환경과의 차이

| 항목 | 이전 | 이후 |
|------|------|------|
| MongoDB 설치 | 로컬 설치 필요 | Docker만 있으면 됨 |
| MongoDB 버전 관리 | 수동 | docker-compose.yml에서 관리 |
| 연결 문자열 | `mongodb://localhost:27017` | 동일 (변경 없음) |
| 데이터 저장 위치 | 로컬 MongoDB 디렉토리 | Docker 볼륨 (mongo-data) |

---

## 참고

### Docker 설치 확인

```bash
docker --version
docker-compose --version
```

### MongoDB 접속 테스트

```bash
# 컨테이너 내부 MongoDB shell 접속
docker exec -it tododo-mongo mongosh
```

### 향후 확장

AWS 등으로 배포 시 `Dockerfile`을 추가하여 앱 자체도 컨테이너화 가능.
현재는 개발용으로 MongoDB만 컨테이너화된 상태.
