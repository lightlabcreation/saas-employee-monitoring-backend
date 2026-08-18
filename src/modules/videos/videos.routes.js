const express = require('express');
const router = express.Router();
const multer = require('multer');
const videosController = require('./videos.controller');
const { verifyToken } = require('../../utils/jwt');
const { errorResponse } = require('../../utils/response');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max per chunk
});

// Custom middleware to handle JWT, Agent-specific Base64 tokens, or query token
const combinedAuth = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['x-agent-auth'] || req.headers['X-Agent-Auth'];
    let token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader) : null;

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) return errorResponse(res, 'Authentication required', 401);

    // 1. Try Agent Token (Base64)
    try {
        const decoded = Buffer.from(token, 'base64').toString('ascii');
        if (decoded.includes('INSIGHTFUL')) {
            const [empId, devId] = decoded.split(':');
            req.user = { employeeId: empId, deviceId: devId, role: 'AGENT' };
            return next();
        }
    } catch (e) {
        // Not a base64 agent token, continue to JWT
    }

    // 2. Try JWT Token
    const user = verifyToken(token);
    if (user) {
        req.user = user;
        return next();
    }

    return errorResponse(res, 'Invalid or expired token', 401);
};

// All routes require authentication
router.use(combinedAuth);

// POST /api/videos — Upload a video chunk from the tracker agent
router.post('/', upload.single('video'), videosController.uploadVideo);

// GET /api/videos — Get list of video recordings (role-based)
router.get('/', videosController.getVideos);

// GET /api/videos/:id/stream — Securely stream a video recording (with authorization)
router.get('/:id/stream', videosController.streamVideo);

// DELETE /api/videos/:id — Delete a video recording
router.delete('/:id', videosController.deleteVideo);

module.exports = router;
