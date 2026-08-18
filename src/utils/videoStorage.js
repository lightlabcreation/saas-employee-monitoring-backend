const fs = require('fs');
const path = require('path');
const { uploadToR2, deleteFromR2 } = require('./r2Storage');

/**
 * Checks if Cloudflare R2 is fully configured either on the Organization level or in process.env
 * @param {Object} orgConfig 
 * @returns {boolean}
 */
function isR2Configured(orgConfig = {}) {
    const accountId = orgConfig.r2AccountId || process.env.R2_ACCOUNT_ID;
    const accessKeyId = orgConfig.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = orgConfig.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = orgConfig.r2BucketName || process.env.R2_BUCKET_NAME;
    const endpoint = orgConfig.r2Endpoint || process.env.R2_ENDPOINT;

    return !!(accountId && accessKeyId && secretAccessKey && bucketName && endpoint);
}

/**
 * Uploads a video buffer either to Cloudflare R2 or to a local folder as fallback
 * @param {Buffer} fileBuffer 
 * @param {string} mimeType 
 * @param {string} organizationId 
 * @param {string} employeeId 
 * @param {Object} orgConfig 
 * @returns {Promise<{storageType: string, storageKey: string, fileUrl: string}>}
 */
async function uploadVideo(fileBuffer, mimeType, organizationId, employeeId, orgConfig = {}) {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    const uniqueId = Math.round(Math.random() * 1e9);
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';

    // R2 Object Key Structure
    const r2Key = `recordings/organization/${organizationId}/employee/${employeeId}/${YYYY}/${MM}/${DD}/recording-${timestamp}-${uniqueId}.${ext}`;

    // Attempt Cloudflare R2 if configured
    if (isR2Configured(orgConfig)) {
        try {
            console.log('[VideoStorage] Video storage: Cloudflare R2');
            const fileUrl = await uploadToR2(fileBuffer, r2Key, mimeType, orgConfig);
            console.log('[VideoStorage] Video uploaded to R2:', fileUrl);
            return {
                storageType: 'R2',
                storageKey: r2Key,
                fileUrl: fileUrl
            };
        } catch (r2Err) {
            console.error('[VideoStorage] R2 upload failed, using local fallback:', r2Err.message);
        }
    } else {
        console.log('[VideoStorage] Video storage: Local fallback (R2 not configured)');
    }

    // Local Fallback Storage
    const subPath = `screenrecording/${organizationId}/${employeeId}/${YYYY}/${MM}/${DD}/recording-${timestamp}-${uniqueId}.${ext}`;
    
    // Resolve absolute path relative to project root
    const rootPath = path.join(__dirname, '../..');
    const absolutePath = path.join(rootPath, subPath);
    const absoluteDir = path.dirname(absolutePath);

    try {
        if (!fs.existsSync(absoluteDir)) {
            fs.mkdirSync(absoluteDir, { recursive: true });
        }
        fs.writeFileSync(absolutePath, fileBuffer);
        console.log('[VideoStorage] Video saved to local screenrecording storage:', subPath);
        return {
            storageType: 'LOCAL',
            storageKey: subPath,
            // We set placeholder URL first, controller will replace STREAM_ID with real record ID
            fileUrl: `/api/videos/STREAM_ID/stream`
        };
    } catch (fsErr) {
        console.error('[VideoStorage] Failed to save video locally:', fsErr.message);
        throw fsErr;
    }
}

/**
 * Deletes a video recording from the active storage medium
 * @param {string} storageType 
 * @param {string} storageKey 
 * @param {Object} orgConfig 
 * @returns {Promise<void>}
 */
async function deleteVideo(storageType, storageKey, orgConfig = {}) {
    if (!storageKey) return;

    if (storageType === 'R2') {
        try {
            await deleteFromR2(storageKey, orgConfig);
            console.log('[VideoStorage] Deleted R2 object:', storageKey);
        } catch (r2Err) {
            console.error('[VideoStorage] Failed to delete R2 object:', r2Err.message);
            throw r2Err;
        }
    } else {
        // LOCAL Mode
        const rootPath = path.join(__dirname, '../..');
        const absolutePath = path.join(rootPath, storageKey);
        try {
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
                console.log('[VideoStorage] Deleted local file:', storageKey);
            } else {
                console.warn('[VideoStorage] Local file not found for deletion:', storageKey);
            }
        } catch (fsErr) {
            console.error('[VideoStorage] Failed to delete local file:', fsErr.message);
            // Non-blocking warning as requested
        }
    }
}

module.exports = {
    isR2Configured,
    uploadVideo,
    deleteVideo
};
