import axios from 'axios';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mime from 'mime-types';
import dotenv from 'dotenv';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Global state for current client configuration
let currentConfig = null;
let currentApi = null;

// Logging
let logResults = [];
let startTime = Date.now();

/**
 * Load clients configuration from environment variable or clients.json
 */
function loadClientsConfig() {
  // First, try to load from environment variable (CLIENTS_CONFIG)
  if (process.env.CLIENTS_CONFIG) {
    try {
      const clientsConfig = JSON.parse(process.env.CLIENTS_CONFIG);
      console.log('✅ Loaded client configurations from environment variable');
      return clientsConfig;
    } catch (error) {
      console.error('❌ Failed to parse CLIENTS_CONFIG environment variable:', error.message);
      console.error('   Falling back to clients.json file...');
    }
  }
  
  // Fallback to clients.json file
  const configPath = path.join(__dirname, 'clients.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ No client configuration found.');
    console.error('   Please either:');
    console.error('   1. Set CLIENTS_CONFIG environment variable with JSON configuration, or');
    console.error('   2. Create clients.json file with your client configurations.');
    console.error('   See README.md for instructions.');
    process.exit(1);
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('✅ Loaded client configurations from clients.json file');
    return config;
  } catch (error) {
    console.error('❌ Failed to parse clients.json:', error.message);
    process.exit(1);
  }
}

/**
 * Get client configuration
 */
function getClientConfig(clientKey = 'default') {
  const clients = loadClientsConfig();
  if (!clients[clientKey]) {
    console.error(`❌ Client "${clientKey}" not found in clients.json`);
    console.error(`Available clients: ${Object.keys(clients).join(', ')}`);
    process.exit(1);
  }
  return clients[clientKey];
}

/**
 * Initialize configuration and API instance for a client
 */
function initializeClient(clientKey = null) {
  // Try to get client from environment variable first, then parameter, then default
  const selectedClient = clientKey || process.env.CLIENT || 'default';
  const clientConfig = getClientConfig(selectedClient);
  
  // Fallback to environment variables if not in config
  const config = {
    WP_SITE: (clientConfig.wp_site || process.env.WP_SITE || '').replace(/\/$/, ''),
    WP_USER: clientConfig.wp_user || process.env.WP_USER || '',
    WP_APP_PASSWORD: clientConfig.wp_app_password || process.env.WP_APP_PASSWORD || '',
    DEFAULT_STATUS: clientConfig.default_status || process.env.DEFAULT_STATUS || 'draft',
    REQUEST_DELAY_MS: parseInt(clientConfig.request_delay_ms || process.env.REQUEST_DELAY_MS || '300', 10),
    CLIENT_NAME: clientConfig.name || selectedClient,
    CLIENT_KEY: selectedClient
  };
  
  // Validate required config
  if (!config.WP_SITE || !config.WP_USER || !config.WP_APP_PASSWORD) {
    throw new Error(`Missing required configuration for client "${selectedClient}": WP_SITE, WP_USER, WP_APP_PASSWORD`);
  }

  // Create axios instance with auth
  const auth = Buffer.from(`${config.WP_USER}:${config.WP_APP_PASSWORD}`).toString('base64');
  const api = axios.create({
    baseURL: `${config.WP_SITE}/wp-json/wp/v2`,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // Store current config and API
  currentConfig = config;
  currentApi = api;

  return { config, api };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Prompt user for CSV file path
 */
function promptForCsvPath(defaultPath) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const promptText = defaultPath 
      ? `\n📁 Enter CSV file path [${defaultPath}]: `
      : '\n📁 Enter CSV file path: ';

    rl.question(promptText, (answer) => {
      rl.close();
      const userInput = answer.trim();
      // If user pressed Enter, use the suggested default; otherwise use their input
      resolve(userInput || defaultPath || 'posts.csv');
    });
  });
}

/**
 * Load and parse CSV file
 */
async function loadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    // Support both absolute and relative paths
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(__dirname, filePath);
    
    if (!fs.existsSync(fullPath)) {
      reject(new Error(`CSV file not found: ${fullPath}`));
      return;
    }

    fs.createReadStream(fullPath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Check WordPress REST API connectivity
 */
async function checkConnectivity(apiInstance = currentApi, siteUrl = currentConfig?.WP_SITE) {
  if (!apiInstance) {
    console.error('❌ API instance not initialized. Call initializeClient() first.');
    return false;
  }
  try {
    console.log('🔍 Checking WordPress REST API connectivity...');
    const response = await apiInstance.get('/posts', { params: { per_page: 1 } });
    console.log('✅ WordPress REST API is accessible\n');
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed. Check WP_USER and WP_APP_PASSWORD.');
    } else if (error.response?.status === 403) {
      console.error('❌ REST API is blocked. Enable it in WordPress settings.');
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error(`❌ Cannot reach ${siteUrl || 'WordPress site'}. Check WP_SITE URL.`);
    } else {
      console.error(`❌ Connectivity check failed: ${error.message}`);
    }
    return false;
  }
}

