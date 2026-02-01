import admin from "firebase-admin";
import { ApiError } from "../utils/ApiError.js";

let firebaseApp = null;

export const initializeFirebase = () => {
  try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
      console.warn(
        "⚠️ Firebase credentials not found. Push notifications will be disabled."
      );
      return null;
    }

    if (firebaseApp) {
      return firebaseApp;
    }

    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase initialized successfully");
    return firebaseApp;
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error.message);
    return null;
  }
};

export const getFirebaseApp = () => {
  if (!firebaseApp) {
    throw new ApiError(500, "Firebase not initialized");
  }
  return firebaseApp;
};

export const sendFCMNotification = async (token, notification, data = {}) => {
  try {
    const app = getFirebaseApp();

    const message = {
      token: token,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        sound: "default",
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "library_alerts",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ FCM notification sent:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("❌ FCM notification error:", error.message);

    // Handle specific errors
    if (error.code === "messaging/registration-token-not-registered") {
      return {
        success: false,
        error: "Token not registered",
        code: "TOKEN_INVALID",
      };
    }

    return { success: false, error: error.message };
  }
};
