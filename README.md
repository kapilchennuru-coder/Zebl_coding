# ZEBL Coding Agent

AI-assisted medical coding workspace. **The AI engine is a keyword rule mock and all data is synthetic.** Do not load real patient data into this build.

## Run locally

```
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m app.seed
.venv\Scripts\python -m uvicorn app.main:app --port 8123
```

Build the UI once with `cd frontend && npm install && npm run build`, then open http://127.0.0.1:8123.
Sign-in accounts and their random passwords are in `backend/.dev-credentials.txt`, regenerated on each seed.

UI development with hot reload: run `npm run dev` and change the proxy port in `vite.config.ts` to match the API.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL, for example `mysql+pymysql://zebl:PASSWORD@127.0.0.1:13306/zebl` | local SQLite file |
| `ZEBL_ENV` | `production` turns on Secure cookies and blocks seeding | `development` |
| `ZEBL_IDLE_MINUTES` | Idle session timeout | `30` |
| `ZEBL_UPLOAD_DIR` | Private upload folder, outside any web root | `./uploads_private` |

## Tests

`cd backend`, then `set PYTHONPATH=.` and `.venv\Scripts\python -m pytest -q tests`.

## Replacing the mock AI

`backend/app/engine.py` is the integration boundary. A real service implements `generate(documents, lookup)` and returns the same structure (code, evidence, guideline, basis, confidence), or abstains. Register it in `ai_model_registry`.

## Before real use

- Replace the demo code catalogs with official, versioned data. CPT content needs an AMA license, and NCCI edits need the CMS tables.
- Connect an email provider. Password reset tokens currently print to the server log in development only.
- Add database migrations (Alembic), since tables are currently created at startup.
- Move rate limiting to a shared store if running more than one server process.
- Add encryption at rest, TLS, backups, monitoring and secret management at deployment.
- These controls do not make the product HIPAA compliant. Compliance also needs risk assessment, policies, BAAs and operational verification.
