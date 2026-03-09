#!/usr/bin/env python3
"""
Docker startup script for PowerPoint Alt-Text API V2
"""

import os
import sys
import uvicorn
from pathlib import Path

# Add the package to the path
sys.path.insert(0, '/app')

def main():
    try:
        # Import after path setup
        from powerpoint_alttext_v2.api.server import app
        from powerpoint_alttext_v2.config import get_config
        
        # Load configuration
        config = get_config()
        
        # Override host and port for Docker
        host = os.getenv('API_HOST', '0.0.0.0')
        port = int(os.getenv('API_PORT', '8001'))
        log_level = os.getenv('API_LOG_LEVEL', config.api.log_level)
        
        print(f"Starting PowerPoint Alt-Text API V2 on {host}:{port}")
        print(f"Log level: {log_level}")
        
        # Start the server
        uvicorn.run(
            app, 
            host=host,
            port=port,
            log_level=log_level,
            access_log=True
        )
        
    except Exception as e:
        print(f"Failed to start API server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()