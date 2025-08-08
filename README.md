# BioFund DAO

A blockchain-powered biotech research funding platform that enables scientists, patients, and supporters to collaboratively fund and oversee groundbreaking medical innovation — all on-chain.

---

## Overview

BioFund DAO consists of five main smart contracts that together form a transparent, milestone-based funding ecosystem for biotech and medical research:

1. **Research Project Registry Contract** – Registers research projects and issues project-specific tokens.  
2. **Crowdfunding Contract** – Facilitates fundraising in stablecoins for specific projects.  
3. **Milestone Escrow Contract** – Holds and releases funds only when research milestones are verified.  
4. **Royalty & Revenue Sharing Contract** – Distributes licensing or IP revenues to project token holders.  
5. **Governance DAO Contract** – Enables backers to vote on milestones, funding decisions, and project updates.  

---

## Features

- **Tokenized research ownership** with ERC-20/1155 style project tokens  
- **Milestone-based fund release** for accountability  
- **Transparent crowdfunding** using stablecoins  
- **On-chain governance** for funding and research oversight  
- **Automatic revenue sharing** from monetized IP or licensing  
- **Immutable project data storage** via IPFS/Arweave integration  
- **Global participation** for anyone to support critical biotech work  

---

## Smart Contracts

### Research Project Registry Contract
- Register new biotech research projects  
- Deploy project-specific fungible or semi-fungible tokens  
- Store and link metadata to decentralized storage (IPFS/Arweave)  

### Crowdfunding Contract
- Accept stablecoin contributions for specific projects  
- Enforce funding goals and deadlines  
- Refund contributors if targets are not met  

### Milestone Escrow Contract
- Hold raised funds securely until milestone verification  
- Enable multi-sig or DAO-based release approvals  
- Emit transparent payment events for auditability  

### Royalty & Revenue Sharing Contract
- Track licensing or IP-derived revenue streams  
- Distribute income proportionally to token holders  
- Automate payout schedules in stablecoins  

### Governance DAO Contract
- Token-weighted voting on milestone releases and project changes  
- Proposal submission and execution  
- Quorum, voting period, and proposal threshold management  

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)  
2. Clone this repository:  
   ```bash
   git clone https://github.com/yourusername/biofund-dao.git
   ```
3. Run tests:
    ```bash
    npm test
    ```
4. Deploy contracts:
    ```bash
    clarinet deploy
    ```

## Usage

Each smart contract operates independently but integrates with the others to form a complete decentralized funding ecosystem.
Refer to individual contract documentation for available functions, parameters, and usage examples.

## License

MIT License