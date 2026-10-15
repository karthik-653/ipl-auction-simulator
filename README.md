# IPL Auction Simulator

A local web app that simulates an IPL-style mega auction. You run one franchise and bid against AI-controlled teams. After the auction you can review your squad, build a playing XI and share it as an image.

## Features

- Team selection and a live auction room with strategic AI bidding
- Auction pacing and pause/resume controls
- Save / resume (stored in a local SQLite file)
- Post-auction flow: squad page, lineup builder (XI, batting order, impact player) and a shareable image
- Math page explaining the bidding model

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router
- **Backend:** Python, FastAPI, SQLite (save data)

## Project Structure

```text
ipl-auction-simulator
├── backend/            FastAPI app (app.py), SQLite storage (storage.py), tests
├── frontend/
│   ├── src/            React app (pages, components, logic/, save/)
│   ├── public/         logos and player portraits
│   ├── scripts/        portrait generator
└── requirements.txt    Python dependencies
```

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Git | any | `git --version` |
| Node.js | 20.19+ (LTS) | `node -v && npm -v` |
| Python | 3.10+ | `python3 --version` (`python --version` on Windows) |

## Setup and Run

Run the backend and frontend in two separate terminals.

### 1. Clone

```bash
git clone <repository-url>
cd ipl-auction-simulator
```

### 2. Backend (terminal 1)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r ../requirements.txt
uvicorn app:app --reload
```

The API runs at http://127.0.0.1:8000. The save database `backend/ipl_save.db` is created automatically on first save. To store it elsewhere, set the `IPL_SAVE_DB` environment variable to a file path.

### 3. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port 8000. If your backend runs elsewhere, start the frontend with `VITE_PROXY_TARGET=http://host:port npm run dev`.

Save/resume and saved lineups need the backend running.

## Daily Workflow

```bash
git pull
# terminal 1
cd backend && source venv/bin/activate && uvicorn app:app --reload
# terminal 2
cd frontend && npm install && npm run dev
```

## Tests and Checks

```bash
cd frontend
npm test              # frontend logic tests (node --test)
npm run lint
npm run build         # production build into frontend/dist
npm run simulate      # headless auction simulation
npm run explain       # print explanation of the bidding model
npm run test:backend  # backend tests (expects backend/venv at ./venv/bin/python)
```

Backend tests can also be run directly: `cd backend && python -m unittest discover -s tests`.

## Regenerating Portraits (optional)

```bash
cd frontend
npm run portraits
```

## Not Committed

`node_modules/`, `venv/`, `dist/`, `__pycache__/`, local save databases (`*.db`), `backups/` and `.DS_Store` are git-ignored. Run the setup steps above to recreate them.

## Git Workflow

```bash
git status
git add <files>
git commit -m "Description of changes"
git push
```
