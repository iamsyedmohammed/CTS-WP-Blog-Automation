# Client Onboarding Guide: SEO Meta Tags Automation
<!-- Last Updated: Just now -->

## 🚀 Quick Start: Files & Code to Copy
If you prefer to manually update your files, here is exactly what you need.

### 1. New File: `expose-seo-meta.php`
Create this file in your plugin folder (or theme) to expose SEO fields.
```php
<?php
/**
 * Plugin Name: Expose SEO Meta to REST API
 * Description: Registers Yoast SEO and Rank Math meta keys for the WordPress REST API.
 * Version: 1.0
 */

function expose_seo_meta_to_rest() {
    $meta_keys = [
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_focuskw',
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
        'meta_title',
        'meta_description'
    ];

    foreach ($meta_keys as $meta_key) {
        register_rest_field(['post', 'page'], $meta_key, [
            'get_callback' => function ($object) use ($meta_key) {
                return get_post_meta($object['id'], $meta_key, true);
            },
            'update_callback' => function ($value, $object) use ($meta_key) {
                return update_post_meta($object['id'], $meta_key, $value);
            },
            'schema' => [
                'type' => 'string',
                'arg_options' => [
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);
    }
}
add_action('rest_api_init', 'expose_seo_meta_to_rest');
```

### 2. Update: `posts.csv` (Header)
Add these columns to your CSV header:
```csv
title,content,...,meta_title,meta_description,focus_keyword,featured_image_path
```

### 3. Update: `bulk-upload.js` & `bulk-update.js`
Add this logic to your script to read the CSV and map the fields.

**The Logic:**
```javascript
// ... inside your loop ...

// 1. Read from CSV
const metaTitle = row.meta_title?.trim();
const metaDesc = row.meta_description?.trim();
const focusKw = row.focus_keyword?.trim();

// 2. Map to API Payload (Top-Level)
if (metaTitle) {
    postData.meta_title = metaTitle;
    postData._yoast_wpseo_title = metaTitle;
    postData.rank_math_title = metaTitle;
}
if (metaDesc) {
    postData.meta_description = metaDesc;
    postData._yoast_wpseo_metadesc = metaDesc;
    postData.rank_math_description = metaDesc;
}
if (focusKw) {
    postData._yoast_wpseo_focuskw = focusKw;
    postData.rank_math_focus_keyword = focusKw;
}
```

---

This guide explains how to enable Meta Title, Meta Description, and Focus Keyword automation for other WordPress clients.

## Prerequisite: The Solution Components
To make this work for any WordPress site, you need two things:
1.  **The WordPress Helper Plugin**: Exposes the hidden SEO fields to the API.
2.  **The Updated Scripts**: The `bulk-upload.js` and `bulk-update.js` files in this folder already contain the necessary logic.

---

## Workflow for New Clients

### Step 1: Prepare the WordPress Site
**You must do this for EVERY client site.**

1.  **Download the Plugin**:
    - Locate `expose-seo-meta.zip` in your project folder.
    - If you don't have the zip, use `expose-seo-meta.php`.

2.  **Install on Client Site**:
    - Log in to the client's WordPress Admin Dashboard.
    - Go to **Plugins** > **Add New** > **Upload Plugin**.
    - Upload `expose-seo-meta.zip` and click **Install Now**.
    - Click **Activate Plugin**.

    > **Why?** By default, WordPress and plugins like Yoast/Rank Math protect their meta fields from external updates. This plugin safely "exposes" them so your script can write to them.

### Step 2: Prepare the CSV File
1.  Open the client's content CSV file.
2.  Add the following columns (headers) if they don't exist:
    - `meta_title`
    - `meta_description`
    - `focus_keyword`
3.  Fill in the SEO data for the posts.
    > **Note:** If the client does not have Meta Title, Meta Description, or Focus Keyword, you can leave these columns empty or omit them entirely. The script will simply skip setting them, and WordPress/Yoast/Rank Math will use their defaults.

### Step 3: Configure and Run
1.  Update your `.env` file with the client's credentials (`WP_SITE`, `WP_USER`, `WP_APP_PASSWORD`).
2.  Run the upload or update script as usual:
    - `npm run upload`
    - `npm run update`

---

## AI "Mega Prompt" for Other Projects

Use this prompt to instantly upgrade any similar WordPress automation project. It provides the AI with the exact technical requirements.

### The Prompt
```text
I need to upgrade my WordPress bulk upload automation to support SEO Meta Tags (Title, Description, Focus Keyword) for Yoast SEO and Rank Math.

Here is the plan. Please execute it step-by-step:

### 1. Create Helper Plugin
Create a file named `expose-seo-meta.php`. This plugin is required because WordPress protects these meta keys by default.
- It must use `register_rest_field` to expose the following keys as **top-level** fields (NOT inside a `meta` array):
  - `_yoast_wpseo_title`
  - `_yoast_wpseo_metadesc`
  - `_yoast_wpseo_focuskw`
  - `rank_math_title`
  - `rank_math_description`
  - `rank_math_focus_keyword`
  - `meta_title`
  - `meta_description`
- Provide the code for this PHP file.

### 2. Update CSV Structure
- Add `meta_title`, `meta_description`, and `focus_keyword` columns to my `posts.csv` file.

### 3. Update Automation Scripts (`bulk-upload.js` and `bulk-update.js`)
- Modify the function that prepares the post data (e.g., `createOrUpdatePost` or `updatePost`).
- Read the new columns from the CSV row:
  ```javascript
  const metaTitle = row.meta_title?.trim();
  const metaDesc = row.meta_description?.trim();
  const focusKw = row.focus_keyword?.trim();
  ```
- Map these values to the **top-level** fields in the API payload (to match the helper plugin). Do NOT put them inside a `meta: {}` object.
  ```javascript
  if (metaTitle) {
      postData.meta_title = metaTitle;
      postData._yoast_wpseo_title = metaTitle;
      postData.rank_math_title = metaTitle;
  }
  if (metaDesc) {
      postData.meta_description = metaDesc;
      postData._yoast_wpseo_metadesc = metaDesc;
      postData.rank_math_description = metaDesc;
  }
  if (focusKw) {
      postData._yoast_wpseo_focuskw = focusKw;
      postData.rank_math_focus_keyword = focusKw;
  }
  ```

### 4. Google Drive Image Support
- Update the image uploading logic to detect Google Drive share URLs (e.g. containing `drive.google.com`).
- Convert them to direct download URLs using the format: `https://drive.google.com/uc?export=download&id=FILE_ID` before attempting to download/upload the image.

Please apply these changes now.
```

## FAQ
**Q: Can I reuse the `expose-seo-meta.php` file for other clients?**
**A: YES.** You can use the exact same file for every single WordPress client. It is generic and works for any site using Yoast SEO or Rank Math. You do not need to change a single line of code in it. Just upload and activate.

**Q: Can I use Google Drive images?**
**A: YES.** The script now supports Google Drive share links. Just paste the link (e.g., `https://drive.google.com/file/d/.../view`) into the `featured_image_url` column. The script will automatically convert it to a direct download link. Make sure the file is set to "Anyone with the link".
