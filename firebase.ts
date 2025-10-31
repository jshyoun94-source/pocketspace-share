// firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyD1eDPDwnI7TR0vahoeMltu2LVoNFVUfdw",
    authDomain: "tangential-sled-352810.firebaseapp.com",
    projectId: "tangential-sled-352810",
    storageBucket: "tangential-sled-352810.firebasestorage.app",
    messagingSenderId: "960074559622",
    appId: "1:960074559622:web:0833ffd19e237f4754e107"
  };

export const firebaseApp = initializeApp(firebaseConfig);

initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
  // experimentalForceLongPolling: true, // 필요하면 주석 해제
});

export const db = getFirestore(firebaseApp);
