
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('node:dns');

require('dotenv').config();

// Fix MongoDB Atlas SRV DNS resolution
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();

app.use(cors());
app.use(express.json());

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Load routes
try {
  const votesRouter = require('./routes/votes');
  app.use('/api/votes', votesRouter);
  console.log('Routes loaded successfully');
} catch (err) {
  console.error(' Failed to load routes:', err.message);
}

// Connect to MongoDB before starting the server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log(' MongoDB connected');

    const server = app.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(` Error: Port ${PORT} is already in use.`);
      } else {
        console.error(' Server error:', err);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error(' MongoDB connection failed:', err);
    process.exit(1);
  }
}

startServer();