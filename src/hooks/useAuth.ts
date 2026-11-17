import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "unknown";
  console.error("Firebase sign-in failed:", error);
  switch (code) {
    case "auth/configuration-not-found":
      return `Authentication isn't set up yet. In Firebase Console open Build, then Authentication, click Get started, then Sign-in method, and enable Anonymous. (${code})`;
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return `Anonymous sign-in is switched off. In Firebase Console open Authentication, then Sign-in method, and enable Anonymous. (${code})`;
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    case "auth/invalid-api-key":
      return `The API key in your .env is not valid. Copy it again from Firebase project settings. (${code})`;
    case "auth/network-request-failed":
      return `No connection to Firebase. Check your internet and try again. (${code})`;
    default:
      return `Couldn't sign in to Firebase. Check your .env values and your connection. (${code})`;
  }
}

/** Signs the visitor in anonymously. The Firebase user id is the player id. */
export function useAuth(): { uid: string | null; error: string | null } {
  const [state, setState] = useState<{ uid: string | null; error: string | null }>({ uid: null, error: null });

  useEffect(() => {
    let signingIn = false;
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setState({ uid: user.uid, error: null });
        return;
      }
      if (signingIn) return;
      signingIn = true;
      signInAnonymously(auth).catch((e) => setState({ uid: null, error: friendlyError(e) }));
    });
  }, []);

  return state;
}
