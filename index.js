require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const tempConnection = mysql.createConnection({
  host: process.env.DB_HOST || 'database.cnhkqaukyti2.us-east-1.rds.amazonaws.com',
  user: process.env.DB_USER || 'baha',
  password: process.env.DB_PASSWORD || 'Cloud2025+'
});

tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'db'}`, (err) => {
  if (err) return console.error('❌ Error creating database:', err);

  console.log('✅ Database ensured');
  tempConnection.end();

  const db = mysql.createConnection({
    host: process.env.DB_HOST || 'database.cnhkqaukyti2.us-east-1.rds.amazonaws.com',
    user: process.env.DB_USER || 'baha',
    password: process.env.DB_PASSWORD || 'Cloud2025+',
    database: process.env.DB_NAME || 'db'
  });

  db.connect((err) => {
    if (err) return console.error('Error connecting to the database:', err);

    console.log('Connected to MySQL database');

    // Create table and insert data
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const insertUsersQuery = `
      INSERT IGNORE INTO users (name, email) VALUES
      ('John Doe', 'john@example.com'),
      ('Jane Smith', 'jane@example.com'),
      ('Bob Johnson', 'bob@example.com');
    `;

    db.query(createTableQuery, (err) => {
      if (err) return console.error('❌ Error creating table:', err);
      console.log('✅ Users table ready');

      db.query(insertUsersQuery, (err) => {
        if (err) console.error('❌ Error inserting users:', err);
        else console.log('✅ Sample users inserted');
      });
    });

    // Define all routes INSIDE the db.connect scope so `db` is available
    app.get('/', (req, res) => {
      res.status(200).json('Hello from Backend app!');
    });

    app.get('/api/users', (req, res) => {
      db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
      });
    });

    app.get('/api/users/:id', (req, res) => {
      db.query('SELECT * FROM users WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(results[0]);
      });
    });

    app.post('/api/users', (req, res) => {
      const { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

      db.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.status(201).json({ id: result.insertId, name, email });
      });
    });

    app.put('/api/users/:id', (req, res) => {
      const { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

      db.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ id: req.params.id, name, email });
      });
    });

    app.delete('/api/users/:id', (req, res) => {
      db.query('DELETE FROM users WHERE id = ?', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.status(204).send();
      });
    });

    app.get('/server-info', async (req, res) => {
      try {
        const instanceId = await axios.get('http://169.254.169.254/latest/meta-data/instance-id');
        const availabilityZone = await axios.get('http://169.254.169.254/latest/meta-data/placement/availability-zone');

        res.json({
          instanceId: instanceId.data,
          availabilityZone: availabilityZone.data,
          hostname: os.hostname(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.log('EC2 metadata not available');
        res.json({
          instanceId: 'unknown',
          availabilityZone: 'unknown',
          hostname: os.hostname(),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Start server only after everything is set up
    const server = app.listen(port,'0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received: closing server');
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  });
});
