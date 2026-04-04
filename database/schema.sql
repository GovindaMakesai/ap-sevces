-- database/schema.sql
-- AP Services Database Schema

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== USERS TABLE ====================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    profile_pic TEXT,
    role VARCHAR(50) DEFAULT 'customer' CHECK (role IN ('customer', 'worker', 'admin')),
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    reset_password_token TEXT,
    reset_password_expires TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==================== WORKERS TABLE ====================
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    bio TEXT,
    experience_years INTEGER,
    hourly_rate DECIMAL(10, 2),
    is_available BOOLEAN DEFAULT true,
    is_approved BOOLEAN DEFAULT false,
    approval_status VARCHAR(50) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    id_proof_url TEXT,
    address_proof_url TEXT,
    profile_photo_url TEXT,
    rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SERVICES TABLE ====================
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    base_price DECIMAL(10, 2),
    price_type VARCHAR(20) CHECK (price_type IN ('hourly', 'fixed')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== WORKER SERVICES (Many-to-Many) ====================
CREATE TABLE IF NOT EXISTS worker_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    custom_rate DECIMAL(10, 2),
    is_available BOOLEAN DEFAULT true,
    UNIQUE(worker_id, service_id)
);

-- ==================== BOOKINGS TABLE ====================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected')),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours DECIMAL(5, 2),
    total_amount DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) DEFAULT 0,
    final_amount DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pending',
    customer_address TEXT NOT NULL,
    customer_notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== REVIEWS TABLE ====================
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample services
INSERT INTO services (name, category, description, icon, base_price, price_type) VALUES
    ('Plumbing Repair', 'Plumbing', 'Fix leaking pipes, faucets, and bathroom fittings', 'wrench', 399, 'hourly'),
    ('Electrical Wiring', 'Electrical', 'Complete home electrical wiring and repairs', 'bolt', 449, 'hourly'),
    ('Men''s Haircut', 'Barber', 'Professional haircut and styling for men', 'cut', 299, 'fixed'),
    ('Women''s Beauty', 'Beautician', 'Premium facial and beauty treatments', 'spa', 899, 'fixed'),
    ('Home Painting', 'Painting', 'Interior wall painting with premium paints', 'paint-brush', 499, 'hourly'),
    ('Furniture Repair', 'Carpentry', 'Wooden furniture repair and restoration', 'hammer', 399, 'hourly'),
    ('Deep Cleaning', 'Cleaning', 'Complete home deep cleaning service', 'broom', 299, 'hourly'),
    ('AC Service & Repair', 'AC Repair', 'AC gas filling, repair, and maintenance', 'wind', 449, 'fixed')
ON CONFLICT DO NOTHING;
