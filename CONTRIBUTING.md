# Contributing — Team Workflow

Three people, one repo. This doc is the actual day-to-day loop: how to get set up, how to make a change without stepping on each other, and how to merge safely.

## Ownership (avoids most conflicts before they happen)

| Area | Owner | Folder |
|---|---|---|
| Schema, data pipeline, spatial queries, data access layer | **Dipesh** | `backend/app/db/`, `backend/migrations/`, `data/` |
| Graph engine, Dijkstra/BFS, FastAPI route endpoints | **Janak** | `backend/app/api/`, `backend/app/core/` |
| UI, map, Leaflet/OSRM integration | **Dinesh** | `frontend/` |

You'll still touch each other's folders sometimes (e.g. Janak's graph engine needs Dipesh's `get_nearest_stop()` function) — that's fine, just open a PR like normal so the owner sees the change.

## One-time setup (each person, once)

```bash
git clone https://github.com/080bct026dipesh-beep/my-new-web-app.git
cd my-new-web-app

# Backend
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
cd ..

# Frontend
cd frontend
npm install
cd ..

# Database
docker compose up -d db
cd backend && alembic upgrade head && cd ..
```

## Daily workflow loop

1. **Start from a clean, up-to-date `main`:**
```bash
   git checkout main
   git pull origin main
```

2. **Create a branch per task** — name it after the Jira/Scrum ticket so it's traceable:
```bash
   git checkout -b scrum-3/dedup-stops
```
   Convention: `<scrum-number>/<short-description>` (e.g. `scrum-5/data-access-layer`, `scrum-6-graph/dijkstra-tests`).

3. **Work, commit in small chunks:**
```bash
   git add <files>
   git commit -m "Scrum 3: add 30m distance-based stop deduplication"
```
   If you're linking Jira, prefix with the issue key so Jira picks it up automatically (e.g. `KTM-14: add dedup script`).

4. **Run tests before pushing — every time:**
```bash
   cd backend && pytest
   cd ../frontend && npm test
```

5. **Push and open a PR:**
```bash
   git push -u origin scrum-3/dedup-stops
```
   Then on GitHub: **Compare & pull request** → target `main` → tag one teammate as reviewer.

6. **Reviewer checks it, approves or comments.** CI (`.github/workflows/ci.yml`) also has to pass — it spins up a real Postgres/PostGIS container and runs `pytest` automatically on every PR.

7. **Merge** (use "Squash and merge" to keep `main`'s history one-commit-per-feature and readable for your report/viva).

8. **Delete the branch** after merge, and everyone else runs `git pull origin main` before starting their next task.

## The one place conflicts actually hurt: the database schema

Only **one migration chain** can exist. If two people add migrations at the same time off the same `main`, the second person to push will need to rebase:

```bash
git checkout main && git pull
git checkout your-branch
git rebase main
# fix the migration numbering/down_revision if alembic complains
alembic upgrade head   # test it applies cleanly
```

Rule of thumb: **whoever is working on `backend/migrations/` at a given moment should say so in your team chat** before starting, so you don't both generate migration `0002` at once. This is Dipesh's area, so in practice Janak/Dinesh should ping before touching it.

## Keeping everyone's local DB in sync

Whenever you pull `main` and it includes a new migration:
```bash
cd backend
alembic upgrade head
```
That's it — your local Postgres container catches up automatically.

## Quick reference

```bash
git checkout main && git pull          # sync
git checkout -b scrum-X/task-name      # new branch per task
# ...work, test...
git push -u origin scrum-X/task-name   # push
# open PR on GitHub, get review, squash-merge
git checkout main && git pull          # sync again before next task
```
