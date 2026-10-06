"""High-performance WebSocket connection manager for binary image relay."""

import asyncio
import json
import time
from typing import Dict, Optional

from fastapi import WebSocket

from app.config import settings


class WebSocketManager:
    """Manages sender/viewer WebSocket connections and binary frame fan-out."""

    def __init__(self) -> None:
        # WebSocket → role mapping: "sender" | "viewer" | None (unannounced)
        self._connections: Dict[WebSocket, Optional[str]] = {}
        self._lock = asyncio.Lock()

        # Cached latest binary frame — sent to new viewers on connect
        self._latest_frame: Optional[bytes] = None
        self._latest_frame_time: float = 0.0

        # Cached latest preserved QR symbol — sent to new viewers on connect
        self._latest_qr: Optional[str] = None
        self._latest_qr_time: float = 0.0

        # Debounce status broadcasts: coalesce rapid connect/disconnect bursts
        self._status_dirty = False
        self._status_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self, websocket: WebSocket) -> bool:
        """Accept and register a new WebSocket. Returns False if at capacity."""
        async with self._lock:
            if len(self._connections) >= settings.MAX_CONNECTIONS:
                await websocket.close(code=1013, reason="Server at capacity")
                return False
            await websocket.accept()
            self._connections[websocket] = None

        await self._broadcast_status()
        return True

    async def disconnect(self, websocket: WebSocket) -> None:
        """Unregister a WebSocket connection."""
        async with self._lock:
            self._connections.pop(websocket, None)
        await self._broadcast_status()

    async def set_role(self, websocket: WebSocket, role: str) -> None:
        """Set the role for a connection ('sender' or 'viewer')."""
        async with self._lock:
            if websocket in self._connections:
                self._connections[websocket] = role

        # If a viewer just announced, send them the freshest cached QR or frame immediately
        if role == "viewer":
            if self._latest_qr is not None and self._latest_qr_time >= self._latest_frame_time:
                asyncio.create_task(self._safe_send_text(websocket, self._latest_qr))
            elif self._latest_frame is not None:
                asyncio.create_task(self._safe_send_bytes(websocket, self._latest_frame))

        await self._broadcast_status()

    # ------------------------------------------------------------------
    # Binary relay — the hot path
    # ------------------------------------------------------------------

    async def broadcast_binary(self, data: bytes) -> None:
        """Cache the frame and fan-out to all viewers concurrently."""
        if len(data) > settings.MAX_FRAME_SIZE:
            return  # reject oversized blobs silently

        async with self._lock:
            self._latest_frame = data
            self._latest_frame_time = time.monotonic()
            viewers = [
                ws for ws, role in self._connections.items() if role == "viewer"
            ]

        # Fire-and-forget concurrent sends — never block the sender's upload loop
        for ws in viewers:
            asyncio.create_task(self._safe_send_bytes(ws, data))

    async def broadcast_qr(self, text: str) -> None:
        """Cache the preserved QR symbol and fan-out to all viewers concurrently."""
        async with self._lock:
            self._latest_qr = text
            self._latest_qr_time = time.monotonic()
            viewers = [
                ws for ws, role in self._connections.items() if role == "viewer"
            ]

        for ws in viewers:
            asyncio.create_task(self._safe_send_text(ws, text))

    async def broadcast_to_viewers(self, text: str) -> None:
        """Send a text message to all active viewers."""
        async with self._lock:
            viewers = [
                ws for ws, role in self._connections.items() if role == "viewer"
            ]

        for ws in viewers:
            asyncio.create_task(self._safe_send_text(ws, text))



    # ------------------------------------------------------------------
    # Safe send helpers
    # ------------------------------------------------------------------

    async def _safe_send_bytes(self, ws: WebSocket, data: bytes) -> None:
        """Send binary data with timeout. Disconnects on failure."""
        try:
            await asyncio.wait_for(
                ws.send_bytes(data), timeout=settings.SEND_TIMEOUT
            )
        except Exception:
            await self._remove(ws)

    async def _safe_send_text(self, ws: WebSocket, text: str) -> None:
        """Send text data with timeout. Disconnects on failure."""
        try:
            await asyncio.wait_for(
                ws.send_text(text), timeout=settings.SEND_TIMEOUT
            )
        except Exception:
            await self._remove(ws)

    async def _remove(self, ws: WebSocket) -> None:
        """Remove a connection and close the socket to avoid zombie TCP connections."""
        async with self._lock:
            self._connections.pop(ws, None)
        try:
            await ws.close()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Status broadcasting
    # ------------------------------------------------------------------

    async def _broadcast_status(self) -> None:
        """Debounced status broadcast — coalesces rapid connect/disconnect bursts."""
        if self._status_dirty:
            return  # already scheduled
        self._status_dirty = True

        async def _send_after_delay() -> None:
            await asyncio.sleep(0.05)  # 50ms debounce window
            self._status_dirty = False
            async with self._lock:
                senders = sum(1 for r in self._connections.values() if r == "sender")
                viewers = sum(1 for r in self._connections.values() if r == "viewer")
                all_ws = list(self._connections.keys())

            payload = json.dumps({
                "type": "status",
                "senders": senders,
                "viewers": viewers,
            })
            for ws in all_ws:
                asyncio.create_task(self._safe_send_text(ws, payload))

        self._status_task = asyncio.create_task(_send_after_delay())

    # ------------------------------------------------------------------
    # Stats endpoint
    # ------------------------------------------------------------------

    async def get_stats(self) -> dict:
        """Return current connection statistics."""
        async with self._lock:
            senders = sum(1 for r in self._connections.values() if r == "sender")
            viewers = sum(1 for r in self._connections.values() if r == "viewer")
            total = len(self._connections)

        return {
            "status": "ok",
            "total_connections": total,
            "senders": senders,
            "viewers": viewers,
            "has_cached_frame": self._latest_frame is not None,
            "max_connections": settings.MAX_CONNECTIONS,
        }


# Singleton instance used across the application
manager = WebSocketManager()
