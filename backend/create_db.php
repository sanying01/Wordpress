function create_client_applications_table() {
    global $wpdb;

    $table = $wpdb->prefix . 'client_applications';
    $charset = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE wp_client_applications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        submission_id VARCHAR(64) NOT NULL,
        basic_purpose_of_funding VARCHAR(150),
        basic_desired_amount VARCHAR(100),
        basic_years_in_business VARCHAR(100),
        basic_business_name VARCHAR(255),
        basic_last_3_months_avg_deposit_volume VARCHAR(100),
        basic_business_type VARCHAR(100),
        basic_industry_parent VARCHAR(100),
        basic_industry_sub VARCHAR(100),
        basic_credit_score VARCHAR(100),
        basic_first_name VARCHAR(100),
        basic_last_name VARCHAR(100),
        basic_email VARCHAR(150),
        basic_phone_number VARCHAR(30),
        basic_how_soon VARCHAR(100),

        last4_bank_statement1 TEXT,
        last4_bank_statement2 TEXT,
        last4_bank_statement3 TEXT,
        last4_bank_statement4 TEXT,

        bussiness_address VARCHAR(255),
        bussiness_address2 VARCHAR(255),
        business_city VARCHAR(100),
        business_state VARCHAR(50),
        business_zip VARCHAR(20),
        business_type VARCHAR(100),
        business_ein VARCHAR(30),
        business_count VARCHAR(50),
        ownership_start_date DATE,
        website VARCHAR(255),
        business_description TEXT,

        mca_yes_no VARCHAR(20),
        approximate_existing_balance DECIMAL(12,2),
        with_which_company VARCHAR(255),
        monthlly_credit_card_volume DECIMAL(12,2),
        location_rent_own VARCHAR(20),
        monthly_rent_payment_amount DECIMAL(12,2),
        landlord_contact_name VARCHAR(100),
        landlord_phone_number VARCHAR(30),
        monthly_mortage_payment_amount DECIMAL(12,2),

        owner_address VARCHAR(255),
        owner_address2 VARCHAR(255),
        owner_city VARCHAR(100),
        owner_state VARCHAR(50),
        owner_zip VARCHAR(20),
        owner_birth DATE,
        owner_credit_score VARCHAR(20),
        owner_title VARCHAR(100),
        owner_ssn VARCHAR(30),
        own_100percent VARCHAR(20),

        driver_license TEXT,
        voided_check TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY submission_id (submission_id)
    ) $charset;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}
add_action('init', 'create_client_applications_table');