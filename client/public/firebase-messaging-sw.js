/* global importScripts, firebase */
/* 마감 알림 백그라운드 수신. 탭이 닫혀 있어도 브라우저가 이 워커를 깨워 알림을 띄운다.
 * FCM 메시지에 notification + webpush.fcm_options.link가 있으면 SDK가 표시와 클릭 이동을
 * 처리한다. public 파일이라 import.meta.env를 못 쓰므로 Firebase 설정은 등록 URL의
 * 쿼리스트링으로 받는다(pushClient.ts의 serviceWorkerUrl). 버전은 client의 firebase와 맞춘다. */
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});
firebase.messaging();
