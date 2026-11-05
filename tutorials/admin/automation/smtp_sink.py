"""Local SMTP sink for tutorial recordings.

Accepts any login and stores every message as an .eml file under
tutorials/admin/.local/mail/ instead of delivering it. This lets features
that send emails run for real during recordings without reaching anyone.
"""
import asyncio
import pathlib
import time

from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult, LoginPassword

OUT = pathlib.Path(__file__).resolve().parent.parent / ".local" / "mail"
OUT.mkdir(parents=True, exist_ok=True)


class Sink:
    async def handle_DATA(self, server, session, envelope):
        name = OUT / f"{time.strftime('%Y%m%d-%H%M%S')}-{int(time.time() * 1000) % 1000:03d}.eml"
        name.write_bytes(envelope.original_content or envelope.content)
        print(f"captured mail to {envelope.rcpt_tos} -> {name.name}", flush=True)
        return "250 Message captured by tutorial sink"


def accept_any(server, session, envelope, mechanism, auth_data):
    if isinstance(auth_data, LoginPassword):
        return AuthResult(success=True)
    return AuthResult(success=True)


if __name__ == "__main__":
    controller = Controller(
        Sink(),
        hostname="127.0.0.1",
        port=2525,
        authenticator=accept_any,
        auth_require_tls=False,
    )
    controller.start()
    print("SMTP sink listening on 127.0.0.1:2525", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        controller.stop()
