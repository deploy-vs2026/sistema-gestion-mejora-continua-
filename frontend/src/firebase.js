import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAdFpgu0-tGgWK_u4DSpZH2v4nGuXz8ELk",
  authDomain: "sigmc-5fae5.firebaseapp.com",
  projectId: "sigmc-5fae5",
  storageBucket: "sigmc-5fae5.firebasestorage.app",
  messagingSenderId: "519623119758",
  appId: "1:519623119758:web:9e4e2e63b06e48841d8adf",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
