import { Router } from "express";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import {
  apiLimiter,
  publicKeyLimiter,
} from "../middlewares/rateLimiter.middleware.js";
import {
  setStudentPublicKey,
  setStudentKeyBackup,
  getStudentKeyBackup,
  getPublicKey,
  createOrGetConversation,
  listConversations,
  listMessages,
  sendMessage,
} from "../controllers/studentChat.controller.js";
import {
  sendFriendRequest,
  listFriendRequests,
  respondFriendRequest,
  listFriends,
  removeFriend,
  blockStudent,
  unblockStudent,
  listBlocked,
} from "../controllers/studentFriend.controller.js";

const router = Router();

router.use(apiLimiter);
router.use(verifyStudentJWT);

router.route("/keys").post(setStudentPublicKey);
router.route("/keys/:userType/:userId").get(publicKeyLimiter, getPublicKey);
router.route("/keys/backup").get(getStudentKeyBackup);
router.route("/keys/backup").post(setStudentKeyBackup);

router
  .route("/conversations")
  .get(listConversations)
  .post(createOrGetConversation);
router.route("/conversations/:conversationId/messages").get(listMessages);
router.route("/messages").post(sendMessage);

router.route("/friends").get(listFriends);
router.route("/friends/remove").post(removeFriend);
router.route("/friends/block").post(blockStudent);
router.route("/friends/unblock").post(unblockStudent);
router.route("/friends/blocked").get(listBlocked);
router.route("/friends/request").post(sendFriendRequest);
router.route("/friends/requests").get(listFriendRequests);
router.route("/friends/requests/:requestId/respond").post(respondFriendRequest);

export default router;
