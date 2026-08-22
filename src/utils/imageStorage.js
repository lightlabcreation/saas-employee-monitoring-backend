const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { v2: cloudinary } = require('cloudinary');

const prisma = require('../config/db');

const ROOT_PUBLIC_DIR = path.join(__dirname, '../../public');
const SCREENSHOT_UPLOAD_DIR = path.join(ROOT_PUBLIC_DIR, 'uploads/screenshots');

async function resolveCloudinaryConfig(organizationId) {
    if (organizationId) {
        try {
            const org = await prisma.organization.findUnique({
                where: { id: organizationId },
                select: { cloudinaryCloudName: true, cloudinaryApiKey: true, cloudinaryApiSecret: true }
            });
            if (org && org.cloudinaryCloudName && org.cloudinaryApiKey && org.cloudinaryApiSecret) {
                return {
                    cloud_name: org.cloudinaryCloudName,
                    api_key: org.cloudinaryApiKey,
                    api_secret: org.cloudinaryApiSecret
                };
            }
        } catch (err) {
            console.warn('[imageStorage] Error fetching org cloudinary credentials:', err.message);
        }
    }

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        return {
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        };
    }

    return null;
}

function isCloudinaryConfigured(organizationId) {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        return true;
    }
    return false;
}

function configureCloudinary(customConfig) {
    if (customConfig) {
        cloudinary.config(customConfig);
    } else {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }
}

function ensureLocalUploadDir() {
    if (!fs.existsSync(SCREENSHOT_UPLOAD_DIR)) {
        fs.mkdirSync(SCREENSHOT_UPLOAD_DIR, { recursive: true });
    }
}

function getCloudinaryPublicIdFromUrl(url) {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const uploadMarker = '/upload/';
    const uploadIdx = url.indexOf(uploadMarker);
    if (uploadIdx === -1) return null;

    let tail = url.substring(uploadIdx + uploadMarker.length);
    tail = tail.replace(/^v\d+\//, '');
    tail = tail.split('?')[0];
    const dotIdx = tail.lastIndexOf('.');
    if (dotIdx > -1) tail = tail.substring(0, dotIdx);

    return tail || null;
}

async function processImageBuffer(buffer, options = {}) {
    const { format = 'jpeg', quality = 70, blur = false } = options;
    let pipeline = sharp(buffer);

    if (blur) pipeline = pipeline.blur(15);

    if (format === 'webp') {
        return pipeline.webp({ quality }).toBuffer();
    }
    return pipeline.jpeg({ quality }).toBuffer();
}

async function uploadImageBuffer(buffer, options = {}) {
    const {
        format = 'jpeg',
        quality = 70,
        folder = 'insightful/screenshots',
        fileNamePrefix = 'screenshot',
        useCloudinary = true,
        blur = false,
        organizationId = null
    } = options;

    const processedBuffer = await processImageBuffer(buffer, { format, quality, blur });

    if (useCloudinary) {
        const cloudConfig = await resolveCloudinaryConfig(organizationId);
        if (cloudConfig) {
            configureCloudinary(cloudConfig);
            const publicId = `${fileNamePrefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

            const result = await cloudinary.uploader.upload(
                `data:image/${format};base64,${processedBuffer.toString('base64')}`,
                {
                    folder,
                    public_id: publicId,
                    resource_type: 'image'
                }
            );

            return {
                imageUrl: result.secure_url,
                publicId: result.public_id,
                storage: 'cloudinary'
            };
        }
    }

    ensureLocalUploadDir();
    const extension = format === 'webp' ? 'webp' : 'jpeg';
    const fileName = `${fileNamePrefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
    const filePath = path.join(SCREENSHOT_UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, processedBuffer);

    return {
        imageUrl: `/uploads/screenshots/${fileName}`,
        publicId: null,
        storage: 'local'
    };
}

async function deleteImageByUrl(imageUrl, organizationId = null) {
    if (!imageUrl) return;

    if (imageUrl.startsWith('/uploads/')) {
        const filePath = path.join(ROOT_PUBLIC_DIR, imageUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return;
    }

    const publicId = getCloudinaryPublicIdFromUrl(imageUrl);
    if (publicId) {
        const cloudConfig = await resolveCloudinaryConfig(organizationId);
        if (cloudConfig) {
            configureCloudinary(cloudConfig);
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        }
    }
}

module.exports = {
    uploadImageBuffer,
    deleteImageByUrl,
    isCloudinaryConfigured,
    resolveCloudinaryConfig
};
