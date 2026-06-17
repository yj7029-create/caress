#!/usr/bin/env python3
"""
Caress — Lid Angle WebSocket Server
────────────────────────────────────
index.html 열기 전에 이 스크립트를 먼저 실행하세요.

설치 (처음 한 번):
    pip install pybooklid websockets

실행:
    python3 lid_ws.py
"""

import asyncio
import json
import websockets

connected: set = set()


async def register(websocket):
    """클라이언트 연결 관리"""
    connected.add(websocket)
    print(f"  브라우저 연결됨  (현재 {len(connected)}개)")
    try:
        await websocket.wait_closed()
    finally:
        connected.discard(websocket)
        print(f"  브라우저 해제됨  (현재 {len(connected)}개)")


async def sensor_loop():
    """뚜껑 각도를 20Hz로 읽어서 연결된 브라우저에 전송"""
    from pybooklid import LidSensor
    print("  뚜껑 센서 연결 중...")
    with LidSensor() as sensor:
        print("  센서 OK — 각도 전송 시작")
        for angle in sensor.monitor(interval=0.05):   # 20 Hz
            if connected:
                msg = json.dumps({"angle": round(float(angle), 1)})
                await asyncio.gather(
                    *(ws.send(msg) for ws in set(connected)),
                    return_exceptions=True
                )


async def main():
    print("✦ Caress Lid Angle Server")
    print("  ws://localhost:8765  에서 대기 중\n")
    async with websockets.serve(register, "localhost", 8765):
        await sensor_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  서버 종료")
