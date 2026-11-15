import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);

function makeAuth(): Auth {
  try {
    // In development each browser TAB gets its own anonymous player, so you can test
    // a whole match by opening two tabs. In production the player is remembered per
    // browser, so closing and reopening the page keeps you in your game.
    return initializeAuth(app, {
      persistence: import.meta.env.DEV ? browserSessionPersistence : browserLocalPersistence,
    });
  } catch {
    return getAuth(app); // already initialised (hot reload)
  }
}

export const auth = makeAuth();
