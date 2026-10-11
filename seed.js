require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const CenterVote = require('./models/vote');

const centers = [
  { centerId: 'CTR001', centerName: 'Colombo District Center' },
  { centerId: 'CTR002', centerName: 'Kandy District Center'   },
  { centerId: 'CTR003', centerName: 'Galle District Center'   },
  { centerId: 'CTR004', centerName: 'Jaffna District Center'  },
  { centerId: 'CTR005', centerName: 'Kurunegala District Center' },
];

const candidates = [
  { candidateId: 'C001', candidateName: 'Ranil Wickremesinghe',      party: 'New Democratic Front',        partyColor: '#2E86AB' },
  { candidateId: 'C002', candidateName: 'Sajith Premadasa',          party: 'Samagi Jana Balawegaya',      partyColor: '#E84855' },
  { candidateId: 'C003', candidateName: 'Anura Kumara Dissanayake',  party: "National People's Power",     partyColor: '#C84B31' },
  { candidateId: 'C004', candidateName: 'Namal Rajapaksa',           party: 'Sri Lanka Podujana Peramuna', partyColor: '#5C4B8A' },
];

// Random vote counts per center (simulate realistic variation)
const voteRanges = {
  CTR001: [80000,  150000],
  CTR002: [50000,  90000 ],
  CTR003: [30000,  60000 ],
  CTR004: [20000,  45000 ],
  CTR005: [40000,  80000 ],
};

function randomVotes(centerId) {
  const [min, max] = voteRanges[centerId];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  await CenterVote.deleteMany({});
  console.log('🗑️  Cleared old data\n');

  const docs = [];

  for (const center of centers) {
    console.log(`📍 Seeding: ${center.centerName}`);
    for (const candidate of candidates) {
      const votes = randomVotes(center.centerId);
      docs.push({
        centerId:      center.centerId,
        centerName:    center.centerName,
        candidateId:   candidate.candidateId,
        candidateName: candidate.candidateName,
        party:         candidate.party,
        partyColor:    candidate.partyColor,
        voteCount:     votes,
      });
      console.log(`   ${candidate.candidateName}: ${votes.toLocaleString()} votes`);
    }
    console.log('');
  }

  await CenterVote.insertMany(docs);
  console.log(`✅ Inserted ${docs.length} records (${centers.length} centers × ${candidates.length} candidates)`);
  mongoose.disconnect();
}

seed().catch(console.error);