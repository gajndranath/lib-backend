import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
} from "../controllers/room.controller.js";

const router = Router();

router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);

router
  .route("/")
  .get(getAllRooms)
  .post(authorizeRoles(UserRoles.SUPER_ADMIN), createRoom);

router
  .route("/:roomId")
  .get(getRoomById)
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), updateRoom)
  .delete(authorizeRoles(UserRoles.SUPER_ADMIN), deleteRoom);

export default router;
