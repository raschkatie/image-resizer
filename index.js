const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const stream = require('stream');
const sharp = require('sharp');
const { promisify } = require('util');
const s3 = new S3Client({ region: 'us-east-2' });

exports.handler = async(event) => {
    console.log('Event received: ', JSON.stringify(event, null, 2));

    // extracts bucket and S3 key from uploaded file
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    // creates command object that knows which file to grab
    const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
    });

    // sends the command using s3 client and awaits response
    const originalImage = await s3.send(getCommand);

    console.log('Fetched image metadata: ', {
        ContentType: originalImage.ContentType,
        ContentLength: originalImage.ContentLength
    });

    // takes the S3 stream and converts to single buffer for sharp
    const streamToBuffer = promisify(stream.pipeline);
    const chunks = [];

    // creates pipeline to catch stream
    await streamToBuffer(
        originalImage.Body,
        new stream.Writable({
            write(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            },
            final(callback) {
                callback();
            }
        })
    );

    // combines array into single file again
    const imageBuffer = Buffer.concat(chunks);

    // resizes image
    const resizedImage = await sharp(imageBuffer)
        .resize({ width: 300 })
        .toBuffer();

    // indicate new folder location
    const resizedKey = key.replace('original-images/', 'resized-images/');

    const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: resizedKey,
        Body: resizedImage,
        ContentType: 'image/jpeg'
    });

    await s3.send(putCommand);

    console.log(`Successfully resized and uploaded: ${resizedKey}`);
};