/**
 * Get or create a taxonomy term (category or tag)
 */
async function getOrCreateTerm(name, taxonomy = 'categories', apiInstance = currentApi, delayMs = currentConfig?.REQUEST_DELAY_MS || 300) {
  if (!name || !name.trim()) return null;
  if (!apiInstance) {
    console.error('❌ API instance not initialized.');
    return null;
  }

  const trimmedName = name.trim();
  
  try {
    // Search for existing term
    const searchResponse = await apiInstance.get(`/${taxonomy}`, {
      params: { search: trimmedName, per_page: 100 },
    });

    const existing = searchResponse.data.find(
      term => term.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      return existing.id;
    }

    // Create new term
    await sleep(delayMs);
    const createResponse = await apiInstance.post(`/${taxonomy}`, {
      name: trimmedName,
    });

    return createResponse.data.id;
  } catch (error) {
    console.error(`⚠️  Failed to get/create ${taxonomy} "${trimmedName}": ${error.message}`);
    return null;
  }
}

/**
 * Resolve multiple terms from comma-separated string
 */
async function resolveTerms(termString, taxonomy, apiInstance = currentApi, delayMs = currentConfig?.REQUEST_DELAY_MS || 300) {
  if (!termString || !termString.trim()) return [];

  const names = termString.split(',').map(n => n.trim()).filter(Boolean);
  const termIds = [];

  for (const name of names) {
    const id = await getOrCreateTerm(name, taxonomy, apiInstance, delayMs);
    if (id) {
      termIds.push(id);
    }
    await sleep(delayMs);
  }

  return termIds;
}

/**
 * Download image from URL
 */
async function downloadImageFromUrl(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    
    return {
      buffer: Buffer.from(response.data),
      mimeType: response.headers['content-type'] || mime.lookup(imageUrl) || 'image/jpeg',
      fileName: path.basename(new URL(imageUrl).pathname) || 'image.jpg',
    };
  } catch (error) {
    console.error(`⚠️  Failed to download image from URL "${imageUrl}": ${error.message}`);
    return null;
  }
}

/**
 * Upload featured image to WordPress media library (from local file or URL)
 */
