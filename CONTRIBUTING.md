# Contributing to Team@Once

Thank you for your interest in contributing to Team@Once! This guide will help you get started. Please also review our [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)
- [Community](#community)

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/teamatonce.git
   cd teamatonce
   ```
3. **Add the upstream** remote:
   ```bash
   git remote add upstream https://github.com/teamatonce/teamatonce.git
   ```

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **Docker** (recommended) or PostgreSQL 15+, Redis, and Qdrant installed locally

### 1. Start services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, and Qdrant with credentials matching `.env.example`.

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

The backend runs at `http://localhost:3001`.

### 3. Frontend (new terminal)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Project Architecture

```
teamatonce/
├── backend/                # NestJS API
│   ├── src/
│   │   ├── modules/        # Feature modules (auth, company, courses, escrow, etc.)
│   │   ├── database/       # DatabaseService and schema definitions
│   │   └── websocket/      # WebSocket gateway
│   └── migrations/         # PostgreSQL SQL migrations
├── frontend/               # React + Vite + Tailwind
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── pages/          # Route-level page components
│       ├── services/       # API service layers
│       ├── lib/            # API client, utilities
│       └── config/         # App configuration
└── docker-compose.yml      # Dev services (PostgreSQL, Redis, Qdrant)
```

### Key conventions

- **Backend modules** follow NestJS structure: `module.ts`, `controller.ts`, `service.ts`, `dto/`
- **Database operations** use `DatabaseService` methods (`db.query()`, etc.) — not an ORM
- **Frontend API calls** go through service files in `frontend/src/services/`
- **Styling** uses Tailwind CSS utility classes with Radix UI primitives

## Making Changes

### Branch naming

Create a branch from `main` using one of these prefixes:

- `feature/` — new functionality (e.g., `feature/team-invitations`)
- `fix/` — bug fixes (e.g., `fix/login-redirect`)
- `docs/` — documentation changes (e.g., `docs/api-examples`)
- `refactor/` — code restructuring (e.g., `refactor/auth-middleware`)
- `chore/` — tooling, CI, dependencies (e.g., `chore/update-deps`)

```bash
git checkout -b feature/your-feature
```

### Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): short description

Optional longer explanation of what and why.
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `style`, `perf`

**Examples:**
```
feat(escrow): add milestone release confirmation
fix(auth): handle expired refresh tokens
docs(readme): add Docker setup instructions
```

### Testing your changes

```bash
# Backend linting
cd backend
npm run lint

# Frontend linting
cd frontend
npm run lint
```

Make sure your changes don't break existing functionality by running the backend and testing affected features manually.

## Pull Request Process

1. **Sync with upstream** before opening a PR:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push** your branch:
   ```bash
   git push origin feature/your-feature
   ```

3. **Open a Pull Request** on GitHub against `main` with:
   - A clear title following commit message conventions
   - A description of **what** changed and **why**
   - Screenshots or recordings for UI changes
   - Reference any related issues (e.g., `Closes #42`)

4. **Review process:**
   - At least one maintainer review is required
   - Address review feedback with new commits (don't force-push during review)
   - Once approved, a maintainer will merge your PR

### PR checklist

- [ ] Code follows the project's style guidelines
- [ ] Self-reviewed the changes
- [ ] No unrelated changes included
- [ ] Linting passes (`npm run lint`)
- [ ] Tested affected features locally

## Code Style

- **Language:** TypeScript for both backend and frontend
- **Formatting:** Prettier (runs on save if configured in your editor)
- **Linting:** ESLint
- **CSS:** Tailwind CSS utility classes — avoid custom CSS unless necessary
- **Imports:** Use absolute paths where configured; group by external, internal, relative

## Reporting Issues

- [Bug Reports](https://github.com/teamatonce/teamatonce/issues/new?template=bug_report.yml)
- [Feature Requests](https://github.com/teamatonce/teamatonce/issues/new?template=feature_request.yml)

When reporting a bug, include:
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node.js version, browser)
- Error messages or screenshots

## Community

- [GitHub Discussions](https://github.com/teamatonce/teamatonce/discussions) — questions, ideas, general chat
- [Issues](https://github.com/teamatonce/teamatonce/issues) — bugs and feature requests

## License

By contributing to Team@Once, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0](LICENSE).
