// ─────────────────────────────────────────────────────────────
//  Firebase тохиргоо
//
//  Firebase Console → ⚙ Project settings → "Your apps" → Web app
//  доторх firebaseConfig объектыг ЭНД буулгана.
//
//  Хэрэв энэ файл хоосон хэвээр байвал тоглоом bot-той офлайн
//  горимд ажиллана — нэвтрэх, өрөө, ranking идэвхгүй байна.
//
//  ⚠ apiKey нь нууц түлхүүр БИШ. Firebase-ийн web apiKey нь зүгээр
//  л төслийг заадаг нийтийн танигч бөгөөд browser-т ил байх ёстой.
//  Аюулгүй байдлыг firestore.rules хамгаална.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "",
  authDomain: "huzur-fdcf2.firebaseapp.com",
  projectId: "huzur-fdcf2",
  storageBucket: "huzur-fdcf2.firebasestorage.app",
  messagingSenderId: "",
  appId: "",
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);
