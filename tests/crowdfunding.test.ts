import { describe, it, expect, beforeEach } from "vitest";

interface Project {
  fundingGoal: bigint;
  totalFunded: bigint;
  deadline: number;
  creator: string;
  funded: boolean;
}

interface MockContract {
  admin: string;
  paused: boolean;
  projects: Map<string, Project>;
  contributions: Map<string, { amount: bigint }>;
  blockHeight: number;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  createProject(caller: string, projectId: number, fundingGoal: bigint, deadline: number): { value: boolean } | { error: number };
  contribute(caller: string, projectId: number, amount: bigint): { value: boolean } | { error: number };
  releaseFunds(caller: string, projectId: number): { value: boolean } | { error: number };
  refund(caller: string, projectId: number): { value: boolean } | { error: number };
  getProject(projectId: number): { value: Project } | { error: number };
  getContribution(projectId: number, contributor: string): { value: bigint };
  isFundingOpen(projectId: number): boolean;
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  projects: new Map(),
  contributions: new Map(),
  blockHeight: 1000,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  },

  createProject(caller: string, projectId: number, fundingGoal: bigint, deadline: number) {
    if (this.paused) return { error: 203 };
    if (fundingGoal <= 0n) return { error: 202 };
    if (deadline <= this.blockHeight) return { error: 208 };
    if (this.projects.has(projectId.toString())) return { error: 201 };
    this.projects.set(projectId.toString(), {
      fundingGoal,
      totalFunded: 0n,
      deadline,
      creator: caller,
      funded: false,
    });
    return { value: true };
  },

  contribute(caller: string, projectId: number, amount: bigint) {
    if (this.paused) return { error: 203 };
    if (!this.projects.has(projectId.toString())) return { error: 201 };
    const project = this.projects.get(projectId.toString())!;
    if (project.funded || this.blockHeight >= project.deadline) return { error: 205 };
    if (amount <= 0n) return { error: 202 };
    const newTotal = project.totalFunded + amount;
    const contributionKey = `${projectId}_${caller}`;
    this.contributions.set(contributionKey, { amount: (this.contributions.get(contributionKey)?.amount || 0n) + amount });
    this.projects.set(projectId.toString(), { ...project, totalFunded: newTotal });
    if (newTotal >= project.fundingGoal) {
      this.projects.set(projectId.toString(), { ...project, totalFunded: newTotal, funded: true });
    }
    return { value: true };
  },

  releaseFunds(caller: string, projectId: number) {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (!this.projects.has(projectId.toString())) return { error: 201 };
    const project = this.projects.get(projectId.toString())!;
    if (!project.funded || project.totalFunded < project.fundingGoal) return { error: 207 };
    return { value: true };
  },

  refund(caller: string, projectId: number) {
    if (this.paused) return { error: 203 };
    if (!this.projects.has(projectId.toString())) return { error: 201 };
    const project = this.projects.get(projectId.toString())!;
    if (this.blockHeight <= project.deadline) return { error: 205 };
    if (project.funded) return { error: 209 };
    if (project.totalFunded >= project.fundingGoal) return { error: 206 };
    const contributionKey = `${projectId}_${caller}`;
    const contributorAmount = this.contributions.get(contributionKey)?.amount || 0n;
    if (contributorAmount <= 0n) return { error: 202 };
    this.contributions.delete(contributionKey);
    return { value: true };
  },

  getProject(projectId: number) {
    const project = this.projects.get(projectId.toString());
    return project ? { value: project } : { error: 201 };
  },

  getContribution(projectId: number, contributor: string) {
    return { value: this.contributions.get(`${projectId}_${contributor}`)?.amount || 0n };
  },

  isFundingOpen(projectId: number) {
    const project = this.projects.get(projectId.toString());
    return project ? !project.funded && this.blockHeight < project.deadline : false;
  },
};

describe("Crowdfunding Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.projects = new Map();
    mockContract.contributions = new Map();
    mockContract.blockHeight = 1000;
  });

  it("should allow admin to pause contract", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 200 });
  });

  it("should create a new project", () => {
    const result = mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    expect(result).toEqual({ value: true });
    expect(mockContract.projects.get("1")).toEqual({
      fundingGoal: 1000n,
      totalFunded: 0n,
      deadline: 2000,
      creator: mockContract.admin,
      funded: false,
    });
  });

  it("should prevent creating project with invalid deadline", () => {
    const result = mockContract.createProject(mockContract.admin, 1, 1000n, 500);
    expect(result).toEqual({ error: 208 });
  });

  it("should allow contributions to a project", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    const result = mockContract.contribute("ST2CY5...", 1, 500n);
    expect(result).toEqual({ value: true });
    expect(mockContract.contributions.get("1_ST2CY5...")?.amount).toBe(500n);
    expect(mockContract.projects.get("1")?.totalFunded).toBe(500n);
  });

  it("should mark project as funded when goal is met", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    const result = mockContract.contribute("ST2CY5...", 1, 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.projects.get("1")?.funded).toBe(true);
  });

  it("should prevent contributions when paused", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.contribute("ST2CY5...", 1, 500n);
    expect(result).toEqual({ error: 203 });
  });

  it("should allow admin to release funds", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.contribute("ST2CY5...", 1, 1000n);
    const result = mockContract.releaseFunds(mockContract.admin, 1);
    expect(result).toEqual({ value: true });
  });

  it("should prevent releasing funds if goal not met", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.contribute("ST2CY5...", 1, 500n);
    const result = mockContract.releaseFunds(mockContract.admin, 1);
    expect(result).toEqual({ error: 207 });
  });

  it("should allow refunds after deadline if goal not met", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.contribute("ST2CY5...", 1, 500n);
    mockContract.blockHeight = 3000;
    const result = mockContract.refund("ST2CY5...", 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.contributions.get("1_ST2CY5...")).toBeUndefined();
  });

  it("should prevent refunds if goal met", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.contribute("ST2CY5...", 1, 1000n);
    mockContract.blockHeight = 3000;
    const result = mockContract.refund("ST2CY5...", 1);
    expect(result).toEqual({ error: 209 });
  });

  it("should retrieve project details", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    const result = mockContract.getProject(1);
    expect(result).toEqual({
      value: {
        fundingGoal: 1000n,
        totalFunded: 0n,
        deadline: 2000,
        creator: mockContract.admin,
        funded: false,
      },
    });
  });

  it("should retrieve contribution amount", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    mockContract.contribute("ST2CY5...", 1, 500n);
    const result = mockContract.getContribution(1, "ST2CY5...");
    expect(result).toEqual({ value: 500n });
  });

  it("should check if funding is open", () => {
    mockContract.createProject(mockContract.admin, 1, 1000n, 2000);
    const result = mockContract.isFundingOpen(1);
    expect(result).toBe(true);
    mockContract.blockHeight = 3000;
    expect(mockContract.isFundingOpen(1)).toBe(false);
  });
});