async function uploadMedia(filePathOrUrl, apiInstance = currentApi, delayMs = currentConfig?.REQUEST_DELAY_MS || 300) {
  if (!filePathOrUrl || !filePathOrUrl.trim()) return null;
  if (!apiInstance) {
    console.error('❌ API instance not initialized.');
    return null;
  }

  let fileBuffer, fileName, mimeType;

  // Check if it's a URL (starts with http:// or https://)
  if (filePathOrUrl.trim().startsWith('http://') || filePathOrUrl.trim().startsWith('https://')) {
    // Download from URL
    const downloaded = await downloadImageFromUrl(filePathOrUrl.trim());
    if (!downloaded) return null;
    
    fileBuffer = downloaded.buffer;
    fileName = downloaded.fileName;
    mimeType = downloaded.mimeType;
  } else {
    // Local file path
    const fullPath = path.resolve(__dirname, filePathOrUrl);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`⚠️  Image file not found: ${fullPath}`);
      return null;
    }

    fileBuffer = fs.readFileSync(fullPath);
    fileName = path.basename(fullPath);
    mimeType = mime.lookup(fullPath) || 'application/octet-stream';
  }

  try {
    await sleep(delayMs);
    
    const response = await apiInstance.post('/media', fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return response.data.id;
  } catch (error) {
    console.error(`⚠️  Failed to upload media "${filePathOrUrl}": ${error.message}`);
    if (error.response?.data) {
      console.error(`   Error details: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Find existing post by slug
 */
async function findPostBySlug(slug, apiInstance = currentApi) {
  if (!slug || !slug.trim()) return null;
  if (!apiInstance) {
    console.error('❌ API instance not initialized.');
    return null;
  }

  try {
    const response = await apiInstance.get('/posts', {
      params: { slug: slug.trim(), per_page: 1 },
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].id;
    }

    return null;
  } catch (error) {
    console.error(`⚠️  Failed to search for post by slug "${slug}": ${error.message}`);
    return null;
  }
}

/**
 * Find existing post by title
 */
async function findPostByTitle(title, apiInstance = currentApi) {
  if (!title || !title.trim()) return null;
  if (!apiInstance) {
    console.error('❌ API instance not initialized.');
    return null;
  }

  try {
    // Normalize title for comparison (remove HTML entities, trim, lowercase)
    const normalizeTitle = (str) => {
      if (!str) return '';
      // Remove HTML entities and tags, then normalize
      // Handle common HTML entities first, then remove any remaining
      return str
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .replace(/&#8217;/g, "'") // Replace &#8217; (right single quotation) with '
        .replace(/&#8216;/g, "'") // Replace &#8216; (left single quotation) with '
        .replace(/&#39;/g, "'") // Replace &#39; with '
        .replace(/&#038;/g, '&') // Replace &#038; with &
        .replace(/&[^;]+;/g, '') // Remove any other HTML entities
        .replace(/\s+/g, ' ') // Normalize whitespace
        .toLowerCase()
        .trim();
    };

    const normalizedSearchTitle = normalizeTitle(title);
    console.log(`🔍 Searching for duplicate. Normalized title: "${normalizedSearchTitle}"`);
    
    // Paginate through ALL posts (including drafts) to check for duplicates
    // WordPress search API might not return drafts, so we check all posts directly
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    let totalChecked = 0;

    while (hasMore) {
      const response = await apiInstance.get('/posts', {
        params: { 
          per_page: perPage,
          page: page,
          status: 'any', // Include all statuses: publish, draft, private, pending, future
          orderby: 'date',
          order: 'desc'
        },
      });

      if (!response.data || response.data.length === 0) {
        hasMore = false;
        break;
      }

      totalChecked += response.data.length;
      console.log(`🔍 Checking page ${page}, ${response.data.length} posts (total checked: ${totalChecked})`);

      // Check each post in this page
      for (const post of response.data) {
        // Try multiple ways to get the title
        const postTitleRaw = post.title?.rendered || post.title?.raw || post.title || '';
        const postTitleNormalized = normalizeTitle(postTitleRaw);
        
        // Debug: log posts that might match (to reduce noise but still catch issues)
        const isMatch = postTitleNormalized === normalizedSearchTitle;
        const mightMatch = postTitleNormalized.includes('weekend brunch') || 
                          postTitleNormalized.includes('nafisa') ||
                          postTitleRaw.toLowerCase().includes('weekend brunch');
        
        if (isMatch || mightMatch) {
          console.log(`  📝 Post ID ${post.id} (${post.status}): "${postTitleRaw}"`);
          console.log(`     Normalized: "${postTitleNormalized}"`);
          console.log(`     Search for: "${normalizedSearchTitle}"`);
          console.log(`     Match: ${isMatch ? '✅ YES - DUPLICATE FOUND!' : '❌ NO'}`);
        }
        
        if (isMatch) {
          console.log(`✅ FOUND DUPLICATE! Post ID ${post.id} (status: ${post.status}) has matching title: "${postTitleRaw}"`);
          return post.id;
        }
      }

      // If we got fewer posts than requested, we've reached the end
      if (response.data.length < perPage) {
        hasMore = false;
      } else {
        page++;
        // Limit to first 10 pages (1000 posts) to avoid infinite loops
        if (page > 10) {
          console.log(`⚠️  Reached 1000 post limit. Stopping search.`);
          hasMore = false;
        }
      }
    }

    console.log(`✅ No duplicate found after checking ${totalChecked} posts`);
    return null;
  } catch (error) {
    console.error(`⚠️  Failed to search for post by title "${title}": ${error.message}`);
    // Don't throw - return null so we can continue processing other posts
    return null;
  }
}

/**
 * Create or update a post
 */
async function createOrUpdatePost(row, rowNumber, progressCallback = null, apiInstance = currentApi, config = currentConfig) {
  if (!apiInstance || !config) {
    throw new Error('API instance and config must be initialized. Call initializeClient() first.');
  }

  const result = {
    rowNumber,
    title: row.title || 'Untitled',
    action: null,
    postId: null,
    status: null,
    error: null,
  };

  try {
    // Validate required fields
    if (!row.title || !row.title.trim()) {
      throw new Error('Missing required field: title');
    }
    if (!row.content || !row.content.trim()) {
      throw new Error('Missing required field: content');
    }

    // Prepare post data
    const postData = {
      title: row.title.trim(),
      content: row.content.trim(),
      status: row.status?.trim() || config.DEFAULT_STATUS,
    };

    // Add optional fields
    if (row.slug?.trim()) {
      postData.slug = row.slug.trim();
    }
    if (row.excerpt?.trim()) {
      postData.excerpt = row.excerpt.trim();
    }

    // Handle ACF JSON
    if (row.acf_json?.trim()) {
      try {
        const acfData = JSON.parse(row.acf_json);
        postData.acf = acfData;
      } catch (parseError) {
        console.error(`⚠️  Invalid ACF JSON in row ${rowNumber}: ${parseError.message}`);
      }
    }

    // Resolve categories
    if (row.categories?.trim()) {
      const categoryIds = await resolveTerms(row.categories, 'categories', apiInstance, config.REQUEST_DELAY_MS);
      if (categoryIds.length > 0) {
        postData.categories = categoryIds;
      }
    }

    // Resolve tags
    if (row.tags?.trim()) {
      const tagIds = await resolveTerms(row.tags, 'tags', apiInstance, config.REQUEST_DELAY_MS);
      if (tagIds.length > 0) {
        postData.tags = tagIds;
      }
    }

    // Upload featured image if provided (supports both local path and URL)
    const imagePath = row.featured_image_path?.trim() || row.featured_image_url?.trim();
    if (imagePath) {
      const mediaId = await uploadMedia(imagePath, apiInstance, config.REQUEST_DELAY_MS);
      if (mediaId) {
        postData.featured_media = mediaId;
      }
    }

    // Check for existing post by title first (prevent duplicates)
    // This check happens BEFORE creating the post to prevent duplicate creation
    console.log(`[${rowNumber}] 🔍 Checking for duplicate post with title: "${postData.title}"`);
    const existingPostByTitle = await findPostByTitle(postData.title, apiInstance);
    if (existingPostByTitle) {
      const errorMsg = `Post with title "${postData.title}" already exists (ID: ${existingPostByTitle}). Duplicate posts are not allowed.`;
      console.error(`[${rowNumber}] ⚠️  DUPLICATE DETECTED: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    console.log(`[${rowNumber}] ✅ No duplicate found for title: "${postData.title}"`);

    // Check for existing post by slug (idempotency)
    let existingPostId = null;
    if (postData.slug) {
      existingPostId = await findPostBySlug(postData.slug, apiInstance);
    }

    // Create or update
    await sleep(config.REQUEST_DELAY_MS);

    if (existingPostId) {
      // Update existing post
      const updateResponse = await apiInstance.post(`/posts/${existingPostId}`, postData);
      result.action = 'updated';
      result.postId = updateResponse.data.id;
      result.status = updateResponse.data.status;
      const message = `[${rowNumber}] ✅ updated post ${result.postId}: ${result.title}`;
      console.log(message);
      if (progressCallback) progressCallback({ type: 'success', message, rowNumber, postId: result.postId, title: result.title });
    } else {
      // Create new post
      const createResponse = await apiInstance.post('/posts', postData);
      result.action = 'created';
      result.postId = createResponse.data.id;
      result.status = createResponse.data.status;
      const message = `[${rowNumber}] ✅ created post ${result.postId}: ${result.title}`;
      console.log(message);
      if (progressCallback) progressCallback({ type: 'success', message, rowNumber, postId: result.postId, title: result.title });
    }
  } catch (error) {
    result.error = error.message;
    if (error.response?.data) {
      result.error = `${error.message}: ${JSON.stringify(error.response.data)}`;
    }
    const errorMessage = `[${rowNumber}] ❌ failed: ${result.title} - ${result.error}`;
    console.error(errorMessage);
    if (progressCallback) progressCallback({ type: 'error', message: errorMessage, rowNumber, title: result.title, error: result.error });
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  // Get client from command line argument or environment variable
  let clientKey = null;
  let csvPath = null;
  
  // Parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--client=')) {
      clientKey = arg.split('=')[1];
    } else if (arg === '--client' && i + 1 < process.argv.length) {
      clientKey = process.argv[++i];
    } else if (!csvPath && !arg.startsWith('--')) {
      csvPath = arg;
    }
  }
  
  // Initialize client
  const { config, api: clientApi } = initializeClient(clientKey);
  
  console.log('🚀 WordPress Bulk Uploader\n');
  console.log(`Client: ${config.CLIENT_NAME}`);
  console.log(`Site: ${config.WP_SITE}`);
  console.log(`Default Status: ${config.DEFAULT_STATUS}`);
  console.log(`Request Delay: ${config.REQUEST_DELAY_MS}ms`);

  // Get CSV path: command-line argument > interactive prompt (with env as suggestion) > default
  if (!csvPath) {
    if (process.argv[2] && !process.argv[2].startsWith('--')) {
      csvPath = process.argv[2];
      console.log(`\nCSV: ${csvPath} (from command-line argument)`);
    } else {
      // Always prompt for file path, showing env variable as suggestion if it exists
      const suggestedPath = process.env.CSV_PATH || 'posts.csv';
      csvPath = await promptForCsvPath(suggestedPath);
      console.log(`\nCSV: ${csvPath}`);
    }
  } else {
    console.log(`\nCSV: ${csvPath} (from command-line argument)`);
  }

  // Check connectivity
  const isConnected = await checkConnectivity(clientApi, config.WP_SITE);
  if (!isConnected) {
    process.exit(1);
  }

  // Load CSV
  console.log(`📖 Loading CSV: ${csvPath}...`);
  let rows;
  try {
    rows = await loadCsv(csvPath);
    console.log(`✅ Loaded ${rows.length} row(s)\n`);
  } catch (error) {
    console.error(`❌ Failed to load CSV: ${error.message}`);
    console.error(`\n💡 Tips:`);
    console.error(`   - Use absolute path: C:\\Users\\YourName\\Documents\\file.csv`);
    console.error(`   - Use relative path: posts.csv (from script directory)`);
    console.error(`   - Or pass as argument: npm run upload "C:\\path\\to\\file.csv"`);
    console.error(`   - Use --client=client_key to specify client`);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('⚠️  CSV file is empty');
    process.exit(0);
  }

  // Process each row
  console.log('📤 Starting upload process...\n');
  for (let i = 0; i < rows.length; i++) {
    const result = await createOrUpdatePost(rows[i], i + 1, null, clientApi, config);
    logResults.push(result);
  }

  // Write log file
  // Use /tmp on Vercel (serverless), or __dirname for local development
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  const logPath = isVercel 
    ? path.join('/tmp', 'import_log.json')
    : path.resolve(__dirname, 'import_log.json');
  fs.writeFileSync(logPath, JSON.stringify(logResults, null, 2));
  console.log(`\n📝 Log written to: ${logPath}`);

  // Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  const successCount = logResults.filter(r => !r.error).length;
  const failedCount = logResults.filter(r => r.error).length;

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`⏱️  Total Time: ${duration}s`);
  console.log('='.repeat(50) + '\n');

  process.exit(failedCount > 0 ? 1 : 0);
}

