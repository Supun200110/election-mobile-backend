const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const forge    = require('node-forge');

// ── schemas ───────────────────────────────────────────────────────

const CandidateSchema = new mongoose.Schema({
  // Fields from the candidate registration database
  fullName: String,
  address: String,
  occupation: String,

  ballotDetails: {
    ballotName: String,
    symbolName: String,
    symbolImageUrl: String,
  },

 partyAffiliation: {
  partyName: String,
  partyColor: String,
  partySymbolUrl: String,
},

  candidacyType: String,
  candidateImageUrl: String,

  // Legacy field names, if older records use them
  full_name: String,
  ballot_name: String,
  party_name: String,
}, {
  collection: 'candidates',
  strict: false,
});

const VoteSchema = new mongoose.Schema({
  preferences:     String,
  polling_station: String,
  station_code:    String,
  voted_at:        Date,
}, { collection: 'vote' });

const StationSchema = new mongoose.Schema({
  district_name:   String,
  division_name:   String,
  division_code:   String,
  district_number: Number,
  is_active:       Boolean,
}, { collection: 'polling_station' });

const Candidate      = mongoose.model('Candidate',      CandidateSchema);
const Vote           = mongoose.model('Vote',           VoteSchema);
const PollingStation = mongoose.model('PollingStation', StationSchema);

// ── Fernet decrypt ────────────────────────────────────────────────
function decryptPreferences(encryptedText) {
  try {
    const keyBytes      = Buffer.from(process.env.FRIEND_ENCRYPTION_KEY, 'base64');
    const encryptionKey = keyBytes.slice(16, 32);

    const tokenBuf = Buffer.from(
      encryptedText.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );

    const iv         = tokenBuf.slice(9, 25);
    const ciphertext = tokenBuf.slice(25, tokenBuf.length - 32);

    const decipher = forge.cipher.createDecipher(
      'AES-CBC',
      forge.util.createBuffer(encryptionKey)
    );
    decipher.start({ iv: forge.util.createBuffer(iv) });
    decipher.update(forge.util.createBuffer(ciphertext));

    if (!decipher.finish()) return null;

    return JSON.parse(decipher.output.toString());
  } catch (_) {
    return null;
  }
}

// ── party colors ──────────────────────────────────────────────────
function getPartyColor(partyName) {
  const colors = {
    "National People's Power":     "#A91D62",
    "Sri Lanka Podujana Peramuna": "#800020",
    "Samagi Jana Balawegaya":      "#228B22",
    "Sri Lanka Freedom Party":     "#0000CD",
    "United National Party":       "#006400",
    "Mawbima Janatha Pakshaya":    "#0066CC",
    "New Democratic Front":        "#4682B4",
  };
  return colors[partyName] || "#666666";
}

// ── aggregate votes ───────────────────────────────────────────────
async function aggregateVotes(pollingStationFilter = null) {
  const candidates = await Candidate.find({});
  const voteQuery  = pollingStationFilter
    ? { polling_station: pollingStationFilter }
    : {};
  const votes = await Vote.find(voteQuery);

  // build map keyed by ObjectId string
  const map = {};
  
for (const c of candidates) {
  const partyName =
    c.partyAffiliation?.partyName ||
    c.party_name ||
    'Independent';
  const partyColor =
  c.partyAffiliation?.partyColor ||
  getPartyColor(partyName);

  map[c._id.toString()] = {
    candidateId: c._id.toString(),

    candidateName:
      c.ballotDetails?.ballotName ||
      c.ballot_name ||
      c.fullName ||
      c.full_name ||
      'Unknown Candidate',

    party: partyName,
    partyColor: partyColor,
    voteCount: 0,
  };
}


  // decrypt and count first-preference votes
  for (const vote of votes) {
    const prefs = decryptPreferences(vote.preferences);
    if (!prefs) continue;
    const firstChoice = prefs['1'];
    if (firstChoice && map[firstChoice]) {
      map[firstChoice].voteCount++;
    }
  }

  const sorted     = Object.values(map).sort((a, b) => b.voteCount - a.voteCount);
  const totalVotes = sorted.reduce((s, c) => s + c.voteCount, 0);

  return sorted.map((c, i) => ({
    ...c,
    percentage: totalVotes > 0
      ? ((c.voteCount / totalVotes) * 100).toFixed(2)
      : '0.00',
    rank: i + 1,
  }));
}

// ── GET /api/votes/centers ────────────────────────────────────────
router.get('/centers', async (req, res) => {
  try {
    const stations = await PollingStation.find({});
    const centers  = stations.map(s => ({
      centerId:   s._id.toString(),
      centerName: `${s.district_name} / ${s.division_name}`,
    }));
    res.json({ success: true, centers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/votes/overall ────────────────────────────────────────
router.get('/overall', async (req, res) => {
  try {
    const candidates = await aggregateVotes();
    const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);
    res.json({
      success:   true,
      scope:     'overall',
      totalVotes,
      candidates,
      leader:    candidates[0] || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/votes/center/:centerId ──────────────────────────────
router.get('/center/:centerId', async (req, res) => {
  try {
    const station = await PollingStation.findById(req.params.centerId);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Center not found' });
    }
    const psName     = `${station.district_name} / ${station.division_name} (${station.division_code})`;
    const candidates = await aggregateVotes(psName);
    const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);
    res.json({
      success:    true,
      scope:      'center',
      centerId:   req.params.centerId,
      centerName: `${station.district_name} / ${station.division_name}`,
      totalVotes,
      candidates,
      leader:    candidates[0] || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/votes/stream?centerId=xxx ───────────────────────────
router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const { centerId } = req.query;
  let pollingStationStr = null;
  let centerName        = 'Overall';

  if (centerId) {
    try {
      const station = await PollingStation.findById(centerId);
      if (station) {
        pollingStationStr = `${station.district_name} / ${station.division_name} (${station.division_code})`;
        centerName        = `${station.district_name} / ${station.division_name}`;
      }
    } catch (_) {}
  }

  const sendData = async () => {
    try {
      const candidates = await aggregateVotes(pollingStationStr);
      const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);
      res.write(`data: ${JSON.stringify({
        scope:      centerId ? 'center' : 'overall',
        centerId:   centerId || null,
        centerName,
        totalVotes,
        candidates,
        timestamp:  new Date().toISOString(),
      })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  sendData();
  const interval = setInterval(sendData, 5000);
  req.on('close', () => { clearInterval(interval); res.end(); });
});

module.exports = router;