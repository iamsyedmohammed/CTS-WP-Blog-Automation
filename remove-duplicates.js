import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WP_SITE = process.env.WP_SITE;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_SITE || !WP_USER || !WP_APP_PASSWORD) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create axios instance with authentication
const api = axios.create({
  baseURL: `${WP_SITE}/wp-json/wp/v2`,
  auth: {
    username: WP_USER,
    password: WP_APP_PASSWORD,
  },
  timeout: 30000,
});

// Normalize title for comparison
function normalizeTitle(str) {
  if (!str) return '';
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
}

async function removeDuplicateDrafts() {
  console.log('🔍 Fetching all draft posts...\n');
  
  // Fetch all draft posts
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  const draftPosts = [];

  while (hasMore) {
    try {
      const response = await api.get('/posts', {
        params: {
          per_page: perPage,
          page: page,
          status: 'draft',
          orderby: 'date',
          order: 'desc',
        },
      });

      if (!response.data || response.data.length === 0) {
        hasMore = false;
        break;
      }

      draftPosts.push(...response.data);

      if (response.data.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
      console.error(`❌ Error fetching posts: ${error.message}`);
      hasMore = false;
    }
  }

  console.log(`📊 Found ${draftPosts.length} draft posts\n`);

  // Group by normalized title
  const titleMap = new Map();
  draftPosts.forEach(post => {
    const title = post.title?.rendered || post.title?.raw || post.title || '';
    const normalizedTitle = normalizeTitle(title);
    if (normalizedTitle) {
      if (!titleMap.has(normalizedTitle)) {
        titleMap.set(normalizedTitle, []);
      }
      titleMap.get(normalizedTitle).push({
        id: post.id,
        title: title,
        date: post.date,
        modified: post.modified || post.date,
      });
    }
  });

  // Find duplicates
  const duplicates = [];
  titleMap.forEach((posts, normalizedTitle) => {
    if (posts.length > 1) {
      // Sort by date (oldest first) - we'll keep the oldest one
      posts.sort((a, b) => new Date(a.date) - new Date(b.date));
      duplicates.push({
        title: posts[0].title,
        normalizedTitle: normalizedTitle,
        keep: posts[0], // Keep the oldest one
        delete: posts.slice(1), // Delete the rest
      });
    }
  });

  if (duplicates.length === 0) {
    console.log('✅ No duplicate draft posts found!');
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate title(s) in drafts:\n`);
  
  let totalToDelete = 0;
  duplicates.forEach((dup, index) => {
    console.log(`${index + 1}. "${dup.title}"`);
    console.log(`   Keeping: Post ID ${dup.keep.id} (created: ${new Date(dup.keep.date).toLocaleString()})`);
    console.log(`   Deleting: ${dup.delete.length} duplicate(s)`);
    dup.delete.forEach(post => {
      console.log(`      - Post ID ${post.id} (created: ${new Date(post.date).toLocaleString()})`);
    });
    console.log('');
    totalToDelete += dup.delete.length;
  });

  console.log(`\n📋 Summary: Will delete ${totalToDelete} duplicate draft post(s), keeping ${duplicates.length} original(s)\n`);
  console.log('🗑️  Starting deletion...\n');

  // Delete duplicates
  let deletedCount = 0;
  let errorCount = 0;

  for (const dup of duplicates) {
    for (const post of dup.delete) {
      try {
        // Force delete (bypass trash)
        await api.delete(`/posts/${post.id}`, {
          params: { force: true },
        });
        console.log(`✅ Deleted Post ID ${post.id}: "${post.title}"`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Failed to delete Post ID ${post.id}: ${error.message}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 DELETION SUMMARY:');
  console.log('═'.repeat(80));
  console.log(`✅ Successfully deleted: ${deletedCount} post(s)`);
  if (errorCount > 0) {
    console.log(`❌ Failed to delete: ${errorCount} post(s)`);
  }
  console.log(`📝 Kept: ${duplicates.length} original post(s)`);
}

removeDuplicateDrafts().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

