import sys
import os
import threading
import socketserver
import webview
from server import APIHandler, PORT

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    # Start local server in a daemon thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Launch dedicated desktop window
    webview.create_window(
        title="RHM - CRM y Prenómina Inteligente",
        url=f"http://localhost:{PORT}",
        width=1366,
        height=768,
        resizable=True,
        min_size=(1024, 700)
    )
    webview.start()
