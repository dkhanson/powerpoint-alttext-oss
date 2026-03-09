#!/usr/bin/env python3
"""
Simple HTTP server for serving static files with SPA support.
Falls back to index.html for routes that don't exist (client-side routing).
"""
import http.server
import socketserver
import os
from pathlib import Path

PORT = int(os.environ.get('WEB_PORT', 80))

class SPAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with fallback to index.html for SPA support."""
    
    def do_GET(self):
        """Handle GET requests with fallback to index.html."""
        # Get the requested path
        path = self.translate_path(self.path)
        
        # If the path doesn't exist and it's not a file request, serve index.html
        if not os.path.exists(path) and not self.path.startswith('/static'):
            self.path = '/index.html'
        
        return http.server.SimpleHTTPRequestHandler.do_GET(self)
    
    def end_headers(self):
        """Add CORS headers if needed."""
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        return super().end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), SPAHTTPRequestHandler) as httpd:
        print(f"Serving HTTP on 0.0.0.0 port {PORT} (http://0.0.0.0:{PORT}/) ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()
