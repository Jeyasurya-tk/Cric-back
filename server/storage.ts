import { User as UserModel, Team as TeamModel, Player as PlayerModel, Match as MatchModel, Collection as CollectionModel, Payment as PaymentModel, Tournament as TournamentModel, Expense as ExpenseModel, Notification as NotificationModel, TeamAsset as TeamAssetModel, ScorecardUpload as ScorecardUploadModel } from "@shared/schema";
import mongoose from "mongoose";

export interface IStorage {
  // ... (previous methods)
  getTournamentStats(tournamentId: string): Promise<any>;

  // User & Player profile updates
  updateUserProfile(userId: string, updates: any): Promise<any>;
  updatePlayerProfile(userId: string, updates: any): Promise<any>;
  incrementPlayerViews(userId: string): Promise<any>;
  followUser(userId: string, targetUserId: string): Promise<any>;
  unfollowUser(userId: string, targetUserId: string): Promise<any>;
  getUsersByRole(role: string): Promise<any[]>;

  // Notification operations
  createNotification(notification: any): Promise<any>;
  getNotifications(userId: string): Promise<any[]>;
  markNotificationRead(id: string): Promise<any>;
  clearNotifications(userId: string): Promise<any>;

  // Tournament operations
  createTournament(tournamentData: any): Promise<any>;
  getTournament(id: string): Promise<any>;
  getTournaments(): Promise<any[]>;
  updateTournament(id: string, updates: any): Promise<any>;
  deleteTournament(id: string): Promise<any>;
  addTeamToTournament(tournamentId: string, teamId: string): Promise<any>;
  removeTeamFromTournament(tournamentId: string, teamId: string): Promise<any>;
  setTournamentGroups(tournamentId: string, groups: any[]): Promise<any>;
  setTournamentRounds(tournamentId: string, rounds: any[]): Promise<any>;
  generateTournamentMatches(tournamentId: string): Promise<any>;
  updateTournamentStandings(tournamentId: string): Promise<void>;
  declareWalkover(matchId: string, winningTeamId: string, reason: string): Promise<any>;
  generatePlayoffs(tournamentId: string): Promise<any>;

  // Asset operations
  createTeamAsset(assetData: any): Promise<any>;
  getTeamAssets(): Promise<any[]>;
  getTeamAssetsTotal(): Promise<number>;

  // Payment operations
  deletePayment(id: string): Promise<any>;

  // Team amount edit operations
  requestTeamAmountEdit(teamId: string): Promise<any>;
  approveTeamAmountEdit(teamId: string): Promise<any>;
  rejectTeamAmountEdit(teamId: string): Promise<any>;

  // Scorecard upload operations
  createScorecardUpload(data: any): Promise<any>;
  getScorecardUploads(): Promise<any[]>;
  updateScorecardUpload(id: string, updates: any): Promise<any>;
}

export class MongoStorage implements IStorage {
  private broadcastTournamentUpdate: ((tournamentId: string, data: any) => void) | null = null;

  setTournamentBroadcaster(broadcaster: (tournamentId: string, data: any) => void): void {
    this.broadcastTournamentUpdate = broadcaster;
  }
  async getLeaderboard(season?: string, opponent?: string, tournamentId?: string): Promise<any> {
    const query: any = { status: 'completed' };
    if (season && season !== 'all') {
      const year = parseInt(season);
      query.date = { 
        $gte: new Date(year, 0, 1), 
        $lte: new Date(year, 11, 31, 23, 59, 59) 
      };
    }
    if (opponent && opponent !== 'all' && mongoose.Types.ObjectId.isValid(opponent)) {
      query.$or = [{ teamA: opponent }, { teamB: opponent }];
    }
    if (tournamentId && tournamentId !== 'all' && mongoose.Types.ObjectId.isValid(tournamentId)) {
      query.tournamentId = tournamentId;
    }

    const matches = await MatchModel.find(query).populate('playingXIA playingXIB teamA teamB');
    const playerStatsMap = new Map<string, any>();

    const getPlayer = (id: string, name: string) => {
      if (!playerStatsMap.has(id)) {
        playerStatsMap.set(id, {
          id,
          player: name,
          matches: 0,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissals: 0,
          wickets: 0,
          runsConceded: 0,
          ballsBowled: 0,
          bestWickets: 0,
          bestRuns: 999,
          bestOpponent: "",
          bestDate: ""
        });
      }
      return playerStatsMap.get(id);
    };

    for (const match of matches) {
      const allPlayersInMatch = new Set<string>();
      (match.playingXIA || []).forEach((p: any) => allPlayersInMatch.add(p._id?.toString() || p.toString()));
      (match.playingXIB || []).forEach((p: any) => allPlayersInMatch.add(p._id?.toString() || p.toString()));

      const matchDateStr = match.date ? new Date(match.date).toLocaleDateString() : "";

      // Count matches for all participants
      allPlayersInMatch.forEach(pid => {
        const u = [...(match.playingXIA || []), ...(match.playingXIB || [])].find(px => (px._id?.toString() || px.toString()) === pid) as any;
        const stats = getPlayer(pid, u?.fullName || "Unknown");
        stats.matches++;
      });

      // Process balls for batting and bowling
      for (const ball of match.balls || []) {
        const batsmanId = ball.batsman?._id?.toString() || ball.batsman?.toString();
        const bowlerId = ball.bowler?._id?.toString() || ball.bowler?.toString();

        if (batsmanId) {
          const bStats = getPlayer(batsmanId, ""); // Name already set or will be set
          const countsForBatsman = (!ball.extra || ball.extra === 'noball') && (ball.runsOffBat !== false);
          if (countsForBatsman) {
            bStats.runs += (ball.runs || 0);
            if (ball.runs === 4) bStats.fours++;
            if (ball.runs === 6) bStats.sixes++;
          }
          if (!['wide', 'noball'].includes(ball.extra || "")) bStats.balls++;
          if (ball.wicket) bStats.dismissals++;
        }

        if (bowlerId) {
          const bowStats = getPlayer(bowlerId, "");
          const isLegal = !['wide', 'noball'].includes(ball.extra || "");
          if (isLegal) bowStats.ballsBowled++;
          bowStats.runsConceded += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra || "") ? 1 : 0);
          if (ball.wicket && !['runout', 'retired hurt'].includes((ball.wicket || "").toLowerCase())) {
            bowStats.wickets++;
          }
        }
      }

