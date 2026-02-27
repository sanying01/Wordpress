<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HELLO_ELEMENTOR_CHILD_VERSION', '2.0.0' );
define( 'CRYSTAL_CAPITAL_PARTNERS_API_KEY', '9f3c8a1d2b4e7f9c0a6d8e1b2c4f5a7d9e0c1b2a3d4e5f6a7b8c9d0e1f2a' );

function hello_elementor_child_scripts_styles() {

	wp_enqueue_style(
		'hello-elementor-child-style',
		get_stylesheet_directory_uri() . '/style.css',
		[
			'hello-elementor-theme-style',
		],
		HELLO_ELEMENTOR_CHILD_VERSION
	);

}
add_action( 'wp_enqueue_scripts', 'hello_elementor_child_scripts_styles', 20 );

function add_ga4_tracking_code() {
    ?>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-QH7MM2ZTC2"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-QH7MM2ZTC2');
    </script>
    <?php
}
add_action('wp_head', 'add_ga4_tracking_code');

function enqueue_google_places_api() {
    if (!is_page('apply')) return;

    wp_enqueue_script(
        'google-maps-places',
        'https://maps.googleapis.com/maps/api/js?key=AIzaSyAQuDdoeG7HiK86OchHj0oNpLTVjCuvzhk&libraries=places',
        array(),
        null,
        true
    );
}
add_action('wp_enqueue_scripts', 'enqueue_google_places_api');

function get_or_create_submission_id() {
    // 1. POST (AJAX-safe)
    if (!empty($_POST['submission_id'])) {
        return sanitize_text_field($_POST['submission_id']);
    }

    if (!empty($_COOKIE['client_submission_id'])) {
        return sanitize_text_field($_COOKIE['client_submission_id']);
    }

    $submission_id = wp_generate_uuid4();

    setcookie(
        'client_submission_id',
        $submission_id,
        time() + DAY_IN_SECONDS,
        '/',
        $_SERVER['HTTP_HOST'],
        is_ssl(),
        true
    );

    $_POST['submission_id'] = $submission_id;

    return $submission_id;
}

