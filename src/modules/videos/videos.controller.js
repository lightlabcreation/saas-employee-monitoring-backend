const { successResponse, errorResponse } = require('../../utils/response');
const { getOrganizationId } = require('../../utils/orgId');
const prisma = require('../../config/db');
const videoStorage = require('../../utils/videoStorage');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const videosController = {
    // POST /api/videos — Upload a video recording chunk from the TrackerAgent
    uploadVideo: async (req, res) => {
        try {
            const { employeeId, startTime, endTime, duration, fileName } = req.body;

            if (!employeeId) {
                return errorResponse(res, 'employeeId is required', 400);
            }
            if (!req.file) {
                return errorResponse(res, 'video file is required', 400);
            }

            // Find employee and organization settings
            const employee = await prisma.employee.findUnique({
                where: { id: employeeId },
                include: { organization: true }
            });

            if (!employee) {
                return errorResponse(res, 'Employee not found', 404);
            }

            const organizationId = employee.organizationId;

            // Get organization credentials config
            const orgConfig = {
                r2AccountId: employee.organization.r2AccountId,
                r2AccessKeyId: employee.organization.r2AccessKeyId,
                r2SecretAccessKey: employee.organization.r2SecretAccessKey,
                r2BucketName: employee.organization.r2BucketName,
                r2Endpoint: employee.organization.r2Endpoint
            };

            // Call centralized storage service to determine target storage medium (R2 vs. LOCAL)
            const uploadResult = await videoStorage.uploadVideo(
                req.file.buffer,
                req.file.mimetype || 'video/webm',
                organizationId,
                employeeId,
                orgConfig
            );

            const ext = req.file.mimetype.includes('webm') ? 'webm' : 'mp4';
            const sizeMb = parseFloat((req.file.size / (1024 * 1024)).toFixed(2));
            const mimeType = req.file.mimetype || `video/${ext}`;
            const timestamp = Date.now();

            // Persist metadata to DB
            let record = await prisma.videoRecording.create({
                data: {
                    employeeId,
                    organizationId,
                    fileUrl: uploadResult.fileUrl,
                    storageKey: uploadResult.storageKey,
                    storageType: uploadResult.storageType,
                    fileName: fileName || `recording-${timestamp}.${ext}`,
                    mimeType,
                    startTime: startTime ? new Date(startTime) : new Date(timestamp - (parseInt(duration) || 0) * 1000),
                    endTime: endTime ? new Date(endTime) : new Date(timestamp),
                    duration: duration ? parseInt(duration, 10) : 0,
                    sizeMb,
                    fileSize: req.file.size,
                    status: 'UPLOADED'
                },
                include: {
                    employee: { select: { id: true, fullName: true } },
                },
            });

            // Update local fallback route dynamically to include correct database record ID
            if (uploadResult.storageType === 'LOCAL') {
                record = await prisma.videoRecording.update({
                    where: { id: record.id },
                    data: {
                        fileUrl: `/api/videos/${record.id}/stream`
                    },
                    include: {
                        employee: { select: { id: true, fullName: true } },
                    }
                });
            }

            return successResponse(res, record, 'Video recording uploaded successfully');
        } catch (error) {
            console.error('[VideosController] Error uploading video:', error);
            return errorResponse(res, error.message);
        }
    },

    // GET /api/videos — Fetch video recordings (role-based)
    getVideos: async (req, res) => {
        try {
            const organizationId = await getOrganizationId(req);
            const { role, employeeId: userId } = req.user;
            const { employeeId, limit = 50, offset = 0, date } = req.query;

            let where = { organizationId };

            if (role === 'EMPLOYEE') {
                where.employeeId = userId;
            } else if (employeeId && employeeId !== 'All') {
                where.employeeId = employeeId;
            }

            // Date filtering (YYYY-MM-DD)
            if (date) {
                const start = new Date(`${date}T00:00:00.000Z`);
                const end = new Date(`${date}T23:59:59.999Z`);
                where.createdAt = {
                    gte: start,
                    lte: end
                };
            }

            const videos = await prisma.videoRecording.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit, 10),
                skip: parseInt(offset, 10),
                include: {
                    employee: { select: { id: true, fullName: true, avatar: true } },
                },
            });

            return successResponse(res, videos, 'Videos fetched successfully');
        } catch (error) {
            console.error('[VideosController] Error fetching videos:', error);
            return errorResponse(res, error.message);
        }
    },

    // GET /api/videos/:id/stream - Securely stream local or cloud recordings with authorization checks
    streamVideo: async (req, res) => {
        try {
            const { id } = req.params;
            const { role, employeeId: userId } = req.user;
            const organizationId = await getOrganizationId(req);

            // Fetch video recording details
            const video = await prisma.videoRecording.findUnique({
                where: { id },
                include: { organization: true }
            });

            if (!video) {
                return errorResponse(res, 'Video recording not found', 404);
            }

            // Access Control Checks
            if (role === 'EMPLOYEE' && video.employeeId !== userId) {
                return errorResponse(res, 'Unauthorized to view this recording', 403);
            }
            if (role === 'ADMIN' && video.organizationId !== organizationId) {
                return errorResponse(res, 'Unauthorized to view this recording', 403);
            }

            if (video.storageType === 'R2') {
                // Fetch credentials
                const orgConfig = {
                    r2AccountId: video.organization.r2AccountId,
                    r2AccessKeyId: video.organization.r2AccessKeyId,
                    r2SecretAccessKey: video.organization.r2SecretAccessKey,
                    r2BucketName: video.organization.r2BucketName,
                    r2Endpoint: video.organization.r2Endpoint
                };

                const accountId = orgConfig.r2AccountId || process.env.R2_ACCOUNT_ID;
                const accessKeyId = orgConfig.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID;
                const secretAccessKey = orgConfig.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
                const endpoint = orgConfig.r2Endpoint || process.env.R2_ENDPOINT;
                const bucketName = orgConfig.r2BucketName || process.env.R2_BUCKET_NAME;

                const s3 = new S3Client({
                    region: "auto",
                    endpoint: endpoint,
                    credentials: {
                        accessKeyId: accessKeyId,
                        secretAccessKey: secretAccessKey,
                    },
                });

                const rangeHeader = req.headers.range;
                const params = {
                    Bucket: bucketName,
                    Key: video.storageKey
                };

                if (rangeHeader) {
                    params.Range = rangeHeader;
                }

                const command = new GetObjectCommand(params);
                const s3Response = await s3.send(command);

                if (rangeHeader) {
                    res.status(206);
                    if (s3Response.ContentRange) {
                        res.setHeader('Content-Range', s3Response.ContentRange);
                    }
                }

                res.setHeader('Content-Type', video.mimeType || 'video/webm');
                if (s3Response.ContentLength) {
                    res.setHeader('Content-Length', s3Response.ContentLength);
                }
                res.setHeader('Accept-Ranges', 'bytes');

                // Pipe file stream directly to response
                s3Response.Body.pipe(res);
            } else {
                // LOCAL fallback
                const rootPath = path.join(__dirname, '../../..');
                const absolutePath = path.join(rootPath, video.storageKey);

                if (!fs.existsSync(absolutePath)) {
                    return errorResponse(res, 'Video file not found on local disk', 404);
                }

                res.setHeader('Accept-Ranges', 'bytes');
                res.sendFile(absolutePath);
            }
        } catch (error) {
            console.error('[VideosController] Error streaming video:', error);
            return errorResponse(res, error.message);
        }
    },

    // DELETE /api/videos/:id
    deleteVideo: async (req, res) => {
        try {
            const { id } = req.params;
            const { role, employeeId: userId } = req.user;

            const video = await prisma.videoRecording.findUnique({
                where: { id },
                include: { organization: true }
            });
            if (!video) return errorResponse(res, 'Video not found', 404);

            if (role === 'EMPLOYEE' && video.employeeId !== userId) {
                return errorResponse(res, 'Forbidden', 403);
            }

            // Centralized delete routine
            if (video.storageKey) {
                const orgConfig = {
                    r2AccountId: video.organization.r2AccountId,
                    r2AccessKeyId: video.organization.r2AccessKeyId,
                    r2SecretAccessKey: video.organization.r2SecretAccessKey,
                    r2BucketName: video.organization.r2BucketName,
                    r2Endpoint: video.organization.r2Endpoint
                };
                try {
                    await videoStorage.deleteVideo(video.storageType, video.storageKey, orgConfig);
                } catch (storageErr) {
                    console.warn('[VideosController] Storage deletion warned/failed:', storageErr.message);
                }
            }

            await prisma.videoRecording.delete({ where: { id } });
            return successResponse(res, null, 'Video deleted successfully');
        } catch (error) {
            console.error('[VideosController] Error deleting video:', error);
            return errorResponse(res, error.message);
        }
    },
};

module.exports = videosController;
