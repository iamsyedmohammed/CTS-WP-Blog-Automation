import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const WP_SITE = process.env.WP_SITE?.replace(/\/$/, '') || '';
const WP_USER = process.env.WP_USER || '';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

if (!WP_SITE || !WP_USER || !WP_APP_PASSWORD) {
    console.error('Missing env vars');
    process.exit(1);
}

const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
const api = axios.create({
    baseURL: `${WP_SITE}/wp-json/wp/v2`,
    headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
    },
});

async function debugMeta() {
    const logs = [];
    const log = (...args) => {
        console.log(...args);
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    };

    try {
        // 1. Get a recent post
        log('Getting a recent post...');
        const posts = await api.get('/posts', { params: { per_page: 1 } });
        if (posts.data.length === 0) {
            log('No posts found.');
            fs.writeFileSync('debug_result.json', JSON.stringify({ logs }, null, 2));
            return;
        }
        const post = posts.data[0];
        log(`Testing on Post ID: ${post.id}, Title: ${post.title.rendered}`);

        // 2. Try to update Yoast Meta (Top-level fields via helper plugin)
        const timestamp = Date.now();
        const metaUpdate = {
            _yoast_wpseo_title: 'TEST META TITLE ' + timestamp,
            _yoast_wpseo_metadesc: 'TEST META DESC ' + timestamp,
        };

        log('Sending update:', metaUpdate);
        const updateResponse = await api.post(`/posts/${post.id}`, metaUpdate);

        // 3. Check response
        log('Update status:', updateResponse.status);

        // 4. Fetch again to verify
        const verifyResponse = await api.get(`/posts/${post.id}`);
        const updatedPost = verifyResponse.data;

        log('Meta in response (Top Level):');
        log('_yoast_wpseo_title:', updatedPost._yoast_wpseo_title);
        log('_yoast_wpseo_metadesc:', updatedPost._yoast_wpseo_metadesc);

        if (updatedPost._yoast_wpseo_title === metaUpdate._yoast_wpseo_title) {
            log('✅ SUCCESS: Yoast title updated!');
        } else {
            log('❌ FAILURE: Yoast title did NOT update.');
            log('Expected:', metaUpdate._yoast_wpseo_title);
            log('Actual:', updatedPost._yoast_wpseo_title);
        }

    } catch (error) {
        log('Error:', error.message);
        if (error.response) {
            log('Response data:', error.response.data);
        }
    }

    fs.writeFileSync('debug_result.json', JSON.stringify({ logs }, null, 2));
}

debugMeta();
