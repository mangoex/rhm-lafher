import sys
import os
import threading
import socketserver
from server import APIHandler, PORT

def start_server():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), APIHandler) as httpd:
        print(f"Serving RHM CRM & Prenómina on port {PORT}...")
        httpd.serve_forever()

if __name__ == "__main__":
    # Detect if we are running in a cloud/PaaS hosting environment (like Railway, Render, Heroku)
    is_cloud = "PORT" in os.environ or "RAILWAY_STATIC_URL" in os.environ or "RENDER" in os.environ
    
    if is_cloud:
        print(f"Cloud environment detected. Starting server on port {PORT} in main thread...")
        start_server()
    else:
        # Local execution: Try to run with desktop webview if available
        try:
            import webview
            
            # Force SSL and DNS initialization on the main thread to prevent macOS thread-safety crashes in background threads
            try:
                import ssl
                import socket
                ssl.create_default_context()
                socket.getaddrinfo("generativelanguage.googleapis.com", 443)
            except Exception as e:
                print("Pre-initializing SSL/Network on main thread returned:", e)

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
        except ImportError:
            print("webview module not found. Starting server in standalone mode...")
            start_server()
