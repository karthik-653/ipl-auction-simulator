import json

from fastapi import Body, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

import storage

# Interactive docs / schema are not needed and are not exposed over a tunnel.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    # dev server + Capacitor Android WebView (https://localhost) / iOS (capacitor://localhost)
    allow_origin_regex=r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|capacitor://localhost)",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "IPL Auction Simulator Backend Running"}


def _error(exc: storage.SaveError):
    return JSONResponse(
        status_code=exc.status, content={"error": exc.code, "detail": str(exc)}
    )


@app.get("/api/save")
def save_info():
    """Metadata of the one saved game (never the full snapshot)."""
    meta = storage.get_meta()
    return {"exists": meta is not None, "meta": meta}


@app.get("/api/save/data")
def save_data():
    row = storage.get_data()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "no-save"})
    # Stored text is returned verbatim so the client can detect corruption.
    return Response(content=row[1], media_type="application/json")


MAX_BODY_BYTES = 2 * 1024 * 1024  # a full snapshot is well under this


@app.put("/api/save")
def save_put(request: Request, payload: dict = Body(...)):
    """Create/update the single save. `replace: true` is only sent for an
    explicit, user-confirmed New Game."""
    if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"error": "too-large"})
    try:
        meta = storage.put(payload.get("snapshot"), bool(payload.get("replace")))
    except storage.SaveError as exc:
        return _error(exc)
    except Exception as exc:  # database failure: previous save is untouched
        return JSONResponse(
            status_code=500, content={"error": "storage-failure", "detail": str(exc)}
        )
    return {"ok": True, "meta": meta}


@app.get("/api/lineups")
def lineups_get(sessionId: str = ""):
    """Submitted Playing XIs of one auction session (never the auction itself)."""
    if not sessionId:
        return JSONResponse(status_code=422, content={"error": "invalid-snapshot", "detail": "sessionId missing"})
    return {"lineups": storage.get_lineups(sessionId)}


@app.put("/api/lineups/{team}")
def lineup_put(team: str, payload: dict = Body(...)):
    """Create/update one team's lineup. Independent of the saved-game row."""
    try:
        record = storage.put_lineup(payload.get("sessionId"), team, payload.get("lineup"))
    except storage.SaveError as exc:
        return _error(exc)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": "storage-failure", "detail": str(exc)})
    return {"ok": True, "lineup": record}
