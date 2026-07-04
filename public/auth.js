import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCN6B-onr9v_a7IqxSKqtKKx1kO7y3TOD8",
  authDomain: "humem-cloud.firebaseapp.com",
  projectId: "humem-cloud",
  storageBucket: "humem-cloud.firebasestorage.app",
  messagingSenderId: "398165358103",
  appId: "1:398165358103:web:bcf3c1f43d406df2510e52",
  measurementId: "G-048V654XBV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export function loginWithGoogle() {
  return signInWithPopup(auth, provider)
    .then((result) => {
      // Redirect to dashboard after successful login
      void result; // suppress unused warning
      window.location.href = "/dashboard.html";
    }).catch((error) => {
      console.error("Error signing in:", error.code);
      alert("Error signing in: " + error.message);
    });
}

export function logout() {
  return signOut(auth).then(() => {
    window.location.href = "/";
  }).catch((error) => {
    console.error("Error signing out:", error);
  });
}

// Check authentication state
export function initAuthStateListener(requireAuth = false) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Update UI for logged-in user
      const loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.textContent = 'Dashboard';
        loginBtn.onclick = () => { window.location.href = '/dashboard.html'; };
      }

      // Fill in user info if elements exist
      const userEmailEl = document.getElementById('user-email');
      if (userEmailEl) userEmailEl.textContent = user.email;
      const userProfileImg = document.getElementById('user-profile-img');
      if (userProfileImg && user.photoURL) userProfileImg.src = user.photoURL;

    } else {
      if (requireAuth) {
        window.location.href = "/"; // Redirect unauthenticated users
      }
      
      // Update UI for logged-out user
      const loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.textContent = 'Dashboard Login';
        loginBtn.onclick = loginWithGoogle;
      }
    }
  });
}

// Bind auth to global window object so HTML inline scripts can trigger it
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
