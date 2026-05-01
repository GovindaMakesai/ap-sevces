const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '..', 'backend', '.env'),
  override: true
});
const bcrypt = require('bcryptjs');
const db = require('../../backend/config/database');

const TEST_PASSWORD = 'password123';

async function upsertUser(client, user) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const result = await client.query(
    `
      INSERT INTO users (
        email, phone, password_hash, first_name, last_name, role, is_verified, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, true)
      ON CONFLICT (email)
      DO UPDATE SET
        phone = EXCLUDED.phone,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = EXCLUDED.role,
        is_verified = true,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, role
    `,
    [user.email, user.phone, passwordHash, user.first_name, user.last_name, user.role]
  );
  return result.rows[0];
}

async function ensureWorkerProfile(client, workerUserId, profile) {
  const result = await client.query(
    `
      INSERT INTO workers (
        user_id, bio, experience_years, hourly_rate, is_available, is_approved, approval_status, rating, total_reviews
      )
      VALUES ($1, $2, $3, $4, true, true, 'approved', $5, $6)
      ON CONFLICT (user_id)
      DO UPDATE SET
        bio = EXCLUDED.bio,
        experience_years = EXCLUDED.experience_years,
        hourly_rate = EXCLUDED.hourly_rate,
        is_available = true,
        is_approved = true,
        approval_status = 'approved',
        rating = EXCLUDED.rating,
        total_reviews = EXCLUDED.total_reviews,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id
    `,
    [workerUserId, profile.bio, profile.experience_years, profile.hourly_rate, profile.rating, profile.total_reviews]
  );
  return result.rows[0];
}

async function ensureServices(client) {
  const defaults = [
    ['Plumbing Repair', 'Plumbing', 'Fix leaking pipes and fittings', 'wrench', 399, 'hourly'],
    ['Electrical Wiring', 'Electrical', 'Electrical maintenance and repairs', 'bolt', 449, 'hourly'],
    ['Deep Cleaning', 'Cleaning', 'Complete deep cleaning service', 'broom', 299, 'hourly']
  ];

  for (const svc of defaults) {
    await client.query(
      `
        INSERT INTO services (name, category, description, icon, base_price, price_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `,
      svc
    );
  }

  const result = await client.query(
    `
      SELECT id, name
      FROM services
      WHERE name = ANY($1::text[])
      ORDER BY name
    `,
    [['Plumbing Repair', 'Electrical Wiring', 'Deep Cleaning']]
  );
  return result.rows;
}

async function ensureWorkerServices(client, workerId, serviceIds) {
  for (const serviceId of serviceIds) {
    await client.query(
      `
        INSERT INTO worker_services (worker_id, service_id, is_available)
        VALUES ($1, $2, true)
        ON CONFLICT (worker_id, service_id)
        DO UPDATE SET is_available = true
      `,
      [workerId, serviceId]
    );
  }
}

