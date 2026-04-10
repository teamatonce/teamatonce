# Contributing to Team@Once

Thank you for your interest in contributing! See our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

- [Bug Reports](https://github.com/teamatonce/teamatonce/issues/new?template=bug_report.yml)
- [Feature Requests](https://github.com/teamatonce/teamatonce/issues/new?template=feature_request.yml)

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and run linting
4. Push and open a Pull Request

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/teamatonce.git
cd teamatonce/backend
cp .env.example .env
npm install
npm run migrate
npm run start:dev

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Code Style

- TypeScript for backend and frontend
- Prettier for formatting
- ESLint for linting
