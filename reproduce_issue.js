import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logStream = fs.createWriteStream(path.join(__dirname, 'reproduce_log.txt'), { flags: 'a' });

function log(message) {
    console.log(message);
    logStream.write(message + '\n');
}

function convertGoogleDriveUrl(url) {
    if (!url) return url;

    // Check if it's a Google Drive URL
    if (url.includes('drive.google.com')) {
        // Try to extract the ID
        // Matches /file/d/ID/view or /open?id=ID
        const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);

        if (idMatch && idMatch[1]) {
            const fileId = idMatch[1];
            log(`   🔄 Converting Google Drive URL to direct link (ID: ${fileId})`);
            return `https://drive.google.com/uc?export=download&id=${fileId}`;
        }
    }

    return url;
}

async function downloadImageFromUrl(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];

        // Check for HTML content (indicates error/login page)
        if (contentType && contentType.includes('text/html')) {
            log(`⚠️  Downloaded content is HTML, not an image. This usually means the Google Drive link is private.`);
            log(`   URL: ${imageUrl}`);
            return null;
        }

        let fileName = 'image.jpg';
        const contentDisposition = response.headers['content-disposition'];

        // Try to get filename from Content-Disposition
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                fileName = filenameMatch[1];
            }
        } else {
            // Fallback to URL path
            const urlPath = new URL(imageUrl).pathname;
            fileName = path.basename(urlPath) || 'image';
        }

        // Ensure filename has correct extension based on Content-Type
        // Note: reproduce_issue.js doesn't have mime-types imported, so we need to add it or mock it.
        // For this test, I'll just assume it works or use a simple map if needed.
        // But wait, I can import it.

        // I need to add import mime from 'mime-types'; to the top of the file first.
        // For now, I will just log the filename and contentType to see what we get.

        log(`Detected Content-Type: ${contentType}`);
        log(`Initial Filename: ${fileName}`);

        return {
            buffer: Buffer.from(response.data),
            mimeType: contentType,
            fileName: fileName,
        };
    } catch (error) {
        log(`⚠️  Failed to download image from URL "${imageUrl}": ${error.message}`);
        return null;
    }
}

async function test() {
    const originalUrl = 'https://drive.google.com/file/d/106UqbiAdo-z6ROElnyEqHI-8Klhb_g2Z/view?usp=sharing';
    log(`Original URL: ${originalUrl}`);

    const idMatch = originalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = idMatch ? idMatch[1] : null;

    if (fileId) {
        const lh3Url = `https://lh3.googleusercontent.com/d/${fileId}`;
        log(`Testing LH3 URL: ${lh3Url}`);
        const result = await downloadImageFromUrl(lh3Url);
        if (result) {
            log('LH3 Download successful!');
            const outputPath = path.join(__dirname, 'test_download_lh3.jpg');
            fs.writeFileSync(outputPath, result.buffer);
            log(`Saved to: ${outputPath}`);
        } else {
            log('LH3 Download failed.');
        }
    }

    const convertedUrl = convertGoogleDriveUrl(originalUrl);
    log(`Converted URL: ${convertedUrl}`);

    if (convertedUrl === originalUrl) {
        log('URL was not converted (regex match failed?)');
    }

    const result = await downloadImageFromUrl(convertedUrl);
    if (result) {
        log('Standard Download successful!');
        const outputPath = path.join(__dirname, 'test_download_std.jpg');
        fs.writeFileSync(outputPath, result.buffer);
        log(`Saved to: ${outputPath}`);
    } else {
        log('Standard Download failed.');
    }
}

test();
