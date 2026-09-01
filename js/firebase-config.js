// Firebase тохиргоо  huzur-fdcf2
// apiKey нь нууц түлхүүр БИШ: Firebase-ийн web apiKey нь төслийг заадаг
// нийтийн танигч бөгөөд browser-т ил байх ёстой. Аюулгүй байдлыг
// firestore.rules хамгаална.

export const firebaseConfig = {
  apiKey: "AIzaSyD7SH8MVP_JoGOOr_pqj9PEwsBFp1rrUT8",
  authDomain: "huzur-fdcf2.firebaseapp.com",
  projectId: "huzur-fdcf2",
  storageBucket: "huzur-fdcf2.firebasestorage.app",
  messagingSenderId: "969764204987",
  appId: "1:969764204987:web:fe1e58a7b209311635549e",
  measurementId: "G-RLFW6B68WP",
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);