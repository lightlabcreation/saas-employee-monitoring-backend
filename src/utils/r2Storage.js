const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const logger = require("./logger");

function getR2Client(orgConfig = {}) {
    const accountId = orgConfig.r2AccountId || process.env.R2_ACCOUNT_ID;
    const accessKeyId = orgConfig.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = orgConfig.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
    const endpoint = orgConfig.r2Endpoint || process.env.R2_ENDPOINT;

    if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
        throw new Error("Cloudflare R2 credentials are not fully configured.");
    }

    return new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });
}

async function uploadToR2(fileBuffer, key, mimeType, orgConfig = {}) {
    const client = getR2Client(orgConfig);
    const bucketName = orgConfig.r2BucketName || process.env.R2_BUCKET_NAME;

    if (!bucketName) {
        throw new Error("Cloudflare R2 Bucket Name is not configured.");
    }

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
    });

    await client.send(command);

    const endpoint = orgConfig.r2Endpoint || process.env.R2_ENDPOINT;
    const cleanEndpoint = endpoint.replace(/\/$/, "");
    return `${cleanEndpoint}/${bucketName}/${key}`;
}

async function deleteFromR2(key, orgConfig = {}) {
    const client = getR2Client(orgConfig);
    const bucketName = orgConfig.r2BucketName || process.env.R2_BUCKET_NAME;

    if (!bucketName) {
        throw new Error("Cloudflare R2 Bucket Name is not configured.");
    }

    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    await client.send(command);
}

module.exports = { uploadToR2, deleteFromR2 };
