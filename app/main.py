"""FastAPI application — HTTP routes and WebSocket endpoint."""

import json
import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse

from app.ws_manager import manager

app = FastAPI(title="QR Image Relay")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.middleware("http")
async def add_cache_prevention_headers(request, call_next):
    """Ensure all HTTP responses bypass aggressive browser & Cloudflare caching."""
    response = await call_next(request)
    for key, value in NO_CACHE_HEADERS.items():
        response.headers[key] = value
    return response


# --------------------------------------------------------------------------
# HTTP Routes (Supports both GET and HEAD for cloud healthcheckers)
# --------------------------------------------------------------------------

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return RedirectResponse(url="/viewer.html", headers=NO_CACHE_HEADERS)


@app.api_route("/sender.html", methods=["GET", "HEAD"])
async def sender_page():
    return FileResponse(STATIC_DIR / "sender.html", media_type="text/html", headers=NO_CACHE_HEADERS)


@app.api_route("/viewer.html", methods=["GET", "HEAD"])
async def viewer_page():
    return FileResponse(STATIC_DIR / "viewer.html", media_type="text/html", headers=NO_CACHE_HEADERS)


@app.api_route("/status", methods=["GET", "HEAD"])
async def status():
    stats = await manager.get_stats()
    stats["version"] = "2.4.0"
    stats["features"] = [
        "sender-ready-bell",
        "max-volume-ring",
        "compact-phone-viewfinder",
        "60pct-camera-height",
        "portrait-3-4-ratio",
        "pinch-to-zoom",
        "ois-optimization",
        "no-cache-headers",
    ]
    return stats


# --------------------------------------------------------------------------
# WebSocket Endpoint (Handles binary images, roles, and keepalive pings)
# --------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    accepted = await manager.connect(websocket)
    if not accepted:
        return  # rejected (at capacity)

    try:
        while True:
            message = await websocket.receive()

            # Text payload: roles or keep-alive pings
            if "text" in message:
                text = message["text"]
                if not text:
                    continue
                try:
                    data = json.loads(text)
                    if isinstance(data, dict):
                        msg_type = data.get("type")
                        if msg_type == "role":
                            role = data.get("role")
                            if role in ("sender", "viewer"):
                                await manager.set_role(websocket, role)
                        elif msg_type == "ping":
                            await websocket.send_text('{"type":"pong"}')
                        elif msg_type in ("ring", "ready"):
                            action = data.get("action", "start")
                            await manager.broadcast_to_viewers(
                                json.dumps({
                                    "type": "ring",
                                    "action": action,
                                })
                            )
                except (json.JSONDecodeError, TypeError):
                    pass

            # Binary payload: QR crops from senders
            elif "bytes" in message:
                binary = message["bytes"]
                if binary:
                    await manager.broadcast_binary(binary)

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        logging.exception("Unexpected error in WebSocket handler")
        await manager.disconnect(websocket)
