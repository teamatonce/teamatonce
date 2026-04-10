<p align="center">
  <a href="https://teamatonce.com">
    <img src="frontend/public/assets/logo.png" alt="Team@Once" width="80">
  </a>
  <h1 align="center">Team@Once</h1>
  <p align="center">
    <strong>Open-source AI-driven development outsourcing platform</strong>
  </p>
  <p align="center">
    Revolutionizing software development outsourcing through intelligent automation, transparent processes, and seamless collaboration.
  </p>
</p>

<p align="center">
  <a href="https://github.com/teamatonce/teamatonce/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
  <a href="https://github.com/teamatonce/teamatonce/stargazers"><img src="https://img.shields.io/github/stars/teamatonce/teamatonce?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/teamatonce/teamatonce/issues"><img src="https://img.shields.io/github/issues/teamatonce/teamatonce" alt="Issues"></a>
</p>

<p align="center">
  <a href="https://teamatonce.com">Website</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#features">Features</a> |
  <a href="https://github.com/teamatonce/teamatonce/discussions">Discussions</a> |
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_JA.md">日本語</a> |
  <a href="./README_ZH.md">中文</a> |
  <a href="./README_KO.md">한국어</a> |
  <a href="./README_ES.md">Español</a> |
  <a href="./README_FR.md">Français</a> |
  <a href="./README_DE.md">Deutsch</a> |
  <a href="./README_PT-BR.md">Português</a> |
  <a href="./README_AR.md">العربية</a> |
  <a href="./README_HI.md">हिन्दी</a> |
  <a href="./README_RU.md">Русский</a>
</p>

---

## What is Team@Once?

Team@Once is an open-source AI-driven development outsourcing marketplace that eliminates traditional risks through intelligent automation, AI-powered assessments, escrow payments, and real-time project management.

## Why Team@Once? (Comparison)

| Feature | Team@Once | Upwork | Toptal | Fiverr | Deel |
|---------|-----------|--------|--------|--------|------|
| **AI-Powered Matching** | ✅ NLP + smart matching | ❌ | ⚠️ Manual vetting | ❌ | ❌ |
| **Built-in Project Mgmt** | ✅ Kanban, milestones, time tracking | ⚠️ Basic | ❌ | ❌ | ❌ |
| **Escrow Payments** | ✅ Milestone-based | ✅ | ✅ | ✅ | ❌ |
| **Video Collaboration** | ✅ Built-in calls + screen share | ❌ | ❌ | ❌ | ❌ |
| **Skill Assessments** | ✅ AI-generated + certificates | ⚠️ Basic tests | ✅ Rigorous | ⚠️ Basic | ❌ |
| **Learning Paths** | ✅ Courses + certifications | ❌ | ❌ | ❌ | ❌ |
| **Real-Time Chat** | ✅ Channels + file sharing | ⚠️ Basic | ❌ | ⚠️ Basic | ❌ |
| **Team Workspaces** | ✅ Multi-project org | ❌ | ❌ | ❌ | ❌ |
| **Data Engine** | ✅ Company discovery crawler | ❌ | ❌ | ❌ | ❌ |
| **Smart Contracts** | ✅ Auto-generated + e-sign | ⚠️ Basic | ❌ | ⚠️ Basic | ✅ |
| **API Access** | ✅ Full REST API | ⚠️ Partial | ❌ | ❌ | ✅ |
| **Self-Hosted** | ✅ Docker Compose | ❌ | ❌ | ❌ | ❌ |
| **Open Source** | ✅ Apache 2.0 | ❌ | ❌ | ❌ | ❌ |
| **Platform Fee** | 🟢 3-5% | 💰 10-20% | 💰 ~2x markup | 💰 20% | 💰 Custom |
| **i18n** | ✅ 11 languages | ✅ | ✅ | ✅ | ✅ |

## Features

