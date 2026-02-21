import dotenv from 'dotenv';
import admin from 'firebase-admin';
import path from 'path';

dotenv.config();

const testPush = async () => {
    const fcmToken = process.argv[2];
    if (!fcmToken) {
        console.error("Usage: node test-fcm.js <FCM_TOKEN>");
        process.exit(1);
    }

    try {
        const serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
        };

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });

        console.log("Testing with Token:", fcmToken.substring(0, 10) + "...");

        const message = {
            token: fcmToken,
            notification: {
                title: "Diagnostic Test",
                body: "This is a test from the backend script."
            }
        };

        const response = await admin.messaging().send(message);
        console.log("✅ Success! Message ID:", response);
    } catch (error) {
        console.error("❌ Failed!");
        console.error("Code:", error.code);
        console.error("Message:", error.message);
        if (error.errorInfo) {
            console.error("Error Info:", JSON.stringify(error.errorInfo, null, 2));
        }
    }
};

testPush();
