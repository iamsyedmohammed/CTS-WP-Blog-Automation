<?php
/**
 * Plugin Name: Expose SEO Meta to REST API
 * Description: Registers Yoast SEO and Rank Math meta keys for the WordPress REST API so they can be updated via bulk upload scripts.
 * Version: 1.0
 * Author: Antigravity
 */

// Register meta keys for Posts
add_action('rest_api_init', function () {
    $post_types = ['post', 'page'];
    
    $meta_keys = [
        // Yoast SEO
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_focuskw',
        
        // Rank Math
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
        
        // Generic
        'meta_title',
        'meta_description'
    ];

    foreach ($post_types as $post_type) {
        foreach ($meta_keys as $meta_key) {
            register_rest_field(
                $post_type,
                $meta_key,
                [
                    'get_callback'    => function ($object, $field_name, $request) {
                        return get_post_meta($object['id'], $field_name, true);
                    },
                    'update_callback' => function ($value, $object, $field_name) {
                        return update_post_meta($object->ID, $field_name, $value);
                    },
                    'schema'          => [
                        'type' => 'string',
                        'arg_options' => [
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                    ],
                ]
            );
        }
    }
});
