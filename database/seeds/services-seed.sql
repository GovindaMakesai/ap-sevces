-- database/seeds/services-seed.sql
-- Insert more services if needed

INSERT INTO services (name, category, description, icon, base_price, price_type) VALUES
    ('Carpentry', 'Furniture', 'Custom furniture making and repair', 'hammer', 399, 'hourly'),
    ('Pest Control', 'Cleaning', 'Complete pest control treatment', 'bug', 999, 'fixed'),
    ('Yoga Classes', 'Fitness', 'Personal yoga training at home', 'person-walking', 499, 'hourly'),
    ('Tutoring - Math', 'Education', 'Mathematics tutoring for all grades', 'calculator', 499, 'hourly'),
    ('Tutoring - Science', 'Education', 'Physics, Chemistry, Biology tutoring', 'flask', 499, 'hourly'),
    ('Mobile Repair', 'Electronics', 'Smartphone repair and service', 'mobile', 399, 'fixed'),
    ('Laptop Repair', 'Electronics', 'Laptop hardware and software repair', 'laptop', 599, 'fixed'),
    ('CCTV Installation', 'Security', 'CCTV camera installation and setup', 'video', 1499, 'fixed'),
    ('Event Photography', 'Photography', 'Professional photography for events', 'camera', 1999, 'hourly'),
    ('Wedding Makeup', 'Beauty', 'Bridal makeup and hairstyling', 'brush', 2999, 'fixed'),
    ('Driver', 'Transport', 'Personal driver for your vehicle', 'car', 199, 'hourly'),
    ('Gardening', 'Outdoor', 'Garden maintenance and landscaping', 'leaf', 349, 'hourly'),
    ('Swimming Coach', 'Fitness', 'Personal swimming training', 'swimmer', 599, 'hourly'),
    ('Web Development', 'IT', 'Website design and development', 'code', 899, 'hourly'),
    ('App Development', 'IT', 'Mobile app development', 'mobile-screen', 999, 'hourly')
ON CONFLICT DO NOTHING;
