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

async function listAllPosts() {
  console.log('📋 Fetching all posts from WordPress...\n');
  
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  const allPosts = [];

  while (hasMore) {
    try {
      const response = await api.get('/posts', {
        params: {
          per_page: perPage,
          page: page,
          status: 'any', // Include all statuses
          orderby: 'date',
          order: 'desc',
        },
      });

      if (!response.data || response.data.length === 0) {
        hasMore = false;
        break;
      }

      allPosts.push(...response.data);

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

  console.log(`\n📊 Total posts found: ${allPosts.length}\n`);
  console.log('═'.repeat(100));
  console.log('ALL POSTS:');
  console.log('═'.repeat(100));

  // Group by status
  const byStatus = {
    publish: [],
    draft: [],
    private: [],
    pending: [],
    future: [],
    trash: [],
  };

  allPosts.forEach(post => {
    const status = post.status || 'unknown';
    if (byStatus[status]) {
      byStatus[status].push(post);
    }
  });

  // Display published posts
  if (byStatus.publish.length > 0) {
    console.log(`\n✅ PUBLISHED POSTS (${byStatus.publish.length}):`);
    console.log('-'.repeat(100));
    byStatus.publish.forEach((post, index) => {
      const title = post.title?.rendered || post.title?.raw || post.title || 'No title';
      const date = new Date(post.date).toLocaleString();
      console.log(`${index + 1}. [ID: ${post.id}] ${title}`);
      console.log(`   Date: ${date} | Slug: ${post.slug || 'N/A'}`);
    });
  }

  // Display draft posts
  if (byStatus.draft.length > 0) {
    console.log(`\n📝 DRAFT POSTS (${byStatus.draft.length}):`);
    console.log('-'.repeat(100));
    byStatus.draft.forEach((post, index) => {
      const title = post.title?.rendered || post.title?.raw || post.title || 'No title';
      const date = new Date(post.modified || post.date).toLocaleString();
      console.log(`${index + 1}. [ID: ${post.id}] ${title}`);
      console.log(`   Modified: ${date} | Slug: ${post.slug || 'N/A'}`);
    });
  }

  // Display other statuses
  ['private', 'pending', 'future', 'trash'].forEach(status => {
    if (byStatus[status].length > 0) {
      console.log(`\n${status.toUpperCase()} POSTS (${byStatus[status].length}):`);
      console.log('-'.repeat(100));
      byStatus[status].forEach((post, index) => {
        const title = post.title?.rendered || post.title?.raw || post.title || 'No title';
        console.log(`${index + 1}. [ID: ${post.id}] ${title}`);
      });
    }
  });

  // Summary
  console.log('\n' + '═'.repeat(100));
  console.log('SUMMARY:');
  console.log('═'.repeat(100));
  Object.keys(byStatus).forEach(status => {
    if (byStatus[status].length > 0) {
      console.log(`${status.toUpperCase()}: ${byStatus[status].length}`);
    }
  });

  // Check for duplicate titles
  console.log('\n' + '═'.repeat(100));
  console.log('CHECKING FOR DUPLICATE TITLES:');
  console.log('═'.repeat(100));
  
  const titleMap = new Map();
  allPosts.forEach(post => {
    const title = (post.title?.rendered || post.title?.raw || post.title || '').toLowerCase().trim();
    if (title) {
      if (!titleMap.has(title)) {
        titleMap.set(title, []);
      }
      titleMap.get(title).push({
        id: post.id,
        status: post.status,
        title: post.title?.rendered || post.title?.raw || post.title,
      });
    }
  });

  let duplicateCount = 0;
  titleMap.forEach((posts, normalizedTitle) => {
    if (posts.length > 1) {
      duplicateCount++;
      console.log(`\n⚠️  DUPLICATE TITLE: "${posts[0].title}"`);
      posts.forEach(post => {
        console.log(`   - Post ID ${post.id} (${post.status})`);
      });
    }
  });

  if (duplicateCount === 0) {
    console.log('✅ No duplicate titles found');
  } else {
    console.log(`\n⚠️  Found ${duplicateCount} duplicate title(s)`);
  }
}

listAllPosts().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

