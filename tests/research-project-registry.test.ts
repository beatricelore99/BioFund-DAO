import { describe, it, expect, beforeEach } from "vitest";

interface Project {
  name: string;
  description: string;
  creator: string;
  status: number;
  createdAt: number;
  tokenSupply: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  projectCounter: number;
  projects: Map<string, Project>;
  projectTokens: Map<string, { balance: bigint }>;
  projectTokenTotalSupply: Map<string, { totalSupply: bigint }>;
  MAX_TOKEN_SUPPLY: bigint;
  STATUS_PENDING: number;
  STATUS_ACTIVE: number;
  STATUS_CANCELLED: number;
  STATUS_COMPLETED: number;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerProject(caller: string, name: string, description: string, initialTokenSupply: bigint): { value: number } | { error: number };
  updateProjectStatus(caller: string, projectId: number, newStatus: number): { value: boolean } | { error: number };
  transferTokens(caller: string, projectId: number, recipient: string, amount: bigint): { value: boolean } | { error: number };
  mintTokens(caller: string, projectId: number, recipient: string, amount: bigint): { value: boolean } | { error: number };
  getProject(projectId: number): { value: Project } | { error: number };
  getTokenBalance(projectId: number, holder: string): { value: bigint };
  getProjectTokenSupply(projectId: number): { value: bigint };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  projectCounter: 0,
  projects: new Map(),
  projectTokens: new Map(),
  projectTokenTotalSupply: new Map(),
  MAX_TOKEN_SUPPLY: 1000000000000n,
  STATUS_PENDING: 0,
  STATUS_ACTIVE: 1,
  STATUS_CANCELLED: 2,
  STATUS_COMPLETED: 3,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  registerProject(caller: string, name: string, description: string, initialTokenSupply: bigint) {
    if (this.paused) return { error: 107 };
    if (name.length === 0 || name.length > 100) return { error: 104 };
    if (description.length === 0 || description.length > 500) return { error: 105 };
    if (initialTokenSupply <= 0n || initialTokenSupply > this.MAX_TOKEN_SUPPLY) return { error: 106 };
    const projectId = this.projectCounter + 1;
    if (this.projects.has(projectId.toString())) return { error: 102 };
    this.projects.set(projectId.toString(), {
      name,
      description,
      creator: caller,
      status: this.STATUS_PENDING,
      createdAt: 1000, // Mock block height
      tokenSupply: initialTokenSupply,
    });
    this.projectTokenTotalSupply.set(projectId.toString(), { totalSupply: initialTokenSupply });
    this.projectTokens.set(`${projectId}_${caller}`, { balance: initialTokenSupply });
    this.projectCounter = projectId;
    return { value: projectId };
  },

  updateProjectStatus(caller: string, projectId: number, newStatus: number) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (![0, 1, 2, 3].includes(newStatus)) return { error: 109 };
    if (!this.projects.has(projectId.toString())) return { error: 103 };
    const project = this.projects.get(projectId.toString())!;
    this.projects.set(projectId.toString(), { ...project, status: newStatus });
    return { value: true };
  },

  transferTokens(caller: string, projectId: number, recipient: string, amount: bigint) {
    if (this.paused) return { error: 107 };
    if (!this.projects.has(projectId.toString())) return { error: 103 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 108 };
    if (amount <= 0n) return { error: 106 };
    const senderKey = `${projectId}_${caller}`;
    const recipientKey = `${projectId}_${recipient}`;
    const senderBalance = (this.projectTokens.get(senderKey)?.balance || 0n);
    if (senderBalance < amount) return { error: 106 };
    this.projectTokens.set(senderKey, { balance: senderBalance - amount });
    this.projectTokens.set(recipientKey, { balance: (this.projectTokens.get(recipientKey)?.balance || 0n) + amount });
    return { value: true };
  },

  mintTokens(caller: string, projectId: number, recipient: string, amount: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.projects.has(projectId.toString())) return { error: 103 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 108 };
    if (amount <= 0n) return { error: 106 };
    const currentSupply = this.projectTokenTotalSupply.get(projectId.toString())?.totalSupply || 0n;
    if (currentSupply + amount > this.MAX_TOKEN_SUPPLY) return { error: 106 };
    this.projectTokenTotalSupply.set(projectId.toString(), { totalSupply: currentSupply + amount });
    const recipientKey = `${projectId}_${recipient}`;
    this.projectTokens.set(recipientKey, { balance: (this.projectTokens.get(recipientKey)?.balance || 0n) + amount });
    return { value: true };
  },

  getProject(projectId: number) {
    const project = this.projects.get(projectId.toString());
    return project ? { value: project } : { error: 103 };
  },

  getTokenBalance(projectId: number, holder: string) {
    return { value: this.projectTokens.get(`${projectId}_${holder}`)?.balance || 0n };
  },

  getProjectTokenSupply(projectId: number) {
    return { value: this.projectTokenTotalSupply.get(projectId.toString())?.totalSupply || 0n };
  },
};

