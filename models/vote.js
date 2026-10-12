const mongoose = require('mongoose');

const CenterVoteSchema = new mongoose.Schema({
  centerId:      { type: String, required: true },
  centerName:    { type: String, required: true },
  candidateId:   { type: String, required: true },
  candidateName: { type: String, required: true },
  party:         { type: String, required: true },
  partyColor:    { type: String, default: '#4A90D9' },
  voteCount:     { type: Number, default: 0 },
  updatedAt:     { type: Date,   default: Date.now },
});


CenterVoteSchema.index({ centerId: 1, candidateId: 1 }, { unique: true });

module.exports = mongoose.model('CenterVote', CenterVoteSchema);