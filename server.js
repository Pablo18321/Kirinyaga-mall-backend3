import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false },
  family: 4,  // force IPv4
});

// Test database connection on startup
pool.connect((err) => {
  if (err) {
    console.error('❌ DB connection error:', err.message);
  } else {
    console.log('✅ Connected to Supabase');
  }
});

// ========== API ROUTES ==========

// Health check
app.get('/', (req, res) => res.send('Kirinyaga Mall Backend is alive'));

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a product (admin only – simplified for now, no auth yet)
app.post('/api/products', async (req, res) => {
  const { name, price, category, description, images, discount, free_delivery } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, category, description, images, discount, free_delivery)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, price, category, description, images || [], discount || 0, free_delivery || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register user (simplified – plain password, but you can upgrade later)
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Check if user exists
    const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Username taken' });
    // Store plain password (upgrade to bcrypt later)
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, false) RETURNING id, username',
      [username, password]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login user (plain password compare – upgrade later)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ id: user.id, username: user.username, isAdmin: user.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  const { id, customer_name, phone, address, items, subtotal, delivery_fee, total } = req.body;
  try {
    await pool.query(
      `INSERT INTO orders (id, customer_name, phone, address, items, subtotal, delivery_fee, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
      [id, customer_name, phone, address, JSON.stringify(items), subtotal, delivery_fee, total]
    );
    res.json({ message: 'Order created', orderId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track order
app.get('/api/orders/track/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT id, customer_name, address, total, status FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
