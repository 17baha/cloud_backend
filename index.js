//const AWS = require('aws-sdk');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const os = require('os');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection setup - MODIFIED SECTION
let db; // Declare db variable in outer scope

// First connection (without database) to create the database
const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    const tempConnection = mysql.createConnection({
      host: process.env.DB_HOST || 'back-db.cnhkqaukyti2.us-east-1.rds.amazonaws.com',
      user: process.env.DB_USER || 'baha',
      password: process.env.DB_PASSWORD || 'Cloud2025+'
    });

    tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'back-db'}`, (err) => {
      if (err) return reject(err);
      
      tempConnection.end();
      console.log('✅ Database ensured');

      // 🛠️ 3. Create main connection with promise
      db = mysql.createConnection({
        host: process.env.DB_HOST || 'back-db.cnhkqaukyti2.us-east-1.rds.amazonaws.com',
        user: process.env.DB_USER || 'baha',
        password: process.env.DB_PASSWORD || 'Cloud2025+',
        database: process.env.DB_NAME || 'back-db'
      });

      db.connect(async (err) => {
        if (err) return reject(err);
        console.log('✅ Connected to MySQL database');

        try {
          await createTables();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
};

// 🛠️ 4. Separate table creation with error handling
const createTables = () => {
  return new Promise((resolve, reject) => {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`;

    db.query(createTableQuery, (err) => {
      if (err) return reject(err);
      console.log('✅ Users table ready');

      const insertUsersQuery = `
        INSERT IGNORE INTO users (name, email) VALUES
        ('John Doe', 'john@example.com'),
        ('Jane Smith', 'jane@example.com'),
        ('Bob Johnson', 'bob@example.com');`;

      db.query(insertUsersQuery, (err) => {
        if (err) return reject(err);
        console.log('✅ Sample users inserted');
        resolve();
      });
    });
  });
};

// 🛠️ 5. Initialize database before starting server
initializeDatabase()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });

    // 🛠️ 6. Proper shutdown handling
    process.on('SIGTERM', () => {
      console.log('🛑 SIGTERM received');
      server.close(() => {
        db.end();
        console.log('🔌 Database connection closed');
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    console.error('💥 FATAL INITIALIZATION ERROR:', err);
    process.exit(1);
  });

// Routes (keep your existing routes but add connection check)
app.get('/api/users', (req, res) => {
  // 🛠️ 7. Better connection check
  if (!db || db.state === 'disconnected') {
    return res.status(503).json({ error: 'Database initializing, try again later' });
  }

  const query = 'SELECT * FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('🔴 Database error:', err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(results);
  });
});


// Routes
// Server-info route FIXED
app.get('/server-info', async (req, res) => {
  try {
    let instanceId = 'unknown';
    let availabilityZone = 'unknown';

    try {
      // PROPER METADATA FETCHING
      const instanceResponse = await axios.get('http://169.254.169.254/latest/meta-data/instance-id', {
        timeout: 2000
      });
      instanceId = instanceResponse.data;

      const azResponse = await axios.get('http://169.254.169.254/latest/meta-data/placement/availability-zone', {
        timeout: 2000
      });
      availabilityZone = azResponse.data;
    } catch (error) {
      console.log('Not running on EC2 or metadata service not available');
    }

    res.json({
      instanceId,
      availabilityZone,
      hostname: os.hostname(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching server info:', error);
    res.status(500).json({ error: 'Failed to get server information' });
  }
});

app.get('/', (req, res) => {
  res.status(200).json('Hello from Backend app!');
});


// Routes MODIFIED TO USE DB PROPERLY
app.get('/api/users', (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  const query = 'SELECT * FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const query = 'SELECT * FROM users WHERE id = ?';

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(results[0]);
  });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const query = 'INSERT INTO users (name, email) VALUES (?, ?)';

  db.query(query, [name, email], (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.status(201).json({ id: result.insertId, name, email });
  });
});

app.put('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const query = 'UPDATE users SET name = ?, email = ? WHERE id = ?';

  db.query(query, [name, email, userId], (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ id: userId, name, email });
  });
});

app.delete('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const query = 'DELETE FROM users WHERE id = ?';

  db.query(query, [userId], (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(204).send();
  });
});