### Marketplace
- **Company Profiles** -- Showcase portfolios, team skills, and certifications
- **AI-Powered Matching** -- Intelligent company-to-project matching based on skills and track record
- **Data Engine** -- Web crawling and pipeline for company discovery and enrichment
- **Escrow Payments** -- Secure milestone-based payments via Stripe

### Learning & Certification
- **Course Management** -- Create and manage technical courses with modules and lessons
- **AI Assessments** -- AI-generated quizzes and skill evaluations
- **Certificates** -- Verifiable achievement certificates
- **Learning Paths** -- Structured skill development routes
- **Achievements** -- Gamification with badges and progress tracking

### Collaboration
- **Project Management** -- Track projects with milestones and deliverables
- **Discussion Forums** -- Community discussions and knowledge sharing
- **Real-time Notifications** -- WebSocket-powered live updates
- **Blog** -- Content management for articles and guides
- **Study Groups** -- Collaborative learning spaces

### Platform
- **AI Integration** -- OpenAI-powered content generation and analysis
- **Search** -- Qdrant vector search for semantic content discovery
- **Multi-language** -- i18n support
- **Admin Dashboard** -- Platform administration and analytics
- **SEO** -- Server-side rendering and metadata optimization

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | NestJS 11, TypeScript, PostgreSQL (raw SQL), Redis, Qdrant, Socket.io |
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand |
| **AI** | OpenAI (GPT-4o-mini, embeddings) |
| **Payments** | Stripe (escrow, subscriptions) |
| **Search** | Qdrant (vector search) |

## Prerequisites

- **Node.js** >= 18
- **Docker** (recommended) or PostgreSQL 15+, Redis, and Qdrant installed locally

## Quick Start

### 1. Start services

The easiest way to run PostgreSQL, Redis, and Qdrant is with Docker:

```bash
git clone https://github.com/teamatonce/teamatonce.git
cd teamatonce
docker compose up -d
```

This starts all required services with credentials that match `.env.example` out of the box.

<details>
<summary>Without Docker (manual setup)</summary>

Install and start PostgreSQL, Redis, and Qdrant yourself, then update `backend/.env` with your connection details:

```bash
# PostgreSQL — create the dev database
createdb -U postgres teamatonce_dev

# Update DATABASE_PASSWORD in backend/.env to match your PostgreSQL password
```

</details>

### 2. Backend

```bash
cd backend
cp .env.example .env    # credentials already match docker-compose.yml
npm install
npm run migrate
npm run start:dev
```

### 3. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
teamatonce/
├── backend/              # NestJS API (34 modules)
│   ├── src/modules/      # auth, company, courses, assessments, ai, search,
│   │                     # escrow, certificates, learning-paths, blog, ...
│   └── migrations/       # PostgreSQL migrations
├── frontend/             # React + Vite + Tailwind
│   └── src/
└── .github/workflows/    # CI/CD
```

## Contributors

Thank you to all the amazing people who have contributed to Team@Once! 🎉

<a href="https://github.com/teamatonce/teamatonce/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=teamatonce/teamatonce&anon=1&max=100&columns=10" />
</a>

Want to see your face here? Check out our [Contributing Guide](CONTRIBUTING.md) and start contributing today!

## Project Activity

<p align="center">
  <img src="https://img.shields.io/github/stars/teamatonce/teamatonce?style=for-the-badge&logo=github&color=yellow" alt="Stars">
  <img src="https://img.shields.io/github/forks/teamatonce/teamatonce?style=for-the-badge&logo=github&color=blue" alt="Forks">
  <img src="https://img.shields.io/github/contributors/teamatonce/teamatonce?style=for-the-badge&logo=github&color=green" alt="Contributors">
  <img src="https://img.shields.io/github/last-commit/teamatonce/teamatonce?style=for-the-badge&logo=github&color=orange" alt="Last Commit">
</p>

## Security

Please report security vulnerabilities responsibly. See [SECURITY.md](SECURITY.md).

## License

This project is licensed under the [Apache License 2.0](LICENSE).

Copyright 2025 Team@Once Contributors.
