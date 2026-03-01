import { Router } from 'express';
import multer from 'multer';
import { storage } from '../config/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAnyJWT } from '../middlewares/auth.middleware.js';

const router = Router();
const upload = multer({ storage });

// Secure image upload endpoint
router.post('/image', verifyAnyJWT, upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json(new ApiResponse(400, null, "No image file provided"));
    }

    return res.status(200).json(
        new ApiResponse(200, {
            url: req.file.path,
            publicId: req.file.filename,
            format: req.file.format,
            size: req.file.size
        }, "Image uploaded successfully")
    );
}));

export default router;
