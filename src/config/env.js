import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded from the root directory relative to this file
dotenv.config({ path: path.join(__dirname, "../../.env") });

console.log("✅ Environment variables loaded");
