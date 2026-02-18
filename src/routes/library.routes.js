import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getLibraryProfile,
  updateLibraryProfile,
} from "../controllers/library.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

router.route("/")
  .get(getLibraryProfile)
  .put(updateLibraryProfile);

export default router;
