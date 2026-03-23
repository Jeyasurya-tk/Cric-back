import mongoose from "mongoose";

// User Schema
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: false },
  mobileNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String },
  role: { type: String, enum: ['admin', 'captain', 'player', 'public', 'developer'], default: 'player' },
  profileImage: { type: String },
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  canManageAssets: { type: Boolean, default: false },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { collection: 'members' });

export const User = mongoose.models.User || mongoose.model("User", userSchema);

// Team Schema
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  format: { type: String, default: 'T20' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  scorerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
  stats: {
    totalMatches: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    winPercentage: { type: Number, default: 0 },
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    nrr: { type: Number, default: 0 }
  },
  amountEditRequest: {
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    requestedAt: { type: Date }
  }
});

export const Team = mongoose.models.Team || mongoose.model("Team", teamSchema);

// Player Schema (Additional details for players)
const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: { type: String, default: 'Madurai' },
  dob: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Prefer not to say'], default: 'Male' },
  views: { type: Number, default: 0 },
  playingRole: { type: String, enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicketkeeper', 'Wicket-keeper batter'], default: 'Batsman' },
  battingStyle: { type: String, enum: ['Right-hand bat', 'Left-hand bat', 'RHB', 'LHB'], default: 'Right-hand bat' },
  bowlingStyle: { type: String, default: 'Right-arm medium' },
  jerseyNumber: { type: Number },
  stats: {
    batting: {
      runs: { type: Number, default: 0 },
      matches: { type: Number, default: 0 },
      innings: { type: Number, default: 0 },
      highestScore: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      strikeRate: { type: Number, default: 0 },
      ballsFaced: { type: Number, default: 0 },
      fours: { type: Number, default: 0 },
      sixes: { type: Number, default: 0 },
      fifties: { type: Number, default: 0 },
      hundreds: { type: Number, default: 0 }
    },
    bowling: {
      matches: { type: Number, default: 0 },
      overs: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      runsConceded: { type: Number, default: 0 },
      bestBowling: {
        wickets: { type: Number, default: 0 },
        runs: { type: Number, default: 0 }
      },
      average: { type: Number, default: 0 },
      economy: { type: Number, default: 0 },
      strikeRate: { type: Number, default: 0 },
      maidens: { type: Number, default: 0 }
    },
    // Keep old fields for backward compatibility if needed, or migration
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    matches: { type: Number, default: 0 },
    avg: { type: Number, default: 0 },
    sr: { type: Number, default: 0 },
    er: { type: Number, default: 0 }
  }
});

export const Player = mongoose.models.Player || mongoose.model("Player", playerSchema);

// Match Schema
const matchSchema = new mongoose.Schema({
  teamA: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  teamB: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  scorerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  overs: { type: Number, default: 20 },
  matchFormat: { type: String, enum: ['T10', 'T20', '50 overs', 'custom'], default: 'T20' },
  type: { type: String },
  venue: { type: String },
  toss: {
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    decision: { type: String, enum: ['bat', 'bowl'] }
  },
  playingXIA: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  playingXIB: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  battingTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  bowlingTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  striker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  nonStriker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentBowler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  innings: { type: Number, default: 1 },
  target: { type: Number },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  result: { type: String },
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
  stage: { type: String, enum: ['league', 'quarterfinal', 'semifinal', 'final', 'none'], default: 'none' },
  balls: [{
    innings: { type: Number, default: 1 },
    over: Number,
    ball: Number,
    runs: Number,
    extra: String,
    extraRuns: { type: Number, default: 0 },
    wicket: String,
    wicketType: String,
    wicketFielder: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    wicketBatsman: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    batsman: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bowler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    shotDirection: String,
    shotAngle: Number,
    runsOffBat: { type: Boolean, default: true },
    commentary: String,
    commentaryTamil: String
  }],
  awards: {
    manOfTheMatch: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manOfTheMatchDetails: {
      playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      runs: Number,
      wickets: Number,
      score: Number
    },
    bestPartnership: {
      runs: Number,
      balls: Number,
      player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      player1Name: String,
      player2Name: String
    },
    bestBatsman: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bestBowler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  status: { type: String, enum: ['scheduled', 'live', 'completed', 'abandoned', 'rescheduled', 'upcoming', 'delayed', 'walkover'], default: 'scheduled' },
  isFreeHit: { type: Boolean, default: false },
  matchNumber: { type: Number },
  liveLink: { type: String },
  date: { type: Date, default: Date.now }
});

export const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);

