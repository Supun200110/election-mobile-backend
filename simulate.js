require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose   = require('mongoose');
const CenterVote = require('./models/vote');

async function simulate() {
  await mongoose.connect(process.env.VOTE_MONGO_URI || process.env.MONGO_URI);
  console.log('🗳️  Vote simulator started...\n');

  setInterval(async () => {
    const all    = await CenterVote.find();
    const random = all[Math.floor(Math.random() * all.length)];
    const inc    = Math.floor(Math.random() * 30) + 1;

    await CenterVote.updateOne(
      { centerId: random.centerId, candidateId: random.candidateId },
      { $inc: { voteCount: inc }, $set: { updatedAt: new Date() } }
    );

    console.log(`+${inc} → ${random.candidateName} @ ${random.centerName}`);
  }, 2000);
}

simulate().catch(console.error);