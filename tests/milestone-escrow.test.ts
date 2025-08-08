import { describe, it, expect, beforeEach } from "vitest";

interface Project {
  creator: string;
  totalEscrowed: bigint;
}

interface Milestone {
  amount: bigint;
  description: string;
  status: number;
  submittedAt: number;
  approver: string | null;
}

interface MockContract {
  admin: string;
  paused: boolean;
  projects: Map<string, Project>;
  milestones: Map<string, Milestone>;
  escrowBalances: Map<string, { amount: bigint }>;
  blockHeight: number;
  STATUS_PENDING: number;
  STATUS_APPROVED: number;
  STATUS_REJECTED: number;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  createProject(caller: string, projectId: number): { value: boolean } | { error: number };
  addMilestone(caller: string, projectId: number, milestoneId: number, amount: bigint, description: string): { value: boolean } | { error: number };
  fundMilestone(caller: string, projectId: number, milestoneId: number, amount: bigint): { value: boolean } | { error: number };
  approveMilestone(caller: string, projectId: number, milestoneId: number): { value: boolean } | { error: number };
  rejectMilestone(caller: string, projectId: number, milestoneId: number): { value: boolean } | { error: number };
  refundMilestone(caller: string, projectId: number, milestoneId: number): { value: boolean } | { error: number };
  getProject(projectId: number): { value: Project } | { error: number };
  getMilestone(projectId: number, milestoneId: number): { value: Milestone } | { error: number };
  getEscrowBalance(projectId: number, milestoneId: number): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  projects: new Map(),
  milestones: new Map(),
  escrowBalances: new Map(),
  blockHeight: 1000,
  STATUS_PENDING: 0,
  STATUS_APPROVED: 1,
  STATUS_REJECTED: 2,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 300 };
    this.paused = pause;
    return { value: pause };
  },

  createProject(caller: string, projectId: number) {
    if (this.paused) return { error: 304 };
    if (this.projects.has(projectId.toString())) return { error: 301 };
    this.projects.set(projectId.toString(), { creator: caller, totalEscrowed: 0n });
    return { value: true };
  },

  addMilestone(caller: string, projectId: number, milestoneId: number, amount: bigint, description: string) {
    if (this.paused) return { error: 304 };
    if (!this.projects.has(projectId.toString())) return { error: 301 };
    const milestoneKey = `${projectId}_${milestoneId}`;
    if (this.milestones.has(milestoneKey)) return { error: 302 };
    if (amount <= 0n || description.length === 0 || description.length > 500) return { error: 303 };
    this.milestones.set(milestoneKey, {
      amount,
      description,
      status: this.STATUS_PENDING,
      submittedAt: this.blockHeight,
      approver: null,
    });
    return { value: true };
  },

  fundMilestone(caller: string, projectId: number, milestoneId: number, amount: bigint) {
    if (this.paused) return { error: 304 };
    if (!this.projects.has(projectId.toString())) return { error: 301 };
    const milestoneKey = `${projectId}_${milestoneId}`;
    if (!this.milestones.has(milestoneKey)) return { error: 302 };
    const milestone = this.milestones.get(milestoneKey)!;
    if (milestone.status !== this.STATUS_PENDING) return { error: 306 };
    const escrowKey = `${projectId}_${milestoneId}`;
    const currentEscrow = this.escrowBalances.get(escrowKey)?.amount || 0n;
    this.escrowBalances.set(escrowKey, { amount: currentEscrow + amount });
    const project = this.projects.get(projectId.toString())!;
    this.projects.set(projectId.toString(), { ...project, totalEscrowed: project.totalEscrowed + amount });
    return { value: true };
  },

  approveMilestone(caller: string, projectId: number, milestoneId: number) {
    if (!this.isAdmin(caller)) return { error: 300 };
    if (!this.projects.has(projectId.toString())) return { error: 301 };
    const milestoneKey = `${projectId}_${milestoneId}`;
    if (!this.milestones.has(milestoneKey)) return { error: 302 };
    const milestone = this.milestones.get(milestoneKey)!;
    if (milestone.status !== this.STATUS_PENDING) return { error: 306 };
    const escrowKey = `${projectId}_${milestoneId}`;
    const escrowAmount = this.escrowBalances.get(escrowKey)?.amount || 0n;
    if (escrowAmount < milestone.amount) return { error: 307 };
    this.milestones.set(milestoneKey, { ...milestone, status: this.STATUS_APPROVED, approver: caller });
    const project = this.projects.get(projectId.toString())!;
    this.projects.set(projectId.toString(), { ...project, totalEscrowed: project.totalEscrowed - milestone.amount });
    this.escrowBalances.delete(escrowKey);
    return { value: true };
  },

  rejectMilestone(caller: string, projectId: number, milestoneId: number) {
    if (!this.isAdmin(caller)) return { error: 300 };
    if (!this.projects.has(projectId.toString())) return { error: 301 };
    const milestoneKey = `${projectId}_${milestoneId}`;
    if (!this.milestones.has(milestoneKey)) return { error: 302 };
    const milestone = this.milestones.get(milestoneKey)!;
    if (milestone.status !== this.STATUS_PENDING) return { error: 306 };
    this.milestones.set(milestoneKey, { ...milestone, status: this.STATUS_REJECTED, approver: caller });
    const escrowKey = `${projectId}_${milestoneId}`;
    const project = this.projects.get(projectId.toString())!;
    this.projects.set(projectId.toString(), { ...project, totalEscrowed: project.totalEscrowed });
    return { value: true };
  },

  refundMilestone(caller: string, projectId: number, milestoneId: number) {
    if (this.paused) return { error: 304 };
    if (!this.projects.has(projectId.toString())) return { error: 301 };
    const milestoneKey = `${projectId}_${milestoneId}`;
    if (!this.milestones.has(milestoneKey)) return { error: 302 };
    const milestone = this.milestones.get(milestoneKey)!;
    if (milestone.status !== this.STATUS_REJECTED) return { error: 306 };
    const escrowKey = `${projectId}_${milestoneId}`;
    const escrowAmount = this.escrowBalances.get(escrowKey)?.amount || 0n;
    if (escrowAmount <= 0n) return { error: 307 };
    this.projects.set(projectId.toString(), {
      ...this.projects.get(projectId.toString())!,
      totalEscrowed: this.projects.get(projectId.toString())!.totalEscrowed - escrowAmount,
    });
    this.escrowBalances.delete(escrowKey);
    return { value: true };
  },

  getProject(projectId: number) {
    const project = this.projects.get(projectId.toString());
    return project ? { value: project } : { error: 301 };
  },

  getMilestone(projectId: number, milestoneId: number) {
    const milestone = this.milestones.get(`${projectId}_${milestoneId}`);
    return milestone ? { value: milestone } : { error: 302 };
  },

  getEscrowBalance(projectId: number, milestoneId: number) {
    return { value: this.escrowBalances.get(`${projectId}_${milestoneId}`)?.amount || 0n };
  },
};

