import { describe, it, expect, beforeEach } from "vitest";

interface Proposal {
  projectId: number;
  milestoneId: number | null;
  proposalType: number;
  creator: string;
  createdAt: number;
  deadline: number;
  yesVotes: bigint;
  noVotes: bigint;
  status: number;
}

interface Vote {
  vote: boolean;
  stake: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  minStake: bigint;
  votingPeriod: number;
  proposals: Map<string, Proposal>;
  votes: Map<string, Vote>;
  voterStakes: Map<string, { stake: bigint }>;
  blockHeight: number;
  PROPOSAL_MILESTONE_APPROVAL: number;
  PROPOSAL_PROJECT_CANCELLATION: number;
  STATUS_PENDING: number;
  STATUS_APPROVED: number;
  STATUS_REJECTED: number;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setMinStake(caller: string, newStake: bigint): { value: boolean } | { error: number };
  setVotingPeriod(caller: string, newPeriod: number): { value: boolean } | { error: number };
  registerStake(caller: string, amount: bigint): { value: boolean } | { error: number };
  createProposal(caller: string, projectId: number, milestoneId: number | null, proposalType: number): { value: number } | { error: number };
  vote(caller: string, proposalId: number, vote: boolean): { value: boolean } | { error: number };
  finalizeProposal(caller: string, proposalId: number): { value: boolean } | { error: number };
  getProposal(proposalId: number): { value: Proposal } | { error: number };
  getVoterStake(voter: string): { value: bigint };
  getVote(proposalId: number, voter: string): { value: Vote } | { error: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  minStake: 1000n,
  votingPeriod: 1440,
  proposals: new Map(),
  votes: new Map(),
  voterStakes: new Map(),
  blockHeight: 1000,
  PROPOSAL_MILESTONE_APPROVAL: 0,
  PROPOSAL_PROJECT_CANCELLATION: 1,
  STATUS_PENDING: 0,
  STATUS_APPROVED: 1,
  STATUS_REJECTED: 2,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 400 };
    this.paused = pause;
    return { value: pause };
  },

  setMinStake(caller: string, newStake: bigint) {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (newStake <= 0n) return { error: 401 };
    this.minStake = newStake;
    return { value: true };
  },

  setVotingPeriod(caller: string, newPeriod: number) {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (newPeriod <= 0) return { error: 401 };
    this.votingPeriod = newPeriod;
    return { value: true };
  },

  registerStake(caller: string, amount: bigint) {
    if (this.paused) return { error: 403 };
    if (amount <= 0n) return { error: 401 };
    const currentStake = this.voterStakes.get(caller)?.stake || 0n;
    this.voterStakes.set(caller, { stake: currentStake + amount });
    return { value: true };
  },

  createProposal(caller: string, projectId: number, milestoneId: number | null, proposalType: number) {
    if (this.paused) return { error: 403 };
    if (proposalType !== this.PROPOSAL_MILESTONE_APPROVAL && proposalType !== this.PROPOSAL_PROJECT_CANCELLATION) return { error: 408 };
    const proposalId = (Number(this.proposals.get("0")?.projectId) || 0) + 1;
    this.proposals.set(proposalId.toString(), {
      projectId,
      milestoneId,
      proposalType,
      creator: caller,
      createdAt: this.blockHeight,
      deadline: this.blockHeight + this.votingPeriod,
      yesVotes: 0n,
      noVotes: 0n,
      status: this.STATUS_PENDING,
    });
    this.proposals.set("0", { ...this.proposals.get("0")!, projectId: proposalId });
    return { value: proposalId };
  },

  vote(caller: string, proposalId: number, vote: boolean) {
    if (this.paused) return { error: 403 };
    if (!this.proposals.has(proposalId.toString())) return { error: 405 };
    const proposal = this.proposals.get(proposalId.toString())!;
    if (proposal.status !== this.STATUS_PENDING || this.blockHeight >= proposal.deadline) return { error: 402 };
    const voteKey = `${proposalId}_${caller}`;
    if (this.votes.has(voteKey)) return { error: 407 };
    const stake = this.voterStakes.get(caller)?.stake || 0n;
    if (stake < this.minStake) return { error: 406 };
    this.votes.set(voteKey, { vote, stake });
    this.proposals.set(proposalId.toString(), {
      ...proposal,
      yesVotes: vote ? proposal.yesVotes + stake : proposal.yesVotes,
      noVotes: !vote ? proposal.noVotes + stake : proposal.noVotes,
    });
    return { value: true };
  },

  finalizeProposal(caller: string, proposalId: number) {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (!this.proposals.has(proposalId.toString())) return { error: 405 };
    const proposal = this.proposals.get(proposalId.toString())!;
    if (this.blockHeight < proposal.deadline) return { error: 402 };
    if (proposal.status !== this.STATUS_PENDING) return { error: 401 };
    this.proposals.set(proposalId.toString(), {
      ...proposal,
      status: proposal.yesVotes > proposal.noVotes ? this.STATUS_APPROVED : this.STATUS_REJECTED,
    });
    return { value: true };
  },

  getProposal(proposalId: number) {
    const proposal = this.proposals.get(proposalId.toString());
    return proposal ? { value: proposal } : { error: 405 };
  },

  getVoterStake(voter: string) {
    return { value: this.voterStakes.get(voter)?.stake || 0n };
  },

  getVote(proposalId: number, voter: string) {
    const vote = this.votes.get(`${proposalId}_${voter}`);
    return vote ? { value: vote } : { error: 401 };
  },
};