describe("Research Project Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.projectCounter = 0;
    mockContract.projects = new Map();
    mockContract.projectTokens = new Map();
    mockContract.projectTokenTotalSupply = new Map();
  });

  it("should allow admin to pause contract", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 100 });
  });

  it("should register a new project", () => {
    const result = mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    expect(result).toEqual({ value: 1 });
    expect(mockContract.projects.get("1")).toEqual({
      name: "Test Project",
      description: "Description",
      creator: mockContract.admin,
      status: mockContract.STATUS_PENDING,
      createdAt: 1000,
      tokenSupply: 1000n,
    });
    expect(mockContract.projectTokens.get(`1_${mockContract.admin}`)).toEqual({ balance: 1000n });
  });

  it("should prevent registering project with invalid name", () => {
    const result = mockContract.registerProject(mockContract.admin, "", "Description", 1000n);
    expect(result).toEqual({ error: 104 });
  });

  it("should prevent registering project when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    expect(result).toEqual({ error: 107 });
  });

  it("should allow admin to update project status", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.updateProjectStatus(mockContract.admin, 1, mockContract.STATUS_ACTIVE);
    expect(result).toEqual({ value: true });
    expect(mockContract.projects.get("1")?.status).toBe(mockContract.STATUS_ACTIVE);
  });

  it("should prevent invalid status updates", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.updateProjectStatus(mockContract.admin, 1, 999);
    expect(result).toEqual({ error: 109 });
  });

  it("should allow token transfers", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.transferTokens(mockContract.admin, 1, "ST2CY5...", 500n);
    expect(result).toEqual({ value: true });
    expect(mockContract.projectTokens.get(`1_${mockContract.admin}`)?.balance).toBe(500n);
    expect(mockContract.projectTokens.get(`1_ST2CY5...`)?.balance).toBe(500n);
  });

  it("should prevent token transfers with insufficient balance", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.transferTokens(mockContract.admin, 1, "ST2CY5...", 2000n);
    expect(result).toEqual({ error: 106 });
  });

  it("should allow admin to mint additional tokens", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.mintTokens(mockContract.admin, 1, "ST2CY5...", 500n);
    expect(result).toEqual({ value: true });
    expect(mockContract.projectTokenTotalSupply.get("1")?.totalSupply).toBe(1500n);
    expect(mockContract.projectTokens.get(`1_ST2CY5...`)?.balance).toBe(500n);
  });

  it("should prevent minting over max supply", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.mintTokens(mockContract.admin, 1, "ST2CY5...", 1000000000001n);
    expect(result).toEqual({ error: 106 });
  });

  it("should retrieve project details", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.getProject(1);
    expect(result).toEqual({
      value: {
        name: "Test Project",
        description: "Description",
        creator: mockContract.admin,
        status: mockContract.STATUS_PENDING,
        createdAt: 1000,
        tokenSupply: 1000n,
      },
    });
  });

  it("should retrieve token balance", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.getTokenBalance(1, mockContract.admin);
    expect(result).toEqual({ value: 1000n });
  });

  it("should retrieve project token supply", () => {
    mockContract.registerProject(mockContract.admin, "Test Project", "Description", 1000n);
    const result = mockContract.getProjectTokenSupply(1);
    expect(result).toEqual({ value: 1000n });
  });
});