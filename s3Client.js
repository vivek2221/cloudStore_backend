import { S3Client } from '@aws-sdk/client-s3';

const clientConfig = {
    region: process.env.AWS_REGION || 'ap-south-1'
};

// If keys are provided in .env, use them. Otherwise, let AWS SDK check instance IAM role.
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
}

const s3Client = new S3Client(clientConfig);

const bucketName = process.env.AWS_S3_BUCKET_NAME || 'cloudstoreapplication';

export { s3Client, bucketName };