describe("Governance DAO Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.minStake = 1000n;
    mockContract.votingPeriod = 1440;
    mockContract.proposals = new Map();
    mockContract.votes = new Map();
    mockContract.voterStakes = new Map();
    mockContract.blockHeight = 1000;
  });

  it("should allow admin to pause contract", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 400 });
  });

  it("should allow admin to set minimum stake", () => {
    const result = mockContract.setMinStake(mockContract.admin, 2000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.minStake).toBe(2000n);
  });

  it("should prevent setting invalid minimum stake", () => {
    const result = mockContract.setMinStake(mockContract.admin, 0n);
    expect(result).toEqual({ error: 401 });
  });

  it("should allow admin to set voting period", () => {
    const result = mockContract.setVotingPeriod(mockContract.admin, 2880);
    expect(result).toEqual({ value: true });
    expect(mockContract.votingPeriod).toBe(2880);
  });

  it("should prevent setting invalid voting period", () => {
    const result = mockContract.setVotingPeriod(mockContract.admin, 0);
    expect(result).toEqual({ error: 401 });
  });

  it("should allow registering voter stake", () => {
    const result = mockContract.registerStake("ST2CY5...", 2000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.voterStakes.get("ST2CY5...")?.stake).toBe(2000n);
  });

  it("should prevent registering stake when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.registerStake("ST2CY5...", 2000n);
    expect(result).toEqual({ error: 403 });
  });

  it("should create a new proposal", () => {
    const result = mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    expect(result).toEqual({ value: 1 });
    expect(mockContract.proposals.get("1")).toEqual({
      projectId: 1,
      milestoneId: 1,
      proposalType: mockContract.PROPOSAL_MILESTONE_APPROVAL,
      creator: mockContract.admin,
      createdAt: 1000,
      deadline: 1000 + mockContract.votingPeriod,
      yesVotes: 0n,
      noVotes: 0n,
      status: mockContract.STATUS_PENDING,
    });
  });

  it("should prevent creating proposal with invalid type", () => {
    const result = mockContract.createProposal(mockContract.admin, 1, 1, 999);
    expect(result).toEqual({ error: 408 });
  });

  it("should allow voting on a proposal", () => {
    mockContract.registerStake("ST2CY5...", 2000n);
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    const result = mockContract.vote("ST2CY5...", 1, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.votes.get("1_ST2CY5...")).toEqual({ vote: true, stake: 2000n });
    expect(mockContract.proposals.get("1")?.yesVotes).toBe(2000n);
  });

  it("should prevent voting with insufficient stake", () => {
    mockContract.registerStake("ST2CY5...", 500n);
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    const result = mockContract.vote("ST2CY5...", 1, true);
    expect(result).toEqual({ error: 406 });
  });

  it("should prevent voting when voting is closed", () => {
    mockContract.registerStake("ST2CY5...", 2000n);
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    mockContract.blockHeight = 3000;
    const result = mockContract.vote("ST2CY5...", 1, true);
    expect(result).toEqual({ error: 402 });
  });

  it("should allow admin to finalize proposal", () => {
    mockContract.registerStake("ST2CY5...", 2000n);
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    mockContract.vote("ST2CY5...", 1, true);
    mockContract.blockHeight = 3000;
    const result = mockContract.finalizeProposal(mockContract.admin, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.proposals.get("1")?.status).toBe(mockContract.STATUS_APPROVED);
  });

  it("should prevent finalizing proposal before deadline", () => {
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    const result = mockContract.finalizeProposal(mockContract.admin, 1);
    expect(result).toEqual({ error: 402 });
  });

  it("should retrieve proposal details", () => {
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    const result = mockContract.getProposal(1);
    expect(result).toEqual({
      value: {
        projectId: 1,
        milestoneId: 1,
        proposalType: mockContract.PROPOSAL_MILESTONE_APPROVAL,
        creator: mockContract.admin,
        createdAt: 1000,
        deadline: 1000 + mockContract.votingPeriod,
        yesVotes: 0n,
        noVotes: 0n,
        status: mockContract.STATUS_PENDING,
      },
    });
  });

  it("should retrieve voter stake", () => {
    mockContract.registerStake("ST2CY5...", 2000n);
    const result = mockContract.getVoterStake("ST2CY5...");
    expect(result).toEqual({ value: 2000n });
  });

  it("should retrieve vote details", () => {
    mockContract.registerStake("ST2CY5...", 2000n);
    mockContract.createProposal(mockContract.admin, 1, 1, mockContract.PROPOSAL_MILESTONE_APPROVAL);
    mockContract.vote("ST2CY5...", 1, true);
    const result = mockContract.getVote(1, "ST2CY5...");
    expect(result).toEqual({ value: { vote: true, stake: 2000n } });
  });
});