async function ensureBooking(client, booking) {
  await client.query(
    `
      INSERT INTO bookings (
        booking_number, customer_id, worker_id, service_id, status,
        booking_date, start_time, end_time, duration_hours,
        total_amount, platform_fee, final_amount, payment_status,
        customer_address, customer_notes
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15
      )
      ON CONFLICT (booking_number)
      DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        worker_id = EXCLUDED.worker_id,
        service_id = EXCLUDED.service_id,
        status = EXCLUDED.status,
        booking_date = EXCLUDED.booking_date,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        duration_hours = EXCLUDED.duration_hours,
        total_amount = EXCLUDED.total_amount,
        platform_fee = EXCLUDED.platform_fee,
        final_amount = EXCLUDED.final_amount,
        payment_status = EXCLUDED.payment_status,
        customer_address = EXCLUDED.customer_address,
        customer_notes = EXCLUDED.customer_notes,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      booking.booking_number,
      booking.customer_id,
      booking.worker_id,
      booking.service_id,
      booking.status,
      booking.booking_date,
      booking.start_time,
      booking.end_time,
      booking.duration_hours,
      booking.total_amount,
      booking.platform_fee,
      booking.final_amount,
      booking.payment_status,
      booking.customer_address,
      booking.customer_notes
    ]
  );
}

async function seed() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const users = {
      admin: await upsertUser(client, {
        email: 'admin.test@apservices.com',
        phone: '9000000001',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin'
      }),
      customer1: await upsertUser(client, {
        email: 'customer1.test@apservices.com',
        phone: '9000000002',
        first_name: 'Aman',
        last_name: 'Sharma',
        role: 'customer'
      }),
      customer2: await upsertUser(client, {
        email: 'customer2.test@apservices.com',
        phone: '9000000003',
        first_name: 'Neha',
        last_name: 'Verma',
        role: 'customer'
      }),
      worker1: await upsertUser(client, {
        email: 'worker1.test@apservices.com',
        phone: '9000000004',
        first_name: 'Ravi',
        last_name: 'Kumar',
        role: 'worker'
      }),
      worker2: await upsertUser(client, {
        email: 'worker2.test@apservices.com',
        phone: '9000000005',
        first_name: 'Suresh',
        last_name: 'Patel',
        role: 'worker'
      })
    };

    const worker1 = await ensureWorkerProfile(client, users.worker1.id, {
      bio: 'Plumbing and electrical expert',
      experience_years: 6,
      hourly_rate: 500,
      rating: 4.8,
      total_reviews: 56
    });

    const worker2 = await ensureWorkerProfile(client, users.worker2.id, {
      bio: 'Home cleaning specialist',
      experience_years: 4,
      hourly_rate: 350,
      rating: 4.6,
      total_reviews: 41
    });

    const services = await ensureServices(client);
    const serviceByName = new Map(services.map((s) => [s.name, s.id]));

    await ensureWorkerServices(client, worker1.id, [
      serviceByName.get('Plumbing Repair'),
      serviceByName.get('Electrical Wiring')
    ].filter(Boolean));

    await ensureWorkerServices(client, worker2.id, [
      serviceByName.get('Deep Cleaning')
    ].filter(Boolean));

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const fmtDate = (d) => d.toISOString().slice(0, 10);

    await ensureBooking(client, {
      booking_number: 'APTEST1001',
      customer_id: users.customer1.id,
      worker_id: worker1.id,
      service_id: serviceByName.get('Plumbing Repair'),
      status: 'accepted',
      booking_date: fmtDate(tomorrow),
      start_time: '10:00',
      end_time: '12:00',
      duration_hours: 2,
      total_amount: 998,
      platform_fee: 100,
      final_amount: 1098,
      payment_status: 'paid',
      customer_address: 'Flat 101, MG Road, Mumbai - 400001',
      customer_notes: 'Please bring spare parts'
    });

    await ensureBooking(client, {
      booking_number: 'APTEST1002',
      customer_id: users.customer2.id,
      worker_id: worker2.id,
      service_id: serviceByName.get('Deep Cleaning'),
      status: 'completed',
      booking_date: fmtDate(yesterday),
      start_time: '09:00',
      end_time: '11:00',
      duration_hours: 2,
      total_amount: 598,
      platform_fee: 60,
      final_amount: 658,
      payment_status: 'paid',
      customer_address: 'House 14, Sector 9, Delhi - 110001',
      customer_notes: 'Call before arrival'
    });

    await ensureBooking(client, {
      booking_number: 'APTEST1003',
      customer_id: users.customer1.id,
      worker_id: worker1.id,
      service_id: serviceByName.get('Electrical Wiring'),
      status: 'pending',
      booking_date: fmtDate(tomorrow),
      start_time: '14:00',
      end_time: '16:00',
      duration_hours: 2,
      total_amount: 898,
      platform_fee: 90,
      final_amount: 988,
      payment_status: 'pending',
      customer_address: 'Flat 101, MG Road, Mumbai - 400001',
      customer_notes: 'Need urgent inspection'
    });

    await client.query('COMMIT');

    console.log('✅ Test data seeded successfully');
    console.log('🔐 Test login password for all users:', TEST_PASSWORD);
    console.log('👤 Admin: admin.test@apservices.com');
    console.log('👤 Customer 1: customer1.test@apservices.com');
    console.log('👤 Customer 2: customer2.test@apservices.com');
    console.log('👷 Worker 1: worker1.test@apservices.com');
    console.log('👷 Worker 2: worker2.test@apservices.com');
    console.log('📦 Sample bookings: APTEST1001, APTEST1002, APTEST1003');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed test data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

seed();