function save_multi_form_client_data($record, $handler) {
    global $wpdb;
    
    $form_name = $record->get_form_settings('form_name');

    $allowed_forms = [
        'basic',
        'bank_statements_doc_form',
        'business_inform',
        'owner_inform',
        'id_verification_form',
        'voided_check_form'
    ];

    if (!in_array($form_name, $allowed_forms)) {
        return;
    }
 
    $submission_id = get_or_create_submission_id();
    $table = $wpdb->prefix . 'client_applications';

    $column_map = [
        'basic'    => [
            "basic_purpose_of_funding" => "basic_purpose_of_funding",
            "basic_desired_amount" => "basic_desired_amount",
            "basic_years_in_business" => "basic_years_in_business",
            "basic_business_name" => "basic_business_name",
            "basic_last_3_months_avg_deposit_volume" => "basic_last_3_months_avg_deposit_volume",
            "basic_business_type" => "basic_business_type",
            "basic_industry_parent" => "basic_industry_parent",
            "basic_industry_sub" => "basic_industry_sub",
            "basic_credit_score" => "basic_credit_score",
            "basic_first_name" => "basic_first_name",
            "basic_last_name" => "basic_last_name",
            "basic_email" => "basic_email",
            "basic_phone_number" => "basic_phone_number",
            "basic_how_soon" => "basic_how_soon"
        ],
        'bank_statements_doc_form'    => [
            "last4_bank_statement1" => "last4_bank_statement1",
            "last4_bank_statement2" => "last4_bank_statement2",
            "last4_bank_statement3" => "last4_bank_statement3",
            "last4_bank_statement4" => "last4_bank_statement4",
        ],
        'business_inform' => [
            "bussiness_address" => "bussiness_address",
            "bussiness_address2" => "bussiness_address2",
            "business_city" => "business_city",
            "business_state" => "business_state",
            "business_zip" => "business_zip",
            "business_type" => "business_type",
            "business_ein" => "business_ein",
            "business_count" => "business_count",
            "ownership_start_date" => "ownership_start_date",
            "website" => "website",
            "business_description" => "business_description",
            "mca_yes_no" => "mca_yes_no",
            "approximate_existing_balance" => "approximate_existing_balance",
            "with_which_company" => "with_which_company",
            "monthlly_credit_card_volume" => "monthlly_credit_card_volume",
            "location_rent_own" => "location_rent_own",
            "monthly_rent_payment_amount" => "monthly_rent_payment_amount",
            "landlord_contact_name" => "landlord_contact_name",
            "landlord_phone_number" => "landlord_phone_number",
            "monthly_mortage_payment_amount" => "monthly_mortage_payment_amount"
        ],
        'owner_inform'    => [
            "owner_address" => "owner_address",
            "owner_address2" => "owner_address2",
            "owner_city" => "owner_city",
            "owner_state" => "owner_state",
            "owner_zip" => "owner_zip",
            "owner_birth" => "owner_birth",
            "owner_credit_score" => "owner_credit_score",
            "owner_title" => "owner_title",
            "owner_ssn" => "owner_ssn",
            "own_100percent" => "own_100percent",
            "signature" => "signature"
        ],
        'id_verification_form' => [
            "driver_license" => "driver_license",
        ],
        'voided_check_form'  => [
            "voided_check" => "voided_check"
        ]
    ];

    // Get allowed fields for the current form
    $allowed_fields = isset($column_map[$form_name]) ? array_keys($column_map[$form_name]) : [];

    $fields = [];
    foreach ($record->get('fields') as $key => $field) {
        // Only process fields that are in the allowed list
        if (in_array($key, $allowed_fields)) {
            $fields[$key] = $field['value'];
        }
    }
    
    $handler->add_response_data( 'backend_test',  $fields);

    if (isset($fields['signature']) && !empty($fields['signature'])) {
        $signature_data = $fields['signature'];
        
        if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $signature_data, $matches)) {
            $image_type = $matches[1];
            $base64_data = $matches[2];
            
            $image_data = base64_decode($base64_data);
            
            if ($image_data !== false) {
                $upload_dir = wp_upload_dir();
                $signatures_dir = $upload_dir['basedir'] . '/signatures';
                
                if (!file_exists($signatures_dir)) {
                    wp_mkdir_p($signatures_dir);
                }
                
                $filename = 'signature_' . $submission_id . '_' . time() . '.' . $image_type;
                $file_path = $signatures_dir . '/' . $filename;
                
                if (file_put_contents($file_path, $image_data)) {
                    $signature_url = $upload_dir['baseurl'] . '/signatures/' . $filename;
                    $fields['signature'] = $signature_url;
                } else {
                    $fields['signature'] = $signature_data;
                }
            }
        }
    }

    if (isset($_FILES) && !empty($_FILES)) {
        $upload_dir = wp_upload_dir();
        $uploads_dir = $upload_dir['basedir'] . '/form-uploads';
        
        if (!file_exists($uploads_dir)) {
            wp_mkdir_p($uploads_dir);
        }
        
        if (isset($_FILES['form_fields']) && is_array($_FILES['form_fields'])) {
            $form_files = $_FILES['form_fields'];
            
            if (isset($form_files['name']) && is_array($form_files['name'])) {
                foreach ($form_files['name'] as $field_key => $file_name) {
                    if (empty($file_name) || 
                        (isset($form_files['error'][$field_key]) && $form_files['error'][$field_key] == 4)) {
                        continue;
                    }
                    
                    if (isset($form_files['error'][$field_key]) && $form_files['error'][$field_key] !== UPLOAD_ERR_OK) {
                        continue;
                    }
                    
                    $tmp_name = isset($form_files['tmp_name'][$field_key]) ? $form_files['tmp_name'][$field_key] : '';
                    $file_type = isset($form_files['type'][$field_key]) ? $form_files['type'][$field_key] : '';
                    $file_size = isset($form_files['size'][$field_key]) ? $form_files['size'][$field_key] : 0;
                    
                    if (empty($tmp_name) || !is_uploaded_file($tmp_name) || !is_readable($tmp_name)) {
                        continue;
                    }
                    
                    $max_size = 10 * 1024 * 1024;
                    if ($file_size > $max_size) {
                        continue;
                    }
                    
                    $file_extension = pathinfo($file_name, PATHINFO_EXTENSION);
                    
                    $unique_filename = sanitize_file_name($field_key . '_' . $submission_id . '_' . time() . '.' . $file_extension);
                    $destination_path = $uploads_dir . '/' . $unique_filename;
                    
                    if (move_uploaded_file($tmp_name, $destination_path)) {
                        $file_url = $upload_dir['baseurl'] . '/form-uploads/' . $unique_filename;
                        
                        if (!empty($file_url)) {
                            $fields[$field_key] = $file_url;
                        }
                    }
                }
            }
        } else {
            foreach ($_FILES as $field_key => $file_data) {
                if (empty($file_data['name']) || 
                    (isset($file_data['error']) && $file_data['error'] !== UPLOAD_ERR_OK)) {
                    continue;
                }
                
                if (!is_array($file_data['name'])) {
                    $tmp_name = isset($file_data['tmp_name']) ? $file_data['tmp_name'] : '';
                    $file_name = isset($file_data['name']) ? $file_data['name'] : '';
                    $file_size = isset($file_data['size']) ? $file_data['size'] : 0;
                    
                    if (empty($tmp_name) || !is_uploaded_file($tmp_name) || !is_readable($tmp_name)) {
                        continue;
                    }
                    
                    $max_size = 10 * 1024 * 1024;
                    if ($file_size > $max_size) {
                        continue;
                    }
                    
                    $file_extension = pathinfo($file_name, PATHINFO_EXTENSION);
                    
                    $unique_filename = sanitize_file_name($field_key . '_' . $submission_id . '_' . time() . '.' . $file_extension);
                    $destination_path = $uploads_dir . '/' . $unique_filename;
                    
                    if (move_uploaded_file($tmp_name, $destination_path)) {
                        $file_url = $upload_dir['baseurl'] . '/form-uploads/' . $unique_filename;
                        if (!empty($file_url)) {
                            $fields[$field_key] = $file_url;
                        }
                    }
                } else {
                    foreach ($file_data['name'] as $index => $file_name) {
                        if (empty($file_name) || 
                            (isset($file_data['error'][$index]) && $file_data['error'][$index] !== UPLOAD_ERR_OK)) {
                            continue;
                        }
                        
                        $tmp_name = isset($file_data['tmp_name'][$index]) ? $file_data['tmp_name'][$index] : '';
                        $file_size = isset($file_data['size'][$index]) ? $file_data['size'][$index] : 0;
                        
                        if (empty($tmp_name) || !is_uploaded_file($tmp_name) || !is_readable($tmp_name)) {
                            continue;
                        }
                        
                        $max_size = 10 * 1024 * 1024;
                        if ($file_size > $max_size) {
                            continue;
                        }
                        
                        $file_extension = pathinfo($file_name, PATHINFO_EXTENSION);
                        $unique_filename = sanitize_file_name($field_key . '_' . $index . '_' . $submission_id . '_' . time() . '.' . $file_extension);
                        $destination_path = $uploads_dir . '/' . $unique_filename;
                        
                        if (move_uploaded_file($tmp_name, $destination_path)) {
                            $file_url = $upload_dir['baseurl'] . '/form-uploads/' . $unique_filename;
                            
                            if (!empty($file_url)) {
                                if (!isset($fields[$field_key])) {
                                    $fields[$field_key] = $file_url;
                                } else {
                                    $fields[$field_key] = (is_array($fields[$field_key]) ? $fields[$field_key] : [$fields[$field_key]]);
                                    $fields[$field_key][] = $file_url;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

   
    $column_info = $column_map[$form_name];

    $update_data = [];

    if (is_array($column_info)) {
        foreach ($column_info as $field_key => $column_name) {
            if (isset($fields[$field_key])) {
                $update_data[$column_name] = $fields[$field_key];
            }
        }
    } else {
        $update_data[$column_info] = maybe_serialize($fields);
    }
    $exists = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT COUNT(*) FROM $table WHERE submission_id = %s",
            $submission_id
        )
    );
    // $handler->add_response_data( 'exists',  $exists);
    // $handler->add_response_data( 'submission_id',  $submission_id);
    // $handler->add_response_data(
    //     'query',
    //     $wpdb->prepare(
    //         "SELECT COUNT(*) FROM $table WHERE submission_id = %s",
    //         $submission_id
    //     )
    // );
    if (!empty($update_data) && count($update_data) > 0) {
        if ($exists) {
            $wpdb->update(
                $table,
                $update_data,
                ['submission_id' => $submission_id],
                array_fill(0, count($update_data), '%s'),
                ['%s']
            );
        } else {
            $wpdb->insert(
                $table,
                array_merge(['submission_id' => $submission_id], $update_data),
                array_fill(0, count($update_data) + 1, '%s')
            );
        }
    }
	
    if($form_name === "basic"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?business-revenue-verification') );
    }else if($form_name === "bank_statements_doc_form"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?business-info') );
    }else if($form_name === "business_inform"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?owner-info') );
    }else if($form_name === "owner_inform"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?identity-verification') );
    }else if($form_name === "id_verification_form"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?voided-check-verification') );
    }else if($form_name === "voided_check_form" || $form_name === "application_form"){
        $handler->add_response_data( 'redirect_url', site_url('/apply/?thank-you-lr') );
    }
}

// Fix for Elementor Pro form_fields undefined array key error
function ensure_elementor_form_fields_exists() {
	// Check if this is an Elementor Pro form AJAX request
	if (defined('DOING_AJAX') && DOING_AJAX) {
		$action = isset($_POST['action']) ? $_POST['action'] : (isset($_REQUEST['action']) ? $_REQUEST['action'] : '');
		
		if (strpos($action, 'elementor_pro_forms') !== false || strpos($action, 'elementor') !== false) {
			// Ensure form_fields exists in POST data
			if (!isset($_POST['form_fields'])) {
				if (isset($_POST['fields']) && is_array($_POST['fields'])) {
					$_POST['form_fields'] = $_POST['fields'];
				} elseif (isset($_REQUEST['fields']) && is_array($_REQUEST['fields'])) {
					$_POST['form_fields'] = $_REQUEST['fields'];
				} else {
					$_POST['form_fields'] = [];
				}
			}
			
			// Also ensure it exists in REQUEST for compatibility
			if (!isset($_REQUEST['form_fields']) && isset($_POST['form_fields'])) {
				$_REQUEST['form_fields'] = $_POST['form_fields'];
			}
		}
	}
}

// Run at multiple hooks to ensure we catch the request early enough
add_action('muplugins_loaded', 'ensure_elementor_form_fields_exists', 1);
add_action('plugins_loaded', 'ensure_elementor_form_fields_exists', 1);
add_action('init', 'ensure_elementor_form_fields_exists', 1);

// Additional filter for Elementor form data (if the hook exists)
function fix_elementor_form_data($record_data) {
	if (is_array($record_data) && !isset($record_data['form_fields']) && isset($record_data['fields'])) {
		$record_data['form_fields'] = $record_data['fields'];
	}
	return $record_data;
}
add_filter('elementor_pro/forms/ajax_request', 'fix_elementor_form_data', 1);

add_action(
	'elementor_pro/forms/new_record',
	'save_multi_form_client_data',
	10,
	2
);

//Webhook endpoint
//https://crystalcapp.com/wp-json/api/v1/client-.applications
add_action('rest_api_init', function() {
    register_rest_route('api/v1', '/client-applications', array(
        'methods' => 'GET',
        'callback' => 'get_client_applications_webhook',
        'permission_callback' => '__return_true', // We'll handle API key inside callback
    ));
    
    register_rest_route('api/v1', '/client-applications/accepted', array(
        'methods' => 'POST',
        'callback' => 'accept_submission_webhook',
        'permission_callback' => '__return_true', // We'll handle API key inside callback
    ));
});

function get_client_applications_webhook($request) {
    // --- API Key Security ---
    $api_key = $request->get_header('crystalcapp-api-key');
    $expected_key = CRYSTAL_CAPITAL_PARTNERS_API_KEY;

    if ($api_key !== $expected_key) {
        return new WP_Error('forbidden', 'Invalid API key', array('status' => 403));
    }

    global $wpdb;
    $table = $wpdb->prefix . 'client_applications';
    $results = $wpdb->get_results("SELECT * FROM $table WHERE status IS NULL OR status = ''", ARRAY_A);

    return rest_ensure_response($results);
}

function accept_submission_webhook($request) {
    $api_key = $request->get_header('crystalcapp-api-key');
    $expected_key = CRYSTAL_CAPITAL_PARTNERS_API_KEY;

    if ($api_key !== $expected_key) {
        return new WP_Error('forbidden', 'Invalid API key', array('status' => 403));
    }

    $body = $request->get_json_params();
    
    if (!isset($body['submission_ids']) || !is_array($body['submission_ids'])) {
        return new WP_Error('invalid_request', 'submission_ids must be an array', array('status' => 400));
    }

    $submission_ids = $body['submission_ids'];
    
    if (empty($submission_ids)) {
        return new WP_Error('invalid_request', 'submission_ids array cannot be empty', array('status' => 400));
    }

    global $wpdb;
    $table = $wpdb->prefix . 'client_applications';
    $sanitized_ids = array_map('sanitize_text_field', $submission_ids);
    $placeholders = implode(',', array_fill(0, count($sanitized_ids), '%s'));
    
    $query = $wpdb->prepare(
        "UPDATE $table SET status = 'accepted' WHERE submission_id IN ($placeholders)",
        $sanitized_ids
    );
    
    $updated = $wpdb->query($query);
    
    if ($updated === false) {
        return new WP_Error('database_error', 'Failed to update status', array('status' => 500));
    }

    return rest_ensure_response(array(
        'success' => true,
        'message' => 'Status updated to accepted',
        'updated_count' => $updated,
        'submission_ids' => $sanitized_ids
    ));
}