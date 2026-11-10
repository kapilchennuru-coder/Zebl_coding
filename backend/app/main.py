from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth_routes, routes
from .models import Base, SessionLocal, engine, ensure_schema
from .seed import ensure_permissions

app = FastAPI(title="ZEBL Coding Agent", docs_url=None, redoc_url=None)
Base.metadata.create_all(engine)
ensure_schema()
with SessionLocal() as _db:
    ensure_permissions(_db)


@app.middleware("http")
async def guard(request: Request, call_next):
    # Browsers cannot attach this header on a cross-site request without CORS approval, and none is granted.
    if request.url.path.startswith("/api") and request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-zebl-csrf") != "1":
        return JSONResponse({"detail": "Request rejected."}, status_code=403)
    resp = await call_next(request)
    resp.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin"})
    if request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


app.include_router(auth_routes.router)
app.include_router(routes.router)

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api"):
            return JSONResponse({"detail": "Not found."}, status_code=404)
        return FileResponse(DIST / "index.html")
