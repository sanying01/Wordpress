<?php
/**
 * Theme functions and definitions.
 *
 * For additional information on potential customization options,
 * read the developers' documentation:
 *
 * https://developers.elementor.com/docs/hello-elementor-theme/
 *
 * @package HelloElementorChild
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

define( 'HELLO_ELEMENTOR_CHILD_VERSION', '2.0.0' );

/**
 * Load child theme scripts & styles.
 *
 * @return void
 */
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
    <!-- Google Analytics GA4 -->
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

function get_client_submission_id() {
    if (isset($_COOKIE['client_submission_id'])) {
        return sanitize_text_field($_COOKIE['client_submission_id']);
    }

    $submission_id = wp_generate_uuid4();
    setcookie(
        'client_submission_id',
        $submission_id,
        time() + DAY_IN_SECONDS,
        COOKIEPATH,
        COOKIE_DOMAIN
    );

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
 
    $submission_id = get_client_submission_id();
    $table = $wpdb->prefix . 'client_applications';

    // Collect form fields
    $fields = [];
    foreach ($record->get('fields') as $key => $field) {
        $fields[$key] = $field['value'];
    }
    
    // Map form → column
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
        ],
        'id_verification_form' => 'driver_license',
        'voided_check_form'  => 'voided_check'
    ];

    $column_info = $column_map[$form_name];

    $update_data = [];

    if (is_array($column_info)) {
        // multiple columns per field
        foreach ($column_info as $field_key => $column_name) {
            if (isset($fields[$field_key])) {
                $update_data[$column_name] = $fields[$field_key];
            }
        }
    } else {
        // single column storing all data
        $update_data[$column_info] = maybe_serialize($fields);
    }

    // Check if row exists
    $exists = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM $table WHERE submission_id = %s",
            $submission_id
        )
    );

    if ($exists) {
        $wpdb->update(
            $table,
            $update_data,
            ['submission_id' => $submission_id]
        );
    } else {
        $wpdb->insert(
            $table,
            array_merge(['submission_id' => $submission_id], $update_data)
        );
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

add_action(
    'elementor_pro/forms/new_record',
    'save_multi_form_client_data',
    10,
    2
);