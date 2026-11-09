"""Record the sample video in headless Chrome: assets/sample.webm + assets/sample.json.

    python -I tools/sample/make_sample.py

It serves make_sample.html on a free port, opens it in headless Chrome (with autoplay allowed, so the
Web Audio voice plays), waits while the ~60 s episode records in real time, and saves what the page posts.
"""
import pathlib
import socket
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parents[1] / "assets"
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
DONE = threading.Event()
RESULT = {}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        body = (HERE / "make_sample.html").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        data = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if u.path == "/save":
            name = q["name"][0]
            assert name in ("sample.webm", "sample.json")
            (ASSETS / name).write_bytes(data)
            print("saved", name, len(data), "bytes", flush=True)
        if u.path == "/done":
            RESULT["error"] = q.get("error", [None])[0]
            DONE.set()
        self.send_response(204)
        self.end_headers()


def main():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix="rs-sample-")
    chrome = subprocess.Popen([CHROME, "--headless=new", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
                               "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--no-first-run",
                               "--user-data-dir=" + prof, "--window-size=700,500", "http://127.0.0.1:%d/" % port],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not DONE.wait(240):
            raise SystemExit("timed out")
        if RESULT.get("error"):
            raise SystemExit("page error: " + RESULT["error"])
        print("done")
    finally:
        chrome.kill()
        srv.shutdown()


if __name__ == "__main__":
    main()