/**
 * Process CSV file (exported for use by web server)
 */
export async function processCsvFile(csvPath, progressCallback = null, clientKey = 'default') {
  // Initialize client
  const { config, api: clientApi } = initializeClient(clientKey);
  
  // Reset logging for new run
  logResults = [];
  startTime = Date.now();

  // Check connectivity
  if (progressCallback) progressCallback({ type: 'info', message: `🔍 Checking WordPress REST API connectivity for ${config.CLIENT_NAME}...` });
  const isConnected = await checkConnectivity(clientApi, config.WP_SITE);
  if (!isConnected) {
    throw new Error('WordPress REST API is not accessible. Check your configuration.');
  }
  if (progressCallback) progressCallback({ type: 'info', message: '✅ WordPress REST API is accessible' });

  // Load CSV
  if (progressCallback) progressCallback({ type: 'info', message: '📖 Loading CSV file...' });
  let rows;
  try {
    rows = await loadCsv(csvPath);
  } catch (error) {
    throw new Error(`Failed to load CSV: ${error.message}`);
  }

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }
  if (progressCallback) progressCallback({ type: 'info', message: `✅ Loaded ${rows.length} row(s)` });
  if (progressCallback) progressCallback({ type: 'info', message: '📤 Starting upload process...' });

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const result = await createOrUpdatePost(rows[i], i + 1, progressCallback, clientApi, config);
    logResults.push(result);
  }

  // Write log file
  // Use /tmp on Vercel (serverless), or __dirname for local development
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  const logPath = isVercel 
    ? path.join('/tmp', 'import_log.json')
    : path.resolve(__dirname, 'import_log.json');
  
  try {
    fs.writeFileSync(logPath, JSON.stringify(logResults, null, 2));
  } catch (error) {
    // If writing fails (e.g., on Vercel), log to console instead
    console.warn('⚠️  Could not write log file:', error.message);
    console.log('📝 Log data:', JSON.stringify(logResults, null, 2));
  }

  // Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  const successCount = logResults.filter(r => !r.error).length;
  const failedCount = logResults.filter(r => r.error).length;

  return {
    total: rows.length,
    success: successCount,
    failed: failedCount,
    duration: parseFloat(duration),
    results: logResults,
    logPath: logPath
  };
}

// Run CLI version if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('bulk-upload.js')) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