describe("Milestone Escrow Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.projects = new Map();
    mockContract.milestones = new Map();
    mockContract.escrowBalances = new Map();
    mockContract.blockHeight = 1000;
  });

  it("should allow admin to pause contract", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 300 });
  });

  it("should create a new project", () => {
    const result = mockContract.createProject(mockContract.admin, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.projects.get("1")).toEqual({ creator: mockContract.admin, totalEscrowed: 0n });
  });

  it("should add a milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    const result = mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    expect(result).toEqual({ value: true });
    expect(mockContract.milestones.get("1_1")).toEqual({
      amount: 1000n,
      description: "Milestone 1",
      status: mockContract.STATUS_PENDING,
      submittedAt: 1000,
      approver: null,
    });
  });

  it("should prevent adding milestone with invalid description", () => {
    mockContract.createProject(mockContract.admin, 1);
    const result = mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "");
    expect(result).toEqual({ error: 303 });
  });

  it("should fund a milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    const result = mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.escrowBalances.get("1_1")?.amount).toBe(1000n);
    expect(mockContract.projects.get("1")?.totalEscrowed).toBe(1000n);
  });

  it("should prevent funding non-pending milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    mockContract.approveMilestone(mockContract.admin, 1, 1);
    const result = mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    expect(result).toEqual({ error: 306 });
  });

  it("should allow admin to approve milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    const result = mockContract.approveMilestone(mockContract.admin, 1, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.milestones.get("1_1")?.status).toBe(mockContract.STATUS_APPROVED);
    expect(mockContract.escrowBalances.get("1_1")).toBeUndefined();
    expect(mockContract.projects.get("1")?.totalEscrowed).toBe(0n);
  });

  it("should prevent approving milestone with insufficient funds", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    const result = mockContract.approveMilestone(mockContract.admin, 1, 1);
    expect(result).toEqual({ error: 307 });
  });

  it("should allow admin to reject milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    const result = mockContract.rejectMilestone(mockContract.admin, 1, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.milestones.get("1_1")?.status).toBe(mockContract.STATUS_REJECTED);
    expect(mockContract.escrowBalances.get("1_1")).toEqual({ amount: 1000n });
    expect(mockContract.projects.get("1")?.totalEscrowed).toBe(1000n);
  });

  it("should allow refund for rejected milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    mockContract.rejectMilestone(mockContract.admin, 1, 1);
    const result = mockContract.refundMilestone("ST2CY5...", 1, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.escrowBalances.get("1_1")).toBeUndefined();
    expect(mockContract.projects.get("1")?.totalEscrowed).toBe(0n);
  });

  it("should prevent refund for non-rejected milestone", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    const result = mockContract.refundMilestone("ST2CY5...", 1, 1);
    expect(result).toEqual({ error: 306 });
  });

  it("should retrieve project details", () => {
    mockContract.createProject(mockContract.admin, 1);
    const result = mockContract.getProject(1);
    expect(result).toEqual({ value: { creator: mockContract.admin, totalEscrowed: 0n } });
  });

  it("should retrieve milestone details", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    const result = mockContract.getMilestone(1, 1);
    expect(result).toEqual({
      value: {
        amount: 1000n,
        description: "Milestone 1",
        status: mockContract.STATUS_PENDING,
        submittedAt: 1000,
        approver: null,
      },
    });
  });

  it("should retrieve escrow balance", () => {
    mockContract.createProject(mockContract.admin, 1);
    mockContract.addMilestone(mockContract.admin, 1, 1, 1000n, "Milestone 1");
    mockContract.fundMilestone("ST2CY5...", 1, 1, 1000n);
    const result = mockContract.getEscrowBalance(1, 1);
    expect(result).toEqual({ value: 1000n });
  });
});