-- HVAC Phone Agent Database Schema

-- Companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    business_hours JSONB NOT NULL DEFAULT '{}',
    services JSONB NOT NULL DEFAULT '[]',
    emergency_rates JSONB NOT NULL DEFAULT '{}',
    vapi_assistant_id VARCHAR(255),
    telnyx_phone_number VARCHAR(20),
    subscription_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call records table
CREATE TABLE call_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    call_type VARCHAR(50) NOT NULL,
    is_emergency BOOLEAN DEFAULT FALSE,
    summary TEXT,
    transcript TEXT,
    duration INTEGER DEFAULT 0,
    recording_url TEXT,
    vapi_call_id VARCHAR(255),
    telnyx_call_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_call_records_company_id (company_id),
    INDEX idx_call_records_customer_phone (customer_phone),
    INDEX idx_call_records_created_at (created_at)
);

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    address TEXT NOT NULL,
    service_type VARCHAR(255) NOT NULL,
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_duration INTEGER NOT NULL DEFAULT 60,
    notes TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'scheduled',
    call_record_id UUID REFERENCES call_records(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_appointments_company_id (company_id),
    INDEX idx_appointments_scheduled_date (scheduled_date),
    INDEX idx_appointments_status (status)
);

-- Leads table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    service_interest JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    source VARCHAR(50) DEFAULT 'phone_call',
    status VARCHAR(20) DEFAULT 'new',
    call_record_id UUID REFERENCES call_records(id),
    appointment_id UUID REFERENCES appointments(id),
    estimated_value DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_leads_company_id (company_id),
    INDEX idx_leads_status (status),
    INDEX idx_leads_customer_phone (customer_phone)
);

-- Users table (for admin access)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_users_email (email),
    INDEX idx_users_company_id (company_id)
);

-- Webhooks table
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    event_type VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    secret_key VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_webhooks_company_id (company_id),
    INDEX idx_webhooks_event_type (event_type)
);

-- System logs table
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_system_logs_company_id (company_id),
    INDEX idx_system_logs_level (level),
    INDEX idx_system_logs_created_at (created_at)
);

-- Analytics table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    user_phone VARCHAR(20),
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_analytics_company_id (company_id),
    INDEX idx_analytics_event_type (event_type),
    INDEX idx_analytics_created_at (created_at)
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES
('admin@hvac-phone-agent.com', '$2b$10$8K8qQYfXu1V7xO.wU5T4nO1QbN8vhTcmjlcJKaB/F8Q6Z.lW9xwsq', 'System', 'Admin', 'super_admin');

-- Create some sample data for testing
INSERT INTO companies (name, phone, email, address, business_hours, services, emergency_rates) VALUES
('ABC Heating & Cooling', '+15551234567', 'info@abchvac.com', '123 Main St, Anytown, USA',
 '{"monday":{"open":"8:00 AM","close":"6:00 PM","isClosed":false},"tuesday":{"open":"8:00 AM","close":"6:00 PM","isClosed":false},"wednesday":{"open":"8:00 AM","close":"6:00 PM","isClosed":false},"thursday":{"open":"8:00 AM","close":"6:00 PM","isClosed":false},"friday":{"open":"8:00 AM","close":"6:00 PM","isClosed":false},"saturday":{"open":"9:00 AM","close":"4:00 PM","isClosed":false},"sunday":{"open":"","close":"","isClosed":true}}',
 '[{"id":"1","name":"Heating Repair","basePrice":150,"emergencyMultiplier":1.5,"description":"Furnace and heating system repairs"},{"id":"2","name":"AC Repair","basePrice":125,"emergencyMultiplier":1.5,"description":"Air conditioning repairs and service"},{"id":"3","name":"Installation","basePrice":3000,"emergencyMultiplier":1.2,"description":"New HVAC system installation"},{"id":"4","name":"Maintenance","basePrice":125,"emergencyMultiplier":1.0,"description":"Regular maintenance and tune-ups"}]',
 '{"afterHours":1.25,"weekend":1.15,"holiday":1.5}');

-- Create indexes for better performance
CREATE INDEX CONCURRENTLY idx_call_records_emergency ON call_records(is_emergency, created_at) WHERE is_emergency = true;
CREATE INDEX CONCURRENTLY idx_appointments_today ON appointments(company_id, scheduled_date) WHERE DATE(scheduled_date) = CURRENT_DATE;
CREATE INDEX CONCURRENTLY idx_leads_recent ON leads(company_id, created_at DESC) WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Create views for common queries
CREATE VIEW daily_stats AS
SELECT
    c.id as company_id,
    c.name as company_name,
    COUNT(DISTINCT cr.id) as total_calls,
    COUNT(DISTINCT cr.id) FILTER (WHERE cr.is_emergency = true) as emergency_calls,
    COUNT(DISTINCT a.id) as appointments_booked,
    COUNT(DISTINCT l.id) as leads_generated,
    CURRENT_DATE as stats_date
FROM companies c
LEFT JOIN call_records cr ON c.id = cr.company_id AND DATE(cr.created_at) = CURRENT_DATE
LEFT JOIN appointments a ON c.id = a.company_id AND DATE(a.created_at) = CURRENT_DATE
LEFT JOIN leads l ON c.id = l.company_id AND DATE(l.created_at) = CURRENT_DATE
GROUP BY c.id, c.name;

CREATE VIEW upcoming_appointments AS
SELECT
    a.*,
    c.name as company_name,
    c.phone as company_phone
FROM appointments a
JOIN companies c ON a.company_id = c.id
WHERE a.scheduled_date >= NOW()
AND a.status IN ('scheduled', 'confirmed')
ORDER BY a.scheduled_date ASC;

CREATE VIEW hot_leads AS
SELECT
    l.*,
    c.name as company_name,
    cr.summary as call_summary,
    cr.is_emergency
FROM leads l
JOIN companies c ON l.company_id = c.id
LEFT JOIN call_records cr ON l.call_record_id = cr.id
WHERE l.status = 'new'
AND (cr.is_emergency = true OR l.created_at >= NOW() - INTERVAL '24 hours')
ORDER BY l.created_at DESC;