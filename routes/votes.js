const express = require('express');
const router  = express.Router();
const CenterVote = require('../models/vote');

// ─── helper: aggregate votes ───────────────────────────────────────────────
async function aggregateVotes(matchQuery = {}) {
  const raw = await CenterVote.find(matchQuery);

  // group by candidateId and sum voteCount
  const map = {};
  for (const doc of raw) {
    if (!map[doc.candidateId]) {
      map[doc.candidateId] = {
        candidateId:   doc.candidateId,
        candidateName: doc.candidateName,
        party:         doc.party,
        partyColor:    doc.partyColor,
        voteCount:     0,
      };
    }
    map[doc.candidateId].voteCount += doc.voteCount;
  }

  const candidates = Object.values(map).sort((a, b) => b.voteCount - a.voteCount);
  const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);

  return candidates.map((c, i) => ({
    ...c,
    percentage: totalVotes > 0
      ? ((c.voteCount / totalVotes) * 100).toFixed(2)
      : '0.00',
    rank: i + 1,
  }));
}

// ─── GET /api/votes/centers ────────────────────────────────────────────────
// Returns list of all centers
router.get('/centers', async (req, res) => {
  try {
    const centers = await CenterVote.aggregate([
      { $group: { _id: '$centerId', centerName: { $first: '$centerName' } } },
      { $project: { centerId: '$_id', centerName: 1, _id: 0 } },
      { $sort: { centerId: 1 } },
    ]);
    res.json({ success: true, centers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/votes/overall ────────────────────────────────────────────────
// Returns totals across ALL centers
router.get('/overall', async (req, res) => {
  try {
    const candidates = await aggregateVotes();
    const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);
    res.json({
      success: true,
      scope: 'overall',
      totalVotes,
      candidates,
      leader: candidates[0] || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/votes/center/:centerId ──────────────────────────────────────
// Returns totals for ONE specific center
router.get('/center/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const centerInfo = await CenterVote.findOne({ centerId });
    if (!centerInfo) {
      return res.status(404).json({ success: false, error: 'Center not found' });
    }

    const candidates = await aggregateVotes({ centerId });
    const totalVotes = candidates.reduce((s, c) => s + c.voteCount, 0);
    res.json({
      success: true,
      scope:      'center',
      centerId,
      centerName: centerInfo.centerName,
      totalVotes,
      candidates,
      leader:     candidates[0] || null,
      fetchedAt:  new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/votes/stream?centerId=CTR001 ────────────────────────────────
// SSE stream — pass ?centerId=CTR001 for center view, or omit for overall
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const { centerId } = req.query; // optional filter

  const sendData = async () => {
    try {
      const matchQuery  = centerId ? { centerId } : {};
      const candidates  = await aggregateVotes(matchQuery);
      const totalVotes  = candidates.reduce((s, c) => s + c.voteCount, 0);

      let centerName = 'Overall';
      if (centerId) {
        const info = await CenterVote.findOne({ centerId });
        centerName = info?.centerName ?? centerId;
      }

      const payload = {
        scope: centerId ? 'center' : 'overall',
        centerId:   centerId || null,
        centerName,
        totalVotes,
        candidates,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  sendData();
  const interval = setInterval(sendData, 5000);
  req.on('close', () => { clearInterval(interval); res.end(); });
});

module.exports = router;