// Collection Schema (Financial)
const collectionSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
  title: { type: String, required: true },
  description: { type: String },
  amountPerMember: { type: Number, required: true },
  expectedAmt: { type: Number, default: 0 },
  collectedAmt: { type: Number, default: 0 },
  dueDate: { type: Date }
});

export const Collection = mongoose.models.Collection || mongoose.model("Collection", collectionSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', required: true },
  status: { type: String, enum: ['Paid', 'Partial', 'Pending', 'verification_pending', 'rejected'], default: 'Pending' },
  amount: { type: Number, default: 0 },
  proofImage: { type: String },
  method: { type: String },
  transactionId: { type: String },
  submittedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date }
});

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

// Tournament Schema
const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  city: { type: String },
  ground: { type: String },
  organiserName: { type: String },
  organiserContact: {
    countryCode: { type: String, default: '+91' },
    phoneNumber: { type: String }
  },
  contactPermission: { type: Boolean, default: false },
  tournamentCategory: { type: String, enum: ['OPEN', 'CORPORATE', 'COMMUNITY', 'SCHOOL', 'BOX CRICKET', 'SERIES', 'OTHER'], default: 'OPEN' },
  pitchType: { type: String, enum: ['ROUGH', 'CEMENT', 'TURF', 'ASTROTURF', 'MATTING'], default: 'TURF' },
  matchType: { type: String, enum: ['Limited Overs', 'The Hundred', 'Box Cricket', 'Unlimited Overs', 'Test Match', 'Pair Cricket'], default: 'Limited Overs' },
  ballType: { type: String, enum: ['Tennis Ball', 'Leather Ball', 'Other Ball'], default: 'Leather Ball' },
  tags: [String],
  banner: { type: String },
  logo: { type: String },
  startDate: { type: Date },
  endDate: { type: Date },
  format: { type: String, default: 'T20' },
  tournamentType: { type: String, enum: ['League', 'Knockout', 'League + Knockout'], default: 'League' },
  oversPerMatch: { type: Number, default: 20 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
  fixtureConfig: {
    maxMatchesPerTeamPerDay: { type: Number, default: 1 },
    gapBetweenMatches: { type: Number, default: 1 },
    availableGrounds: [String]
  },
  groups: [{
    name: String,
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }]
  }],
  rounds: [{
    name: String,
    roundType: { type: String, enum: ['League', 'Quarter Final', 'Semi Final', 'Final', 'Eliminator', 'Knockout'], default: 'League' }
  }],
  standings: [{
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    tied: { type: Number, default: 0 },
    noResult: { type: Number, default: 0 },
    pts: { type: Number, default: 0 },
    nrr: { type: Number, default: 0 }
  }],
  currentStep: { type: String, enum: ['SETTINGS', 'TEAMS', 'ROUNDS', 'GROUPS', 'MATCHES', 'PUBLISHED'], default: 'SETTINGS' },
  status: { type: String, enum: ['upcoming', 'live', 'completed'], default: 'upcoming' },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }
});

export const Tournament = mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);

// Expense Schema (per Collection)
const expenseSchema = new mongoose.Schema({
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', required: false, default: null },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

export const Expense = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);

// Team Asset Schema
const teamAssetSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  description: { type: String, default: "Team Asset" },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

export const TeamAsset = mongoose.models.TeamAsset || mongoose.model("TeamAsset", teamAssetSchema);

// Notification Schema
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['payment', 'match', 'tournament', 'system', 'message'], default: 'match' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

// Scorecard Upload Schema
const scorecardUploadSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamA: String,
  teamB: String,
  date: { type: Date, default: Date.now },
  tournamentName: String,
  playersMissing: [{
    name: String,
    mobileNumber: String,
    role: String
  }],
  status: { type: String, enum: ['pending', 'processed'], default: 'pending' },
  data: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

export const ScorecardUpload = mongoose.models.ScorecardUpload || mongoose.model("ScorecardUpload", scorecardUploadSchema);
