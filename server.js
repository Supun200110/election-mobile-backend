const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('node:dns');
require('dotenv').config();

dns.setServers(['1.1.1.1', '8.8.8.8']);

const app = express();
app.use(cors());
app.use(express.json());

async function startServer() {
  try {
    const uri = process.env.VOTE_MONGO_URI || process.env.FRIEND_MONGO_URI;
    await mongoose.connect(uri);
    console.log('Connected to election database');

    const votesRouter = require('./routes/votes');
    app.use('/api/votes', votesRouter);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
  } catch (err) {
    console.error(' MongoDB connection failed:', err.message);
  }
}

startServer();