      // Check for best bowling in this match
      const matchBowlers = new Map<string, { w: number, r: number }>();
      for (const ball of match.balls || []) {
        const bId = ball.bowler?._id?.toString() || ball.bowler?.toString();
        if (!bId) continue;
        if (!matchBowlers.has(bId)) matchBowlers.set(bId, { w: 0, r: 0 });
        const mbs = matchBowlers.get(bId)!;
        mbs.r += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra || "") ? 1 : 0);
        if (ball.wicket && !['runout', 'retired hurt'].includes((ball.wicket || "").toLowerCase())) mbs.w++;
      }

      matchBowlers.forEach((val, key) => {
        const ps = getPlayer(key, "");
        if (val.w > ps.bestWickets || (val.w === ps.bestWickets && val.r < ps.bestRuns)) {
          ps.bestWickets = val.w;
          ps.bestRuns = val.r;
          
          // Determine opponent for this bowler
          const isPlayerInTeamA = (match.playingXIA || []).some((p: any) => (p._id?.toString() || p.toString()) === key);
          const opponentTeam = isPlayerInTeamA ? match.teamB : match.teamA;
          ps.bestOpponent = (opponentTeam as any)?.name || "Unknown";
          ps.bestDate = matchDateStr;
        }
      });
    }

    const playerList = Array.from(playerStatsMap.values()).map(p => ({
      ...p,
      avg: p.dismissals > 0 ? Number((p.runs / p.dismissals).toFixed(2)) : (p.runs > 0 ? p.runs : 0),
      sr: p.balls > 0 ? Number(((p.runs / p.balls) * 100).toFixed(2)) : 0,
      economy: p.ballsBowled > 0 ? Number(((p.runsConceded / p.ballsBowled) * 6).toFixed(2)) : 0,
      bestBowling: `${p.bestWickets}/${p.bestRuns === 999 ? 0 : p.bestRuns}`,
      overs: Number((p.ballsBowled / 6).toFixed(1))
    }));

    return {
      orangeCap: [...playerList].sort((a, b) => b.runs - a.runs).slice(0, 10),
      purpleCap: [...playerList].sort((a, b) => b.wickets - a.wickets || a.economy - b.economy).slice(0, 10),
      mostSixes: [...playerList].sort((a, b) => b.sixes - a.sixes).filter(p => p.sixes > 0).slice(0, 10),
      mostFours: [...playerList].sort((a, b) => b.fours - a.fours).filter(p => p.fours > 0).slice(0, 10),
      highestStrikeRate: [...playerList].filter(p => p.balls >= 30).sort((a, b) => b.sr - a.sr).slice(0, 10),
      bestEconomy: [...playerList].filter(p => p.overs >= 4).sort((a, b) => a.economy - b.economy).slice(0, 10),
      bestBowlingFigures: [...playerList].filter(p => p.bestWickets > 0).sort((a, b) => b.bestWickets - a.bestWickets || a.bestRuns - b.bestRuns).slice(0, 10)
    };
  }

  async calculateManOfTheMatch(matchId: string): Promise<any> {
    const match = await this.getMatch(matchId);
    if (!match) return null;

    const playerScores = new Map<string, any>();

    const getPlayerScore = (id: string, name: string) => {
      if (!playerScores.has(id)) {
        playerScores.set(id, {
          id,
          name,
          runs: 0,
          wickets: 0,
          score: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          catches: 0,
          runouts: 0,
          stumpings: 0,
          overs: 0,
          runsConceded: 0,
          legalBalls: 0
        });
      }
      return playerScores.get(id);
    };

    // Calculate Batting and Bowling contributions
    for (const ball of match.balls || []) {
      const batsmanId = ball.batsman?._id?.toString() || ball.batsman?.toString();
      const bowlerId = ball.bowler?._id?.toString() || ball.bowler?.toString();

      if (batsmanId) {
        const u = [...(match.playingXIA || []), ...(match.playingXIB || [])].find(px => (px._id?.toString() || px.toString()) === batsmanId) as any;
        const ps = getPlayerScore(batsmanId, u?.fullName || "Unknown");
        const countsForBatsman = (!ball.extra || ball.extra === 'noball') && (ball.runsOffBat !== false);
        if (countsForBatsman) {
          ps.runs += (ball.runs || 0);
          if (ball.runs === 4) ps.fours++;
          if (ball.runs === 6) ps.sixes++;
        }
        if (!['wide', 'noball'].includes(ball.extra || "")) ps.balls++;
      }

      if (bowlerId) {
        const u = [...(match.playingXIA || []), ...(match.playingXIB || [])].find(px => (px._id?.toString() || px.toString()) === bowlerId) as any;
        const ps = getPlayerScore(bowlerId, u?.fullName || "Unknown");
        const isLegal = !['wide', 'noball'].includes(ball.extra);
        if (isLegal) ps.legalBalls++;
        ps.runsConceded += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra) ? 1 : 0);
        
        if (ball.wicket) {
          const wType = ball.wicket.toLowerCase();
          if (!['runout', 'retired hurt', 'retired', 'retired out'].includes(wType)) {
            ps.wickets++;
          }
          // Fielding contributions from ball data if available (e.g., "caught Rahul")
          // Assuming wicket string format "caught Rahul" or "bowled"
          if (wType.includes('caught')) {
            // Need a way to identify fielder, but if not available, we skip for now
          }
        }
      }
    }

    // Apply Scoring Formula
    playerScores.forEach(ps => {
      // Batting score
      let battingScore = ps.runs * 1;
      battingScore += Math.floor(ps.runs / 50) * 10;
      battingScore += Math.floor(ps.runs / 100) * 20;
      battingScore += ps.fours * 1;
      battingScore += ps.sixes * 2;

      // Bowling score
      let bowlingScore = ps.wickets * 25;
      if (ps.wickets >= 5) bowlingScore += 20;
      else if (ps.wickets >= 3) bowlingScore += 10;

      const economy = ps.legalBalls > 0 ? (ps.runsConceded / ps.legalBalls) * 6 : 0;
      if (ps.legalBalls >= 12 && economy < 6) bowlingScore += 10;

      // Fielding (Catches, Runouts, Stumpings) - if tracked separately
      // For now, let's use what we have in ball data
      
      ps.score = battingScore + bowlingScore;
    });

    const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => b.score - a.score);
    const topPlayer = sortedPlayers[0];

    if (topPlayer) {
      const details = {
        playerId: topPlayer.id,
        name: topPlayer.name,
        runs: topPlayer.runs,
        wickets: topPlayer.wickets,
        score: topPlayer.score
      };
      await MatchModel.findByIdAndUpdate(matchId, {
        $set: {
          "awards.manOfTheMatch": topPlayer.id,
          "awards.manOfTheMatchDetails": details
        }
      });
      return details;
    }
    return null;
  }

  async calculateBestPartnership(matchId: string): Promise<any> {
    const match = await this.getMatch(matchId);
    if (!match || !match.balls || match.balls.length === 0) return null;

    let bestPartnership = { runs: 0, balls: 0, p1: "", p2: "", p1Name: "", p2Name: "" };

    const inningsList = [1, 2];
    for (const inn of inningsList) {
      const innBalls = match.balls.filter((b: any) => b.innings === inn);
      if (innBalls.length === 0) continue;

      let currentRuns = 0;
      let currentBalls = 0;
      const batsmenSeen = new Set<string>();
      let activePair: string[] = [];

      for (const ball of innBalls) {
        const strikerId = ball.batsman?._id?.toString() || ball.batsman?.toString();
        if (!strikerId) continue;

        if (!batsmenSeen.has(strikerId)) {
          batsmenSeen.add(strikerId);
          if (activePair.length < 2) {
            activePair.push(strikerId);
          }
        }

        if (ball.wicket) {
          if (activePair.length === 2) {
            if (currentRuns > bestPartnership.runs) {
              bestPartnership = {
                runs: currentRuns,
                balls: currentBalls,
                p1: activePair[0],
                p2: activePair[1],
                p1Name: "",
                p2Name: ""
              };
            }
          }
          activePair = activePair.filter(id => id !== strikerId);
          currentRuns = 0;
          currentBalls = 0;
        } else {
          currentRuns += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra) ? 1 : 0);
          if (!['wide', 'noball'].includes(ball.extra || "")) currentBalls++;
        }
      }

      if (activePair.length === 2 && currentRuns > bestPartnership.runs) {
        bestPartnership = {
          runs: currentRuns,
          balls: currentBalls,
          p1: activePair[0],
          p2: activePair[1],
          p1Name: "",
          p2Name: ""
        };
      }
    }

    if (bestPartnership.p1 && bestPartnership.p2) {
      const p1User = await UserModel.findById(bestPartnership.p1);
      const p2User = await UserModel.findById(bestPartnership.p2);
      
      const details = {
        runs: bestPartnership.runs,
        balls: bestPartnership.balls,
        player1: bestPartnership.p1,
        player2: bestPartnership.p2,
        player1Name: p1User?.fullName || "Unknown",
        player2Name: p2User?.fullName || "Unknown"
      };

      await MatchModel.findByIdAndUpdate(matchId, {
        $set: { "awards.bestPartnership": details }
      });
      return details;
    }
    return null;
  }

  async wipeDatabase(): Promise<void> {
    const { Team, Player, Match, Collection, Payment, Tournament, Expense, User } = await import("@shared/schema");
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Match.deleteMany({});
    await Collection.deleteMany({});
    await Payment.deleteMany({});
    await Tournament.deleteMany({});
    await Expense.deleteMany({});
    await User.updateMany({}, { $set: { teams: [] } });
  }

  async getUser(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await UserModel.findById(id);
  }

  async getUserByMobileNumber(mobileNumber: string): Promise<any> {
    return await UserModel.findOne({ mobileNumber });
  }

  async createUser(insertUser: any): Promise<any> {
    if (!insertUser.username) {
      insertUser.username = "user_" + insertUser.mobileNumber;
    }
    const user = new UserModel(insertUser);
    return await user.save();
  }

  async getUsers(): Promise<any[]> {
    return await UserModel.find({ role: { $nin: ['developer', 'public'] } }).populate('teams');
  }

  async getUsersByRole(role: string): Promise<any[]> {
    return await UserModel.find({ role });
  }

  async deleteUser(id: string): Promise<any> {
    return await UserModel.findByIdAndDelete(id);
  }

  async deleteTeam(id: string): Promise<any> {
    return await TeamModel.findByIdAndDelete(id);
  }

  async deleteMatch(id: string): Promise<any> {
    return await MatchModel.findByIdAndDelete(id);
  }

  async deleteTournament(id: string): Promise<any> {
    return await TournamentModel.findByIdAndDelete(id);
  }

  async deleteCollection(id: string): Promise<any> {
    return await CollectionModel.findByIdAndDelete(id);
  }

  

  async updateUserStatus(id: string, updates: any): Promise<any> {
    return await UserModel.findByIdAndUpdate(id, { $set: updates }, { new: true });
  }

  // Team operations
  async createTeam(teamData: any): Promise<any> {
    const team = new TeamModel(teamData);
    return await team.save();
  }

  async getTeam(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await TeamModel.findById(id).populate('players adminId scorerId');
  }

  async getTeams(): Promise<any[]> {
    return await TeamModel.find().populate('players adminId scorerId');
  }

  async getTeamsByAdmin(adminId: string): Promise<any[]> {
    return await TeamModel.find({ adminId }).populate('players');
  }

  async updateTeam(id: string, updates: any): Promise<any> {
    return await TeamModel.findByIdAndUpdate(id, { $set: updates }, { new: true }).populate('players adminId scorerId');
  }

  async addPlayerToTeam(teamId: string, userId: string): Promise<any> {
    return await TeamModel.findByIdAndUpdate(
      teamId,
      { $addToSet: { players: userId } },
      { new: true }
    );
  }

  // Player operations
  async createPlayer(playerData: any): Promise<any> {
    const player = new PlayerModel(playerData);
    return await player.save();
  }

  async getPlayerByUserId(userId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return undefined;
    
    // Ensure the User exists first
    const user = await UserModel.findById(userId);
    if (!user) return undefined;

    // Use findOneAndUpdate with upsert to ensure Player document exists
    return await PlayerModel.findOneAndUpdate(
      { userId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate({
      path: 'userId',
      populate: { path: 'teams' }
    });
  }

  async updateUserProfile(userId: string, updates: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return undefined;
    return await UserModel.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  }

  async updatePlayerProfile(userId: string, updates: any): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return undefined;
    return await PlayerModel.findOneAndUpdate({ userId }, { $set: updates }, { new: true, upsert: true });
  }

  async incrementPlayerViews(userId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return undefined;
    return await PlayerModel.findOneAndUpdate({ userId }, { $inc: { views: 1 } }, { new: true, upsert: true });
  }

  async followUser(userId: string, targetUserId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(targetUserId)) return undefined;
    // Add targetUserId to userId's following
    await UserModel.findByIdAndUpdate(userId, { $addToSet: { following: targetUserId } });
    // Add userId to targetUserId's followers
    return await UserModel.findByIdAndUpdate(targetUserId, { $addToSet: { followers: userId } }, { new: true });
  }

  async unfollowUser(userId: string, targetUserId: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(targetUserId)) return undefined;
    // Remove targetUserId from userId's following
    await UserModel.findByIdAndUpdate(userId, { $pull: { following: targetUserId } });
    // Remove userId from targetUserId's followers
    return await UserModel.findByIdAndUpdate(targetUserId, { $pull: { followers: userId } }, { new: true });
  }

  async getPlayerDetailedStats(playerId: string, year?: number, opponent?: string): Promise<any> {
    const player = await this.getPlayerByUserId(playerId);
    if (!player) return null;

    const query: any = {
      $or: [{ playingXIA: playerId }, { playingXIB: playerId }],
      status: { $in: ['live', 'completed'] }
    };

    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (opponent && mongoose.Types.ObjectId.isValid(opponent) && opponent !== "undefined" && opponent !== "all") {
      query.$and = [
        { $or: [{ teamA: opponent }, { teamB: opponent }] }
      ];
    }

    const matches = await MatchModel.find(query)
      .populate('teamA teamB awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
      .populate('balls.batsman balls.bowler')
      .sort({ date: -1 });

    const stats = {
      player: {
        fullName: player.userId?.fullName,
        role: player.userId?.role,
        profileImage: player.userId?.profileImage,
        battingStyle: player.battingStyle,
        bowlingStyle: player.bowlingStyle
      },
      batting: {
        matches: 0,
        runs: 0,
        average: 0,
        strikeRate: 0,
        fifties: 0,
        hundreds: 0,
        highestScore: 0,
        ballsFaced: 0,
        dismissals: 0
      },
      bowling: {
        matches: 0,
        wickets: 0,
        economy: 0,
        best: "0/0",
        bestWickets: -1,
        bestRuns: 999,
        average: 0,
        runsConceded: 0,
        ballsBowled: 0
      },
      matches: [] as any[]
    };

    const getId = (ref: any) => {
      if (!ref) return "";
      if (typeof ref === 'string') return ref;
      if (ref._id) return ref._id.toString();
      if (typeof ref.toString === 'function') return ref.toString();
      return String(ref);
    };

    const targetPlayerId = playerId.toString();

    for (const match of matches) {
      const playerBalls = (match.balls || []).filter((b: any) => getId(b.batsman) === targetPlayerId);
      const matchRuns = playerBalls.reduce((acc: number, b: any) => acc + (b.runs || 0), 0);
      const matchBalls = playerBalls.filter((b: any) => b.extra !== 'wide').length;
      const isOut = (match.balls || []).some((b: any) => b.wicket && getId(b.batsman) === targetPlayerId);

      const isUserInA = (match.playingXIA || []).some((id: any) => getId(id) === targetPlayerId);
      const opponentTeam = isUserInA ? match.teamB : match.teamA;

      if (playerBalls.length > 0 || isOut) {
        stats.batting.matches++;
        stats.batting.runs += matchRuns;
        stats.batting.ballsFaced += matchBalls;
        if (isOut) stats.batting.dismissals++;
        if (matchRuns > stats.batting.highestScore) stats.batting.highestScore = matchRuns;
        if (matchRuns >= 100) stats.batting.hundreds++;
        else if (matchRuns >= 50) stats.batting.fifties++;
      }

      const bowlingBalls = (match.balls || []).filter((b: any) => getId(b.bowler) === targetPlayerId);
      const matchWickets = bowlingBalls.filter((b: any) => b.wicket && !['runout', 'retired hurt', 'obstructing the field', 'hit the ball twice'].includes(b.wicket.toLowerCase())).length;
      const matchRunsConceded = bowlingBalls.reduce((acc: number, b: any) => acc + (b.runs || 0) + (['wide', 'noball'].includes(b.extra) ? 1 : 0), 0);
      const matchLegalBalls = bowlingBalls.filter((b: any) => !['wide', 'noball'].includes(b.extra)).length;

      if (bowlingBalls.length > 0) {
        stats.bowling.matches++;
        stats.bowling.wickets += matchWickets;
        stats.bowling.runsConceded += matchRunsConceded;
        stats.bowling.ballsBowled += matchLegalBalls;

        if (matchWickets > stats.bowling.bestWickets || (matchWickets === stats.bowling.bestWickets && matchRunsConceded < stats.bowling.bestRuns)) {
          stats.bowling.bestWickets = matchWickets;
          stats.bowling.bestRuns = matchRunsConceded;
          stats.bowling.best = `${matchWickets}/${matchRunsConceded}`;
        }
      }

      stats.matches.push({
        _id: match._id,
        date: match.date,
        opponent: (opponentTeam as any).name,
        runs: matchRuns,
        balls: matchBalls,
        wickets: matchWickets,
        economy: matchLegalBalls > 0 ? ((matchRunsConceded / matchLegalBalls) * 6).toFixed(2) : "0.00"
      });
    }

    if (stats.batting.dismissals > 0) stats.batting.average = Number((stats.batting.runs / stats.batting.dismissals).toFixed(2));
    else if (stats.batting.runs > 0) stats.batting.average = stats.batting.runs;

    if (stats.batting.ballsFaced > 0) stats.batting.strikeRate = Number(((stats.batting.runs / stats.batting.ballsFaced) * 100).toFixed(2));

    if (stats.bowling.ballsBowled > 0) stats.bowling.economy = Number(((stats.bowling.runsConceded / stats.bowling.ballsBowled) * 6).toFixed(2));
    if (stats.bowling.wickets > 0) stats.bowling.average = Number((stats.bowling.runsConceded / stats.bowling.wickets).toFixed(2));

    return stats;
  }

  async updatePlayerStats(userId: string, stats: any): Promise<any> {
    return await PlayerModel.findOneAndUpdate(
      { userId },
      { $set: { stats } },
      { new: true }
    );
  }

  async getMatchYears(): Promise<number[]> {
    const matches = await MatchModel.find({ status: 'completed' }, 'date');
    const years = new Set(matches.map(m => new Date(m.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }

  // Match operations
  async createMatch(matchData: any): Promise<any> {
    const match = new MatchModel(matchData);
    return await match.save();
  }

  async getMatch(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await MatchModel.findById(id)
      .populate({ path: 'teamA', populate: { path: 'players adminId' } })
      .populate({ path: 'teamB', populate: { path: 'players adminId' } })
      .populate('playingXIA playingXIB battingTeam bowlingTeam striker nonStriker currentBowler scorerId createdById tournamentId')
      .populate('awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
      .populate('balls.batsman balls.bowler');
  }

  async getMatches(participantId?: string, status?: string): Promise<any[]> {
    const query: any = {};
    if (status) query.status = status;
    if (participantId) {
      query.$or = [
        { playingXIA: participantId },
        { playingXIB: participantId },
        { createdById: participantId },
        { scorerId: participantId }
      ];
    }

    return await MatchModel.find(query)
      .populate({ path: 'teamA', populate: { path: 'players adminId' } })
      .populate({ path: 'teamB', populate: { path: 'players adminId' } })
      .populate('playingXIA playingXIB battingTeam bowlingTeam striker nonStriker currentBowler scorerId createdById')
      .populate('awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
      .populate('balls.batsman balls.bowler')
      .sort({ _id: -1 });
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    return await MatchModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).populate({ path: 'teamA', populate: { path: 'players' } })
     .populate({ path: 'teamB', populate: { path: 'players' } })
     .populate('playingXIA playingXIB battingTeam bowlingTeam striker nonStriker currentBowler scorerId createdById')
     .populate('awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
     .populate('balls.batsman balls.bowler balls.wicketFielder balls.wicketBatsman');
  }

  async recordBall(matchId: string, ball: any): Promise<any> {
    const match = await MatchModel.findByIdAndUpdate(
      matchId,
      { $push: { balls: ball } },
      { new: true }
    ).populate({ path: 'teamA', populate: { path: 'players' } })
     .populate({ path: 'teamB', populate: { path: 'players' } })
     .populate('playingXIA playingXIB battingTeam bowlingTeam striker nonStriker currentBowler scorerId createdById')
     .populate('awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
     .populate('balls.batsman balls.bowler balls.wicketFielder balls.wicketBatsman');

    if (match) {
      await this.updateStatsAfterBall(match, ball);
    }
    return match;
  }

  public async updateStatsAfterBall(match: any, ball: any): Promise<void> {
    const { batsman, bowler, runs, extra, extraRuns, runsOffBat, wicket, wicketType } = ball;
    const batsmanId = batsman?._id || batsman;
    const bowlerId = bowler?._id || bowler;

    if (batsmanId) {
      const isWide = extra === 'wide';
      const isNoBall = extra === 'noball';
      const isByeOrLegBye = extra === 'byes' || extra === 'legbyes';
      
      let batRuns = 0;
      let countBall = true;

      if (isWide) {
        batRuns = 0;
        countBall = false;
      } else if (isNoBall) {
        batRuns = runsOffBat ? (runs || 0) : 0;
        countBall = false;
      } else if (isByeOrLegBye) {
        batRuns = 0;
        countBall = true;
      } else {
        batRuns = runs || 0;
        countBall = true;
      }

      const player = await PlayerModel.findOneAndUpdate(
        { userId: batsmanId },
        { 
          $inc: { 
            "stats.batting.runs": batRuns,
            "stats.batting.ballsFaced": countBall ? 1 : 0,
            "stats.batting.fours": batRuns === 4 ? 1 : 0,
            "stats.batting.sixes": batRuns === 6 ? 1 : 0
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (player?.stats?.batting && player.stats.batting.ballsFaced > 0) {
        player.stats.batting.strikeRate = (player.stats.batting.runs / player.stats.batting.ballsFaced) * 100;
        if (player.stats.batting.matches === 0) {
          await this.recalculatePlayerStats(batsmanId);
        } else {
          await player.save();
        }
      }
    }

    if (bowlerId) {
      const dismissalType = (wicketType || wicket || "").toLowerCase();
      const bowlerWicketTypes = ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket', 'out'];
      const isWicket = !!wicket && bowlerWicketTypes.includes(dismissalType);
      
      const isWide = extra === 'wide';
      const isNoBall = extra === 'noball';
      
      let runsConceded = 0;
      if (isWide) {
        runsConceded = 1 + (extraRuns || 0);
      } else if (isNoBall) {
        runsConceded = 1 + (runs || 0); // No ball runs are always conceded by bowler (whether off bat or extra)
      } else if (extra === 'byes' || extra === 'legbyes') {
        runsConceded = 0; // Byes/Legbyes not added to bowler
      } else {
        runsConceded = runs || 0;
      }
      
      const player = await PlayerModel.findOneAndUpdate(
        { userId: bowlerId },
        { 
          $inc: { 
            "stats.bowling.wickets": isWicket ? 1 : 0,
            "stats.bowling.runsConceded": runsConceded,
            "stats.bowling.ballsBowled": (isWide || isNoBall) ? 0 : 1
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (player && player.stats?.bowling) {
        // Calculate economy and average
        const balls = player.stats.bowling.ballsBowled || 0;
        if (balls > 0) {
          player.stats.bowling.overs = Math.floor(balls / 6) + (balls % 6) / 10;
          player.stats.bowling.economy = (player.stats.bowling.runsConceded / balls) * 6;
          if (player.stats.bowling.wickets > 0) {
            player.stats.bowling.average = player.stats.bowling.runsConceded / player.stats.bowling.wickets;
            player.stats.bowling.strikeRate = balls / player.stats.bowling.wickets;
          }
        }

        if (player.stats.bowling.matches === 0) {
          await this.recalculatePlayerStats(bowlerId);
        } else {
          await player.save();
        }
      }
    }
  }

  async updateMatchStatus(matchId: string, status: string): Promise<any> {
    return await MatchModel.findByIdAndUpdate(
      matchId,
      { $set: { status } },
      { new: true }
    );
  }

  async undoBall(matchId: string): Promise<any> {
    const match = await MatchModel.findById(matchId);
    if (!match || !match.balls || match.balls.length === 0) return match;

    const ballToUndo = match.balls[match.balls.length - 1];
    const updates: any = { $pop: { balls: 1 } };
    
    // Revert status if match was completed
    if (match.status === 'completed') {
      updates.$set = { status: 'live', result: '' };
    }

    const updatedMatch = await MatchModel.findByIdAndUpdate(
      matchId,
      updates,
      { new: true }
    ).populate({ path: 'teamA', populate: { path: 'players' } })
     .populate({ path: 'teamB', populate: { path: 'players' } })
     .populate('playingXIA playingXIB battingTeam bowlingTeam striker nonStriker currentBowler scorerId createdById')
     .populate('awards.manOfTheMatch awards.bestBatsman awards.bestBowler')
     .populate('balls.batsman balls.bowler balls.wicketFielder balls.wicketBatsman');

    if (updatedMatch) {
      await this.revertStatsFromBall(updatedMatch, ballToUndo);
    }

    return updatedMatch;
  }

  private async revertStatsFromBall(match: any, ball: any): Promise<void> {
    const { batsman, bowler, runs, extra, wicket } = ball;
    const batsmanId = batsman?._id || batsman;
    const bowlerId = bowler?._id || bowler;

    if (batsmanId) {
      const isWide = extra === 'wide';
      const runsScored = runs || 0;
      const player = await PlayerModel.findOneAndUpdate(
        { userId: batsmanId },
        { 
          $inc: { 
            "stats.batting.runs": -runsScored,
            "stats.batting.ballsFaced": isWide ? 0 : -1,
            "stats.batting.fours": runsScored === 4 ? -1 : 0,
            "stats.batting.sixes": runsScored === 6 ? -1 : 0
          }
        },
        { new: true }
      );

      // Re-calculate Strike Rate
      if (player?.stats?.batting) {
        if (player.stats.batting.ballsFaced > 0) {
          player.stats.batting.strikeRate = (player.stats.batting.runs / player.stats.batting.ballsFaced) * 100;
        } else {
          player.stats.batting.strikeRate = 0;
        }
        await player.save();
      }
    }

    if (bowlerId) {
      const isWicket = !!wicket && !['runout', 'retired hurt', 'obstructing the field', 'hit the ball twice'].includes(wicket.toLowerCase());
      const isExtra = ['wide', 'noball'].includes(extra);
      const runsConceded = (runs || 0) + (isExtra ? 1 : 0);
      
      await PlayerModel.findOneAndUpdate(
        { userId: bowlerId },
        { 
          $inc: { 
            "stats.bowling.wickets": isWicket ? -1 : 0,
            "stats.bowling.runsConceded": -runsConceded
          }
        }
      );
    }
  }

  async endInnings(matchId: string): Promise<any> {
    const match = await this.getMatch(matchId);
    if (!match) throw new Error("Match not found");

    const currentInnings = match.innings || 1;
    const balls = match.balls || [];
    const inningsBalls = balls.filter((b: any) => b.innings === currentInnings);
    const totalRuns = inningsBalls.reduce((acc: number, b: any) => acc + (b.runs || 0) + (['wide', 'noball'].includes(b.extra) ? 1 : 0), 0);

    if (currentInnings === 1) {
      const target = totalRuns + 1;
      const nextBattingTeam = match.bowlingTeam;
      const nextBowlingTeam = match.battingTeam;

      return await this.updateMatch(matchId, {
        innings: 2,
        target,
        battingTeam: nextBattingTeam._id || nextBattingTeam,
        bowlingTeam: nextBowlingTeam._id || nextBowlingTeam,
        striker: null,
        nonStriker: null,
        currentBowler: null
      });
    } else {
      // 2nd innings manual end
      const target = match.target || 0;
      let result = "";
      let winnerId = null;

      if (totalRuns >= target) {
        winnerId = match.battingTeam._id || match.battingTeam;
        const totalWickets = inningsBalls.filter((b: any) => b.wicket && b.wicketType !== 'retired hurt').length;
        const battingTeamPlayers = match.battingTeam._id?.toString() === match.teamA._id?.toString() ? match.playingXIA : match.playingXIB;
        const maxWickets = (battingTeamPlayers?.length || 11) - 1;
        const wicketsRemaining = (maxWickets + 1) - totalWickets;
        result = `${match.battingTeam.name} won by ${wicketsRemaining} wickets`;
      } else {
        winnerId = match.bowlingTeam._id || match.bowlingTeam;
        const runsDefended = target - totalRuns - 1;
        result = `${match.bowlingTeam.name} won by ${runsDefended} runs`;
      }

      return await this.updateMatch(matchId, {
        result,
        winner: winnerId
      });
    }
  }

  async endMatch(matchId: string): Promise<any> {
    const match = await this.getMatch(matchId);
    if (!match) throw new Error("Match not found");

    // Re-calculate result if not already set or for final confirmation
    let result = match.result;
    let winner = match.winner;

    if (!result || result === "Match In Progress") {
      const currentInnings = match.innings || 1;
      const innings2Balls = match.balls?.filter((b: any) => b.innings === 2) || [];
      const innings2Runs = innings2Balls.reduce((acc: number, b: any) => acc + (b.runs || 0) + (['wide', 'noball'].includes(b.extra) ? 1 : 0), 0);
      const target = match.target || 0;

      if (currentInnings === 2) {
        if (innings2Runs >= target) {
          winner = match.battingTeam;
          const totalWickets = innings2Balls.filter((b: any) => b.wicket && b.wicketType !== 'retired hurt').length;
          const battingTeamPlayers = match.battingTeam._id?.toString() === match.teamA._id?.toString() ? match.playingXIA : match.playingXIB;
          const maxWickets = (battingTeamPlayers?.length || 11) - 1;
          const wicketsRemaining = (maxWickets + 1) - totalWickets;
          result = `${match.battingTeam.name} won by ${wicketsRemaining} wickets`;
        } else {
          winner = match.bowlingTeam;
          const runsDefended = target - innings2Runs - 1;
          result = `${match.bowlingTeam.name} won by ${runsDefended} runs`;
        }
      } else {
        // Match ended during 1st innings? Unusual but maybe abandoned
        result = "Match Abandoned/No Result";
      }
    }

    const updatedMatch = await this.updateMatch(matchId, {
      status: 'completed',
      result,
      winner: winner?._id || winner
    });

    // Calculate awards
    await this.calculateManOfTheMatch(matchId);
    await this.calculateBestPartnership(matchId);

    // Recalculate stats for all involved players and teams
    if (updatedMatch) {
      const playerIds = [...(match.playingXIA || []), ...(match.playingXIB || [])];
      for (const playerId of playerIds) {
        await this.recalculatePlayerStats(playerId?._id || playerId);
      }
      
      await this.recalculateTeamStats(match.teamA?._id || match.teamA);
      await this.recalculateTeamStats(match.teamB?._id || match.teamB);

      // Send notifications to all players in the match
      const allPlayers = [...(match.playingXIA || []), ...(match.playingXIB || [])];
      for (const playerId of allPlayers) {
        await this.createNotification({
          userId: playerId?._id || playerId,
          title: "Match Completed",
          message: `Match finished: ${result}. Check the full scorecard and analytics.`,
          type: 'match'
        });
      }

      // Update tournament standings if it's a tournament match
      if (updatedMatch.tournamentId) {
        await this.updateTournamentStandings(updatedMatch.tournamentId.toString());
        
        // Handle knockout progression
        if (updatedMatch.stage !== 'league' && updatedMatch.stage !== 'final' && updatedMatch.stage !== 'none') {
          await this.handleKnockoutProgression(updatedMatch);
        }
      }
    }

    return updatedMatch;
  }

  private async recalculatePlayerStats(userId: string): Promise<void> {
    const matches = await MatchModel.find({
      $or: [
        { playingXIA: userId },
        { playingXIB: userId }
      ],
      status: { $in: ['live', 'completed'] }
    });

    const stats = {
      batting: {
        runs: 0, matches: matches.length, innings: 0, highestScore: 0,
        average: 0, strikeRate: 0, ballsFaced: 0, fours: 0, sixes: 0,
        fifties: 0, hundreds: 0
      },
      bowling: {
        overs: 0, wickets: 0, runsConceded: 0, bestBowling: { wickets: 0, runs: 0 },
        average: 0, economy: 0, strikeRate: 0, maidens: 0
      }
    };

    const getId = (ref: any) => {
      if (!ref) return "";
      if (typeof ref === 'string') return ref;
      if (ref._id) return ref._id.toString();
      if (typeof ref.toString === 'function') return ref.toString();
      return String(ref);
    };

    const targetUserId = userId.toString();

    for (const match of matches) {
      const playerBalls = (match.balls || []).filter((b: any) => getId(b.batsman) === targetUserId);
      if (playerBalls.length > 0) {
        stats.batting.innings++;
        const matchRuns = playerBalls.reduce((acc: number, b: any) => acc + (b.runs || 0), 0);
        const matchBalls = playerBalls.filter((b: any) => b.extra !== 'wide').length;
        
        stats.batting.runs += matchRuns;
        stats.batting.ballsFaced += matchBalls;
        stats.batting.fours += playerBalls.filter((b: any) => b.runs === 4).length;
        stats.batting.sixes += playerBalls.filter((b: any) => b.runs === 6).length;
        
        if (matchRuns > stats.batting.highestScore) stats.batting.highestScore = matchRuns;
        if (matchRuns >= 100) stats.batting.hundreds++;
        else if (matchRuns >= 50) stats.batting.fifties++;
      }

      const bowlingBalls = (match.balls || []).filter((b: any) => getId(b.bowler) === targetUserId);
      if (bowlingBalls.length > 0) {
        const matchWickets = bowlingBalls.filter((b: any) => b.wicket && !['runout', 'retired hurt', 'obstructing the field', 'hit the ball twice'].includes(b.wicket.toLowerCase())).length;
        const matchRunsConceded = bowlingBalls.reduce((acc: number, b: any) => acc + (b.runs || 0) + (['wide', 'noball'].includes(b.extra) ? 1 : 0), 0);
        
        stats.bowling.wickets += matchWickets;
        stats.bowling.runsConceded += matchRunsConceded;
        
        if (matchWickets > stats.bowling.bestBowling.wickets || 
           (matchWickets === stats.bowling.bestBowling.wickets && matchRunsConceded < stats.bowling.bestBowling.runs)) {
          stats.bowling.bestBowling = { wickets: matchWickets, runs: matchRunsConceded };
        }
      }
    }

    // Final calculations
    if (stats.batting.innings > 0) stats.batting.average = stats.batting.runs / stats.batting.innings;
    if (stats.batting.ballsFaced > 0) stats.batting.strikeRate = (stats.batting.runs / stats.batting.ballsFaced) * 100;
    
    // Proper total over conversion
    const totalValidBalls = matches.reduce((acc, m) => acc + (m.balls || []).filter((b: any) => getId(b.bowler) === targetUserId && !['wide', 'noball'].includes(b.extra)).length, 0);
    stats.bowling.overs = Math.floor(totalValidBalls / 6) + (totalValidBalls % 6) / 10;

    if (stats.bowling.wickets > 0) stats.bowling.average = stats.bowling.runsConceded / stats.bowling.wickets;
    if (totalValidBalls > 0) stats.bowling.economy = (stats.bowling.runsConceded / totalValidBalls) * 6;
    if (stats.bowling.wickets > 0) stats.bowling.strikeRate = totalValidBalls / stats.bowling.wickets;

    await PlayerModel.findOneAndUpdate({ userId }, { $set: { stats } }, { upsert: true, setDefaultsOnInsert: true });
  }

  private async recalculateTeamStats(teamId: string): Promise<void> {
    const matches = await MatchModel.find({
      $or: [{ teamA: teamId }, { teamB: teamId }],
      status: 'completed'
    });

    const stats = {
      totalMatches: matches.length,
      wins: matches.filter((m: any) => m.winner?.toString() === teamId.toString()).length,
      losses: matches.filter((m: any) => m.winner && m.winner.toString() !== teamId.toString()).length,
      winPercentage: 0,
      totalRuns: 0,
      totalWickets: 0,
      nrr: 0
    };

    if (stats.totalMatches > 0) {
      stats.winPercentage = (stats.wins / stats.totalMatches) * 100;
    }

    // NRR and other totals would need complex calculation based on all balls
    // For now, let's keep it simple
    await TeamModel.findByIdAndUpdate(teamId, { $set: { stats } });
  }

  // Financial operations
  async createCollection(collectionData: any): Promise<any> {
    let playerIds: string[] = [];
    
    if (collectionData.memberIds && Array.isArray(collectionData.memberIds) && collectionData.memberIds.length > 0) {
      playerIds = collectionData.memberIds.map((id: any) => id.toString());
    } else if (collectionData.memberId) {
      playerIds = [collectionData.memberId.toString()];
    }

    if (collectionData.teamIds && Array.isArray(collectionData.teamIds) && collectionData.teamIds.length > 0) {
      const teams = await TeamModel.find({ _id: { $in: collectionData.teamIds } });
      const teamCaptains = teams.map(team => team.adminId?.toString()).filter(Boolean) as string[];
      playerIds = Array.from(new Set([...playerIds, ...teamCaptains]));
    } else if (collectionData.teamId) {
      const team = await TeamModel.findById(collectionData.teamId);
      if (team && team.adminId) {
        playerIds = Array.from(new Set([...playerIds, team.adminId.toString()]));
      }
    }

    if (playerIds.length === 0 && collectionData.tournamentId) {
      const tournament = await TournamentModel.findById(collectionData.tournamentId).populate('teams');
      if (!tournament) throw new Error("Tournament not found");
      
      // Bill each team's admin (captain) in the tournament
      playerIds = (tournament.teams as any[] || []).map(team => team.adminId?.toString()).filter(Boolean);
    } 

    if (playerIds.length === 0) {
      throw new Error("Target selection is required");
    }

    const amountPerMember = parseFloat(collectionData.amountPerMember);
    const expectedAmt = playerIds.length * amountPerMember;

    const collection = new CollectionModel({
      ...collectionData,
      expectedAmt,
      collectedAmt: collectionData.status === 'Paid' ? expectedAmt : 0
    });
    const savedCollection = await collection.save();

    // Create payment records for all identified members
    if (playerIds.length > 0) {
      const payments = playerIds.map(playerId => ({
        memberId: playerId,
        collectionId: savedCollection._id,
        status: collectionData.status || 'Pending',
        amount: collectionData.status === 'Paid' ? amountPerMember : 0 
      }));
      await PaymentModel.insertMany(payments);
    }

    return savedCollection;
  }

  async getCollection(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await CollectionModel.findById(id).populate('teamId');
  }

  async getCollectionsByTeam(teamId: string): Promise<any[]> {
    return await CollectionModel.find({ teamId });
  }

  async createPayment(paymentData: any): Promise<any> {
    const payment = new PaymentModel(paymentData);
    return await payment.save();
  }

  async getPayment(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await PaymentModel.findById(id);
  }

  async getPaymentsByCollection(collectionId: string): Promise<any[]> {
    return await PaymentModel.find({ collectionId }).populate('memberId');
  }

  async getPaymentsByMember(memberId: string): Promise<any[]> {
    return await PaymentModel.find({ memberId }).populate('collectionId');
  }

  async updatePaymentStatus(paymentId: string, status: string): Promise<any> {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) return null;

    const oldStatus = payment.status;
    const updatedPayment = await PaymentModel.findByIdAndUpdate(
      paymentId,
      { $set: { status } },
      { new: true }
    ).populate('collectionId') as any;

    if (!updatedPayment) return null;

    // Update collection's collectedAmt if status changed to/from Paid
    if (oldStatus !== 'Paid' && status === 'Paid') {
      await CollectionModel.findByIdAndUpdate(payment.collectionId, {
        $inc: { collectedAmt: updatedPayment.collectionId?.amountPerMember || 0 }
      });
    } else if (oldStatus === 'Paid' && status !== 'Paid') {
      await CollectionModel.findByIdAndUpdate(payment.collectionId, {
        $inc: { collectedAmt: -(updatedPayment.collectionId?.amountPerMember || 0) }
      });
    }

    return updatedPayment;
  }

  async submitPayment(paymentId: string, submissionData: { transactionId: string, proofImage?: string, amount: number }): Promise<any> {
    return await PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $set: {
          status: 'verification_pending',
          transactionId: submissionData.transactionId,
          proofImage: submissionData.proofImage,
          amount: submissionData.amount,
          submittedAt: new Date()
        }
      },
      { new: true }
    ).populate('collectionId memberId');
  }

  async verifyPayment(paymentId: string, status: string, adminId: string): Promise<any> {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) return null;

    const oldStatus = payment.status;
    const verifiedAt = new Date();

    const updatedPayment = await PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $set: {
          status,
          verifiedBy: adminId,
          verifiedAt
        }
      },
      { new: true }
    ).populate('collectionId memberId') as any;

    if (!updatedPayment) return null;

    // Update collection's collectedAmt if status changed to/from Paid
    if (oldStatus !== 'Paid' && status === 'Paid') {
      await CollectionModel.findByIdAndUpdate(payment.collectionId, {
        $inc: { collectedAmt: updatedPayment.amount || updatedPayment.collectionId?.amountPerMember || 0 }
      });
    } else if (oldStatus === 'Paid' && status !== 'Paid') {
      await CollectionModel.findByIdAndUpdate(payment.collectionId, {
        $inc: { collectedAmt: -(updatedPayment.amount || updatedPayment.collectionId?.amountPerMember || 0) }
      });
    }

    return updatedPayment;
  }

  async getPendingVerifications(): Promise<any[]> {
    return await PaymentModel.find({ status: 'verification_pending' }).populate('memberId collectionId');
  }

async deletePayment(id: string): Promise<any> {
  const payment = await PaymentModel.findById(id).populate('collectionId');
  if (!payment) return null;

  if (payment.status === 'Paid') {
    const amount =
      payment.amount ||
      payment.collectionId?.amountPerMember ||
      0;

    const collectionId =
      payment.collectionId?._id || payment.collectionId;

    await CollectionModel.findByIdAndUpdate(collectionId, {
      $inc: { collectedAmt: -amount }
    });
  }

  return await PaymentModel.findByIdAndDelete(id);
}

  // Tournament operations
  async createTournament(tournamentData: any): Promise<any> {
    const tournament = new TournamentModel(tournamentData);
    return await tournament.save();
  }

  async getTournament(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return await TournamentModel.findById(id)
      .populate('teams adminId')
      .populate({
        path: 'matches',
        populate: { path: 'teamA teamB winner' }
      })
      .populate('groups.teams');
  }

  async getTournaments(): Promise<any[]> {
    return await TournamentModel.find().populate('teams adminId');
  }

  async updateTournament(id: string, updates: any): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('teams adminId')
      .populate('matches');
  }

  async addTeamToTournament(tournamentId: string, teamId: string): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(
      tournamentId,
      { $addToSet: { teams: teamId } },
      { new: true }
    ).populate('teams');
  }

  async removeTeamFromTournament(tournamentId: string, teamId: string): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(
      tournamentId,
      { $pull: { teams: teamId } },
      { new: true }
    ).populate('teams');
  }

  async setTournamentGroups(tournamentId: string, groups: any[]): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(
      tournamentId,
      { $set: { groups } },
      { new: true }
    ).populate('groups.teams');
  }

  async setTournamentRounds(tournamentId: string, rounds: any[]): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(
      tournamentId,
      { $set: { rounds } },
      { new: true }
    );
  }

  async generateTournamentMatches(tournamentId: string): Promise<any> {
    const tournament = await TournamentModel.findById(tournamentId).populate('teams groups.teams');
    if (!tournament) throw new Error("Tournament not found");

    const matchOvers = tournament.oversPerMatch || 20;
    const fixtureConfig = tournament.fixtureConfig || {
      maxMatchesPerTeamPerDay: 1,
      gapBetweenMatches: 1,
      availableGrounds: []
    };

    const maxMatchesPerDay = fixtureConfig.maxMatchesPerTeamPerDay || 1;
    const gapDays = fixtureConfig.gapBetweenMatches || 1;
    const grounds = fixtureConfig.availableGrounds && fixtureConfig.availableGrounds.length > 0 
      ? fixtureConfig.availableGrounds 
      : [tournament.ground || tournament.city || 'Tournament Ground'];

    const matchups: { teamA: any, teamB: any, groupName?: string }[] = [];

    // Logic depends on current configuration
    if (tournament.groups && tournament.groups.length > 0) {
      for (const group of tournament.groups) {
        const groupTeams = group.teams.map((t: any) => t._id || t);
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            matchups.push({
              teamA: groupTeams[i],
              teamB: groupTeams[j],
              groupName: group.name
            });
          }
        }
      }
    } else if (tournament.teams && tournament.teams.length > 0) {
      const teams = tournament.teams.map((t: any) => t._id || t);
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          matchups.push({
            teamA: teams[i],
            teamB: teams[j]
          });
        }
      }
    }

    if (matchups.length === 0) return tournament;

    // Scheduling Algorithm
    const matchesToCreate = [];
    const teamLastMatchDate = new Map<string, Date>();
    const teamDailyMatchCount = new Map<string, Map<string, number>>(); // teamId -> dateString -> count
    const groundSchedule = new Map<string, Map<string, number>>(); // ground -> dateString -> matchCount

    let currentMatchNumber = 1;
    let startDate = tournament.startDate ? new Date(tournament.startDate) : new Date();
    startDate.setHours(9, 0, 0, 0); // Start at 9 AM

    // Simple heuristic: try to fill matches day by day
    let currentDate = new Date(startDate);
    let matchupsToSchedule = [...matchups];

    // We'll limit to 100 iterations to avoid infinite loops in case of impossible constraints
    let iterations = 0;
    while (matchupsToSchedule.length > 0 && iterations < 1000) {
      iterations++;
      const dateKey = currentDate.toISOString().split('T')[0];
      
      for (const ground of grounds) {
        // Find a matchup that can play on this date
        const matchupIndex = matchupsToSchedule.findIndex(m => {
          const teamAId = m.teamA.toString();
          const teamBId = m.teamB.toString();

          // Check max matches per day
          const teamACount = teamDailyMatchCount.get(teamAId)?.get(dateKey) || 0;
          const teamBCount = teamDailyMatchCount.get(teamBId)?.get(dateKey) || 0;
          if (teamACount >= maxMatchesPerDay || teamBCount >= maxMatchesPerDay) return false;

          // Check gap between matches (only if they didn't play today yet)
          if (teamACount === 0) {
            const lastA = teamLastMatchDate.get(teamAId);
            if (lastA) {
              const diffDays = Math.ceil((currentDate.getTime() - lastA.getTime()) / (1000 * 3600 * 24));
              if (diffDays < gapDays) return false;
            }
          }

          if (teamBCount === 0) {
            const lastB = teamLastMatchDate.get(teamBId);
            if (lastB) {
              const diffDays = Math.ceil((currentDate.getTime() - lastB.getTime()) / (1000 * 3600 * 24));
              if (diffDays < gapDays) return false;
            }
          }

          // Check ground availability - for now, let's assume 2 matches per ground per day (Morning/Afternoon)
          // Adjust based on how many matches a ground can host. Let's say 2 for now.
          const groundCount = groundSchedule.get(ground)?.get(dateKey) || 0;
          if (groundCount >= 2) return false;

          return true;
        });

        if (matchupIndex !== -1) {
          const matchup = matchupsToSchedule.splice(matchupIndex, 1)[0];
          const teamAId = matchup.teamA.toString();
          const teamBId = matchup.teamB.toString();

          const matchDate = new Date(currentDate);
          const groundCount = groundSchedule.get(ground)?.get(dateKey) || 0;
          // Offset time if second match on same ground
          if (groundCount === 1) matchDate.setHours(14, 0, 0, 0); // 2 PM

          matchesToCreate.push({
            teamA: matchup.teamA,
            teamB: matchup.teamB,
            status: 'upcoming',
            overs: matchOvers,
            venue: ground,
            tournamentId,
            stage: 'league',
            date: matchDate,
            matchNumber: currentMatchNumber++
          });

          // Update tracking
          teamLastMatchDate.set(teamAId, matchDate);
          teamLastMatchDate.set(teamBId, matchDate);

          if (!teamDailyMatchCount.has(teamAId)) teamDailyMatchCount.set(teamAId, new Map());
          teamDailyMatchCount.get(teamAId)!.set(dateKey, (teamDailyMatchCount.get(teamAId)!.get(dateKey) || 0) + 1);

          if (!teamDailyMatchCount.has(teamBId)) teamDailyMatchCount.set(teamBId, new Map());
          teamDailyMatchCount.get(teamBId)!.set(dateKey, (teamDailyMatchCount.get(teamBId)!.get(dateKey) || 0) + 1);

          if (!groundSchedule.has(ground)) groundSchedule.set(ground, new Map());
          groundSchedule.get(ground)!.set(dateKey, groundCount + 1);
        }
      }

      // Move to next day if no more matchups can be scheduled today or all grounds full
      const allGroundsFull = grounds.every((g: string) => (groundSchedule.get(g)?.get(dateKey) || 0) >= 2);
      if (allGroundsFull || iterations % grounds.length === 0) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Handle any remaining matchups (shouldn't happen with enough iterations, but safety)
    for (const matchup of matchupsToSchedule) {
      matchesToCreate.push({
        teamA: matchup.teamA,
        teamB: matchup.teamB,
        status: 'upcoming',
        overs: matchOvers,
        venue: grounds[0],
        tournamentId,
        stage: 'league',
        date: currentDate,
        matchNumber: currentMatchNumber++
      });
    }

    if (matchesToCreate.length > 0) {
      const createdMatches = await MatchModel.insertMany(matchesToCreate);
      const matchIds = createdMatches.map(m => m._id);
      
      return await TournamentModel.findByIdAndUpdate(
        tournamentId,
        { 
          $addToSet: { matches: { $each: matchIds } },
          $set: { currentStep: 'MATCHES' }
        },
        { new: true }
      ).populate('matches');
    }

    return tournament;
  }

  async updateStandings(tournamentId: string, standings: any[]): Promise<any> {
    return await TournamentModel.findByIdAndUpdate(
      tournamentId,
      { $set: { standings } },
      { new: true }
    );
  }

  async updateTournamentStandings(tournamentId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(tournamentId)) return;
    
    const tournament = await TournamentModel.findById(tournamentId);
    if (!tournament) return;

    // Get all completed or walkover matches for this tournament
    const matches = await MatchModel.find({ 
      tournamentId, 
      status: { $in: ['completed', 'walkover'] }
    });

    const teamStatsMap = new Map<string, any>();

    // Initialize stats for all teams in tournament
    for (const teamId of tournament.teams) {
      const idStr = teamId.toString();
      teamStatsMap.set(idStr, {
        teamId: idStr,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        pts: 0,
        runsScored: 0,
        ballsFaced: 0,
        runsConceded: 0,
        ballsBowled: 0,
        nrr: 0
      });
    }

    // Check if final is completed to set tournament winner
    const finalMatch = matches.find(m => m.stage === 'final');
    if (finalMatch && finalMatch.winner) {
      await TournamentModel.findByIdAndUpdate(tournamentId, {
        $set: { 
          winner: finalMatch.winner,
          status: 'completed'
        }
      });
    }

    // Process only league matches for points table
    const leagueMatches = matches.filter(m => m.stage === 'league');

    for (const match of leagueMatches) {
      const teamAId = match.teamA.toString();
      const teamBId = match.teamB.toString();

      const statsA = teamStatsMap.get(teamAId);
      const statsB = teamStatsMap.get(teamBId);

      if (!statsA || !statsB) continue;

      statsA.played++;
      statsB.played++;

      if (match.winner) {
        if (match.winner.toString() === teamAId) {
          statsA.won++;
          statsA.pts += 2;
          statsB.lost++;
        } else {
          statsB.won++;
          statsB.pts += 2;
          statsA.lost++;
        }
      } else if (match.result?.toLowerCase().includes('tie')) {
        statsA.tied++;
        statsA.pts += 1;
        statsB.tied++;
        statsB.pts += 1;
      } else if (match.result?.toLowerCase().includes('no result') || match.result?.toLowerCase().includes('abandoned')) {
        statsA.noResult = (statsA.noResult || 0) + 1;
        statsA.pts += 1;
        statsB.noResult = (statsB.noResult || 0) + 1;
        statsB.pts += 1;
      }

      // Calculate runs and balls for NRR
      let rA = 0, bA = 0, rB = 0, bB = 0;
      
      for (const ball of match.balls || []) {
        if (ball.innings === 1) {
          rA += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra || "") ? 1 : 0);
          if (!['wide', 'noball'].includes(ball.extra || "")) bA++;
        } else if (ball.innings === 2) {
          rB += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra || "") ? 1 : 0);
          if (!['wide', 'noball'].includes(ball.extra || "")) bB++;
        }
      }

      statsA.runsScored += rA;
      statsA.ballsFaced += bA;
      statsA.runsConceded += rB;
      statsA.ballsBowled += bB;

      statsB.runsScored += rB;
      statsB.ballsFaced += bB;
      statsB.runsConceded += rA;
      statsB.ballsBowled += bA;
    }

    // Finalize NRR
    const standings = Array.from(teamStatsMap.values()).map(stats => {
      const oversFaced = stats.ballsFaced / 6;
      const oversBowled = stats.ballsBowled / 6;
      
      const batRate = oversFaced > 0 ? stats.runsScored / oversFaced : 0;
      const bowlRate = oversBowled > 0 ? stats.runsConceded / oversBowled : 0;
      
      stats.nrr = Number((batRate - bowlRate).toFixed(3));
      return stats;
    });

    await TournamentModel.findByIdAndUpdate(tournamentId, { $set: { standings } });

    // Broadcast update to real-time clients
    if (this.broadcastTournamentUpdate) {
      this.broadcastTournamentUpdate(tournamentId, { type: 'standings-update', standings });
    }
  }

  async declareWalkover(matchId: string, winningTeamId: string, reason: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(matchId)) throw new Error("Invalid match ID");
    
    const match = await MatchModel.findById(matchId).populate('teamA teamB');
    if (!match) throw new Error("Match not found");

    if (match.status !== 'scheduled' && match.status !== 'upcoming' && match.status !== 'delayed') {
      throw new Error("Walkover can only be declared for matches that have not started.");
    }

    const winnerTeam = winningTeamId === match.teamA._id.toString() ? match.teamA : match.teamB;
    const loserTeam = winningTeamId === match.teamA._id.toString() ? match.teamB : match.teamA;

    const resultString = `${winnerTeam.name} won by Walkover (${reason})`;

    const updatedMatch = await MatchModel.findByIdAndUpdate(
      matchId,
      { 
        $set: { 
          status: 'walkover',
          winner: winningTeamId,
          result: resultString
        } 
      },
      { new: true }
    ).populate('teamA teamB');

    if (updatedMatch.tournamentId) {
      await this.updateTournamentStandings(updatedMatch.tournamentId.toString());
    }

    return updatedMatch;
  }

  async generatePlayoffs(tournamentId: string): Promise<any> {
    const tournament = await TournamentModel.findById(tournamentId).populate('groups.teams');
    if (!tournament) throw new Error("Tournament not found");

    if (tournament.tournamentType === 'League') return null;

    const matchesToCreate = [];
    const matchOvers = tournament.oversPerMatch || 20;

    // If we have 2 groups (Group A and Group B), take top 2 from each
    if (tournament.groups && tournament.groups.length === 2) {
      const getGroupStandings = (groupName: string) => {
        const group = tournament.groups.find((g: any) => g.name === groupName);
        if (!group) return [];
        const groupTeamIds = group.teams.map((t: any) => (t._id || t).toString());
        return [...(tournament.standings || [])]
          .filter(s => s.teamId && groupTeamIds.includes(s.teamId.toString()))
          .sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
      };

      const topA = getGroupStandings("Group A").slice(0, 2);
      const topB = getGroupStandings("Group B").slice(0, 2);

      if (topA.length === 2 && topB.length === 2) {
        // A1 vs B2
        matchesToCreate.push({
          teamA: topA[0].teamId,
          teamB: topB[1].teamId,
          status: 'upcoming',
          overs: matchOvers,
          venue: tournament.ground || tournament.city || 'Tournament Ground',
          tournamentId,
          stage: 'semifinal'
        });
        // B1 vs A2
        matchesToCreate.push({
          teamA: topB[0].teamId,
          teamB: topA[1].teamId,
          status: 'upcoming',
          overs: matchOvers,
          venue: tournament.ground || tournament.city || 'Tournament Ground',
          tournamentId,
          stage: 'semifinal'
        });
      }
    } else {
      // Flat standings top 4
      const standings = [...(tournament.standings || [])].sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
      const top4 = standings.slice(0, 4);

      if (top4.length < 2) throw new Error("Need at least 2 teams to generate playoffs");

      if (top4.length === 4) {
        // 1st vs 4th, 2nd vs 3rd
        matchesToCreate.push({
          teamA: top4[0].teamId,
          teamB: top4[3].teamId,
          status: 'upcoming',
          overs: matchOvers,
          venue: tournament.ground || tournament.city || 'Tournament Ground',
          tournamentId,
          stage: 'semifinal'
        });
        matchesToCreate.push({
          teamA: top4[1].teamId,
          teamB: top4[2].teamId,
          status: 'upcoming',
          overs: matchOvers,
          venue: tournament.ground || tournament.city || 'Tournament Ground',
          tournamentId,
          stage: 'semifinal'
        });
      } else if (top4.length === 2) {
        matchesToCreate.push({
          teamA: top4[0].teamId,
          teamB: top4[1].teamId,
          status: 'upcoming',
          overs: matchOvers,
          venue: tournament.ground || tournament.city || 'Tournament Ground',
          tournamentId,
          stage: 'final'
        });
      }
    }

    if (matchesToCreate.length > 0) {
      const createdMatches = await MatchModel.insertMany(matchesToCreate);
      const matchIds = createdMatches.map(m => m._id);
      
      return await TournamentModel.findByIdAndUpdate(
        tournamentId,
        { $addToSet: { matches: { $each: matchIds } } },
        { new: true }
      ).populate('matches');
    }

    return tournament;
  }

  async handleKnockoutProgression(match: any): Promise<void> {
    const tournamentId = match.tournamentId.toString();
    const tournament = await TournamentModel.findById(tournamentId);
    if (!tournament) return;

    // Find all completed matches in the current stage
    const currentStageMatches = await MatchModel.find({ 
      tournamentId, 
      status: 'completed', 
      stage: match.stage 
    });

    // Check if all matches for the current stage in this tournament are finished
    // For semifinals, we expect 2 matches. For quarterfinals, 4.
    const expectedMatchCount = match.stage === 'semifinal' ? 2 : (match.stage === 'quarterfinal' ? 4 : 0);
    
    if (currentStageMatches.length === expectedMatchCount) {
      const winners = currentStageMatches.map(m => m.winner?.toString()).filter(Boolean);
      const nextStage = match.stage === 'quarterfinal' ? 'semifinal' : (match.stage === 'semifinal' ? 'final' : '');
      
      if (!nextStage) return;

      const nextMatches = [];
      const matchOvers = tournament.oversPerMatch || 20;

      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          nextMatches.push({
            teamA: winners[i],
            teamB: winners[i + 1],
            status: 'upcoming',
            overs: matchOvers,
            venue: tournament.ground || tournament.city || 'Tournament Ground',
            tournamentId,
            stage: nextStage
          });
        }
      }

      const createdMatchIds = [];
      for (const mData of nextMatches) {
        const nm = await this.createMatch(mData);
        createdMatchIds.push(nm._id);
      }

      if (createdMatchIds.length > 0) {
        await TournamentModel.findByIdAndUpdate(tournamentId, {
          $push: { matches: { $each: createdMatchIds } }
        });
      }
    }
  }

  async getTournamentBracket(tournamentId: string): Promise<any> {
    const matches = await MatchModel.find({ tournamentId })
      .populate('teamA teamB winner')
      .sort({ date: 1 });

    const bracket: any = {
      quarterFinals: matches.filter(m => m.stage === 'quarterfinal'),
      semiFinals: matches.filter(m => m.stage === 'semifinal'),
      final: matches.find(m => m.stage === 'final')
    };

    return bracket;
  }

  async getTournamentStats(tournamentId: string): Promise<any> {
    const tournament = await TournamentModel.findById(tournamentId).populate('teams');
    if (!tournament) return null;

    const matches = await MatchModel.find({ tournamentId, status: 'completed' });
    
    let totalRuns = 0;
    let totalWickets = 0;
    const matchCount = matches.length;

    for (const match of matches) {
      for (const ball of match.balls || []) {
        totalRuns += (ball.runs || 0) + (['wide', 'noball'].includes(ball.extra || "") ? 1 : 0);
        if (ball.wicket && !['runout', 'retired hurt'].includes((ball.wicket || "").toLowerCase())) {
          totalWickets++;
        }
      }
    }

    const leaderboard = await this.getLeaderboard('all', 'all', tournamentId);

    const teamPerformance = tournament.standings || [];
    
    // Aggregate runs/wickets per team for charts
    const runsByTeam = tournament.teams.map((team: any) => {
      let teamRuns = 0;
      let teamWickets = 0;
      matches.forEach(m => {
        if (m.teamA.toString() === team._id.toString() || m.teamB.toString() === team._id.toString()) {
          m.balls?.forEach((b: any) => {
            const isTeamInnings = (m.teamA.toString() === team._id.toString() && b.innings === (m.battingTeam?.toString() === m.teamA.toString() ? 1 : 2)) ||
                                 (m.teamB.toString() === team._id.toString() && b.innings === (m.battingTeam?.toString() === m.teamB.toString() ? 1 : 2));
            if (isTeamInnings) {
              teamRuns += (b.runs || 0) + (['wide', 'noball'].includes(b.extra || "") ? 1 : 0);
            } else {
              // Bowling team innings
              if (b.wicket && !['runout', 'retired hurt'].includes((b.wicket || "").toLowerCase())) {
                teamWickets++;
              }
            }
          });
        }
      });
      return { name: team.name, runs: teamRuns, wickets: teamWickets };
    });

    const runDistribution = matches.map((m, idx) => {
      let matchRuns = 0;
      m.balls?.forEach((b: any) => {
        matchRuns += (b.runs || 0) + (['wide', 'noball'].includes(b.extra || "") ? 1 : 0);
      });
      return { name: `M${idx + 1}`, runs: matchRuns };
    });

    return {
      overview: {
        totalMatches: matchCount,
        totalRuns,
        totalWickets,
        avgRunsPerMatch: matchCount > 0 ? (totalRuns / matchCount).toFixed(2) : 0
      },
      topPerformers: leaderboard,
      teamPerformance,
      charts: {
        runsByTeam,
        runDistribution,
        // Win percentage logic
        winPercentage: teamPerformance.map((s: any) => {
          const team = tournament.teams.find((t: any) => t._id.toString() === s.teamId.toString());
          return {
            name: (team as any)?.name || 'Unknown',
            value: s.played > 0 ? Math.round((s.won / s.played) * 100) : 0
          };
        })
      }
    };
  }

  // Expense operations
  async createExpense(expenseData: any): Promise<any> {
    console.log("[DEBUG] createExpense called with data:", expenseData);
    const data = {
      ...expenseData,
      collectionId: expenseData.collectionId || null
    };
    const expense = new ExpenseModel(data);
    return await expense.save();
  }

  async getExpenses(): Promise<any[]> {
    return await ExpenseModel.find().populate('collectionId').sort({ date: -1 });
  }

  async getExpensesByCollection(collectionId: string): Promise<any[]> {
    return await ExpenseModel.find({ collectionId });
  }

  // Analytics
  async getStats(userId?: string, role?: string): Promise<any> {
    const totalTeams = await TeamModel.countDocuments();
    const totalPlayers = await UserModel.countDocuments({ role: { $nin: ['public', 'developer'] } });
    const totalMatches = await MatchModel.countDocuments();
    
    const collections = await CollectionModel.find();
    let totalExpected = collections.reduce((acc, c) => acc + (c.expectedAmt || 0), 0);
    let totalCollected = collections.reduce((acc, c) => acc + (c.collectedAmt || 0), 0);

    const expenses = await ExpenseModel.find();
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    const payments = await PaymentModel.find();
    const paidCount = payments.filter(p => p.status === 'Paid').length;
    const partialCount = payments.filter(p => p.status === 'Partial').length;
    const pendingCount = payments.filter(p => p.status === 'Pending').length;

    const totalAssets = await this.getTeamAssetsTotal();

    const recentMatches = await MatchModel.find().populate('teamA teamB').sort({ _id: -1 }).limit(5);

    // If userId is provided and user is a player, return player-specific stats
    // Otherwise return club-wide stats (Admin/Captain view)
    let pendingPayments;
    const isFullAdmin = role === 'admin' || role === 'developer';

    if (userId && !isFullAdmin) {
      const userPayments = await PaymentModel.find({ memberId: userId }).populate('collectionId') as any[];
      
      // Calculate personal financial stats
      totalExpected = userPayments.reduce((acc, p) => acc + (p.collectionId?.amountPerMember || 0), 0);
      totalCollected = userPayments.filter(p => p.status === 'Paid').reduce((acc, p) => acc + (p.collectionId?.amountPerMember || 0), 0);
      
      pendingPayments = userPayments.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
    } else {
      // Admin/Developer view - show global stats and recent global payments
      pendingPayments = await PaymentModel.find({ status: 'Pending' })
        .populate('memberId collectionId')
        .sort({ _id: -1 })
        .limit(10);
    }

    return {
      totalTeams,
      totalPlayers,
      totalMatches,
      totalExpected,
      totalCollected,
      totalExpenses,
      totalAssets,
      paymentStats: {
        paid: paidCount,
        partial: partialCount,
        pending: pendingCount
      },
      recentMatches,
      pendingPayments
    };
  }

  // Notification operations
  async createNotification(notificationData: any): Promise<any> {
    const notification = new NotificationModel(notificationData);
    return await notification.save();
  }

  async getNotifications(userId: string): Promise<any[]> {
    return await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(20);
  }

  async markNotificationRead(id: string): Promise<any> {
    return await NotificationModel.findByIdAndUpdate(id, { read: true }, { new: true });
  }

  async clearNotifications(userId: string): Promise<any> {
    return await NotificationModel.deleteMany({ userId });
  }

  // Asset operations
  async createTeamAsset(assetData: any): Promise<any> {
    const asset = new TeamAssetModel(assetData);
    return await asset.save();
  }

  async getTeamAssets(): Promise<any[]> {
    return await TeamAssetModel.find().sort({ date: -1 });
  }

  async getTeamAssetsTotal(): Promise<number> {
    const assets = await TeamAssetModel.find();
    return assets.reduce((acc, a) => acc + (a.amount || 0), 0);
  }

  // Team amount edit operations
  async requestTeamAmountEdit(teamId: string): Promise<any> {
    return await TeamModel.findByIdAndUpdate(teamId, {
      amountEditRequest: { status: 'pending', requestedAt: new Date() }
    }, { new: true });
  }

  async approveTeamAmountEdit(teamId: string): Promise<any> {
    return await TeamModel.findByIdAndUpdate(teamId, {
      amountEditRequest: { status: 'approved', requestedAt: new Date() }
    }, { new: true });
  }

  async rejectTeamAmountEdit(teamId: string): Promise<any> {
    return await TeamModel.findByIdAndUpdate(teamId, {
      amountEditRequest: { status: 'rejected', requestedAt: new Date() }
    }, { new: true });
  }

  // Scorecard upload operations
  async createScorecardUpload(data: any): Promise<any> {
    const scorecard = new ScorecardUploadModel(data);
    return await scorecard.save();
  }

  async getScorecardUploads(): Promise<any[]> {
    return await ScorecardUploadModel.find().populate('adminId').sort({ createdAt: -1 });
  }

  async updateScorecardUpload(id: string, updates: any): Promise<any> {
    return await ScorecardUploadModel.findByIdAndUpdate(id, updates, { new: true });
  }
}

export const storage = new MongoStorage();
