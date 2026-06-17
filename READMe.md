# IPL Auction Simulator

A local web application that simulates an IPL-style mega auction where the user controls a franchise and competes against AI-controlled teams.

---

## Tech Stack

### Frontend

* React
* Vite
* React Router DOM

### Backend

* FastAPI
* Python

### Future Enhancements

* AI Team Strategies
* Auction Analytics
* ML-Based Player Valuation
* Save / Load Auction States

---

## Project Structure

```text
IPL-Auction-Simulator
│
├── frontend
│
├── backend
│
├── data
│
├── models
│
└── docs
```

---

# First Time Setup

## 1. Install Git

Verify installation:

```bash
git --version
```

---

## 2. Install Node.js

Download and install the latest LTS version:

https://nodejs.org

Verify installation:

```bash
node -v
npm -v
```

Example:

```bash
v24.x.x
11.x.x
```

---

## 3. Install Python

Download:

https://www.python.org/downloads/

Verify installation:

```bash
python --version
```

Example:

```bash
Python 3.13.x
```

---

# Clone Repository

```bash
git clone <repository-url>
cd IPL-Auction-Simulator
```

---

# Frontend Setup

Navigate to frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Application should be available at:

```text
http://localhost:5173
```

---

# Backend Setup

Navigate to backend:

```bash
cd backend
```

Create virtual environment:

```bash
python -m venv venv
```

Activate virtual environment:

### Windows

```bash
venv\Scripts\activate
```

### Mac/Linux

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install fastapi uvicorn pandas numpy scikit-learn
```

Generate requirements file:

```bash
pip freeze > requirements.txt
```

Start backend:

```bash
uvicorn app:app --reload
```

Backend should be available at:

```text
http://127.0.0.1:8000
```

---

# Daily Development Workflow

## Pull Latest Changes

```bash
git pull
```

---

## Start Frontend

```bash
cd frontend
npm run dev
```

---

## Start Backend

```bash
cd backend
venv\Scripts\activate
uvicorn app:app --reload
```

---

# Git Workflow

Check status:

```bash
git status
```

Stage changes:

```bash
git add .
```

Commit changes:

```bash
git commit -m "Description of changes"
```

Push changes:

```bash
git push
```

---

# Important Notes

### Node.js and Python Virtual Environment

Node.js is installed globally on the machine.

Verify Node installation:

```bash
node -v
npm -v
```

Node.js does **not** need to be installed inside the Python virtual environment.

The Python virtual environment is only used for backend Python packages.

Frontend and backend run independently.

### Typical Development Setup

Terminal 1:

```bash
cd frontend
npm run dev
```

Terminal 2:

```bash
cd backend
venv\Scripts\activate
uvicorn app:app --reload
```

---

# Current Milestones

* [ ] Team Selection
* [ ] Retention System
* [ ] Auction Room
* [ ] AI Bidding
* [ ] Squad Management
* [ ] Auction Summary
* [ ] Save / Load Auctions
* [ ] ML Player Valuation

---

# Useful Commands

Install a new frontend package:

```bash
npm install package-name
```

Install a new backend package:

```bash
pip install package-name
pip freeze > requirements.txt
```

Update local repository:

```bash
git pull
```

Push current work:

```bash
git add .
git commit -m "Your message"
git push
```
