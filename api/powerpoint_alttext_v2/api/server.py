"""
FastAPI server for PowerPoint accessibility processing (V2)
Based on the working scripts/api_server.py
"""

import os
import sys
import tempfile
import uuid
import zipfile
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
import time
import base64

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Depends, status, Form
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import uvicorn
from jwt import PyJWKClient, decode as jwt_decode, InvalidTokenError

from ..config import get_config
from ..core.processor import PowerPointProcessor
from ..core.accessibility_scorer import AccessibilityScorer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize configuration
config = get_config()
auth_config = config.auth

# Token verification setup
bearer_scheme = HTTPBearer(auto_error=False)
jwks_client = PyJWKClient(auth_config.jwks_url) if auth_config.jwks_url else None

# Create FastAPI app
app = FastAPI(
    title="PowerPoint Accessibility API V2",
    description="AI-powered PowerPoint accessibility enhancement service (TOML-based)",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize processor and scorer
processor = PowerPointProcessor()
scorer = AccessibilityScorer()

# Ensure temp directories exist
temp_dir = Path(config.processing.temp_dir)
results_dir = Path(config.processing.results_dir)
temp_dir.mkdir(exist_ok=True)
results_dir.mkdir(exist_ok=True)

# Background tasks storage
background_tasks = {}

# Progress tracking for long-running tasks
progress_tracker: Dict[str, Dict[str, Any]] = {}


async def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[Dict[str, Any]]:
    """
    Validate bearer token using OIDC JWKS. Returns token claims when valid.
    """
    # Allow auth bypass for testing or explicit disable flag
    if (
        not auth_config.require_auth
        or os.getenv("AUTH_DISABLED") == "1"
        or "PYTEST_CURRENT_TEST" in os.environ
    ):
        return None

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )

    if jwks_client is None:
        logger.error("Auth is enabled but JWKS client is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication not configured",
        )

    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt_decode(
            token,
            signing_key,
            algorithms=auth_config.algorithms,
            audience=auth_config.audience,
            issuer=auth_config.issuer,
        )
        return claims
    except InvalidTokenError as exc:
        logger.warning(f"Token validation failed: {exc}  | token prefix: {token[:20]}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    except Exception as exc:
        logger.error(f"Authentication error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
        "config": {
            "azure_openai_configured": bool(config.azure_openai.api_key),
            "processing_enabled": True,
            "scoring_enabled": config.accessibility.enable_scoring
        }
    }


@app.get("/config")
async def get_configuration(_: Dict[str, Any] = Depends(require_auth)):
    """Get current configuration (without sensitive data)."""
    return {
        "api": {
            "host": config.api.host,
            "port": config.api.port,
            "max_file_size_mb": config.api.max_file_size_mb,
            "timeout_seconds": config.api.timeout_seconds
        },
        "processing": {
            "process_images": config.processing.process_images,
            "process_shapes": config.processing.process_shapes,
            "process_slide_titles": config.processing.process_slide_titles,
            "max_alt_text_length": config.processing.max_alt_text_length,
            "enable_multithreading": config.processing.enable_multithreading,
            "max_concurrent_api_calls": config.processing.max_concurrent_api_calls
        },
        "accessibility": {
            "target_score_threshold": config.accessibility.target_score_threshold,
            "enable_scoring": config.accessibility.enable_scoring
        }
    }


@app.post("/process-powerpoint-fast")
async def process_powerpoint_fast(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PowerPoint file (.pptx) to process"),
    skip_text_boxes: bool = Form(False, description="Skip alt-text generation for text boxes (faster)"),
    task_id: str = Form(None, description="Optional client-provided task ID for progress tracking"),
    token_claims: Dict[str, Any] = Depends(require_auth),
):
    """
    FAST MODE: Process PowerPoint file without scoring.
    
    Returns JSON with:
    - Base64-encoded processed PowerPoint file
    - Simple markdown report of processing
    - Metadata (filename, processing time, etc.)
    
    Use this when you need quick processing and want to display results in UI.
    """
    # Validate file type
    if not file.filename.lower().endswith('.pptx'):
        raise HTTPException(
            status_code=400, 
            detail="Only .pptx files are supported"
        )

    # Check file size
    file_size = 0
    content = await file.read()
    file_size = len(content)
    max_size = config.api.max_file_size_mb * 1024 * 1024
    
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {config.api.max_file_size_mb}MB"
        )

    # Use client-provided task ID or generate one
    if not task_id:
        task_id = str(uuid.uuid4())[:8]
    original_name = Path(file.filename).stem

    # Save uploaded file
    input_file = temp_dir / f"{task_id}_input.pptx"
    output_file = temp_dir / f"{task_id}_output.pptx"
    
    with open(input_file, "wb") as f:
        f.write(content)

    try:
        start_time = time.time()

        logger.info(f"[FAST MODE] Processing presentation: {file.filename} (Task: {task_id})")
        logger.info(f"[FAST MODE] skip_text_boxes={skip_text_boxes}")

        # Initialize progress tracking
        progress_tracker[task_id] = {
            "status": "processing",
            "task_id": task_id,
            "filename": file.filename,
            "current_slide": 0,
            "total_slides": 0,
            "processed_shapes": 0,
            "elapsed_seconds": 0,
            "estimated_remaining_seconds": 0,
        }

        def on_progress(current_slide, total_slides, shapes_processed, elapsed, remaining):
            progress_tracker[task_id].update({
                "current_slide": current_slide,
                "total_slides": total_slides,
                "processed_shapes": shapes_processed,
                "elapsed_seconds": round(elapsed, 1),
                "estimated_remaining_seconds": round(remaining, 1),
            })

        # Temporarily override config if skip_text_boxes is provided
        original_skip_setting = processor.config.processing.skip_text_boxes
        if skip_text_boxes:
            processor.config.processing.skip_text_boxes = True

        try:
            # Run in thread to keep event loop (and health checks) responsive
            processing_result = await asyncio.to_thread(
                processor.process_presentation,
                str(input_file),
                str(output_file),
                on_progress,
            )
        finally:
            # Restore original setting
            processor.config.processing.skip_text_boxes = original_skip_setting
        
        if not processing_result.get('success', False):
            raise HTTPException(
                status_code=500,
                detail=f"Processing failed: {processing_result.get('error', 'Unknown error')}"
            )

        processing_time = time.time() - start_time
        
        # Generate detailed markdown report from processing result
        slide_details = processing_result.get('slide_details', [])
        total_slides = processing_result.get('total_slides', 0)
        processed_shapes = processing_result.get('processed_shapes', 0)
        
        # Count various enhancements
        slide_titles_set = sum(1 for slide in slide_details if slide.get('title_set', False))
        alt_text_set = sum(slide.get('shapes_processed', 0) for slide in slide_details)
        decorative_marked = sum(1 for slide in slide_details 
                               for shape in slide.get('shapes', []) 
                               if shape.get('decorative', False))
        
        markdown_report = f"""# PowerPoint Accessibility Enhancement Report

**File:** {file.filename}  
**Processed:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
**Processing Time:** {processing_time:.2f} seconds

## Summary

- **Total Slides:** {total_slides}
- **Slide Titles Generated:** {slide_titles_set}
- **Alt-text Descriptions Added:** {alt_text_set}
- **Decorative Elements Marked:** {decorative_marked}

## Detailed Changes by Slide

"""
        
        # Add slide-by-slide details
        for slide in slide_details:
            slide_num = slide.get('slide_num', 0)
            markdown_report += f"\n### Slide {slide_num}\n\n"
            
            if slide.get('title_set') and slide.get('title'):
                markdown_report += f"**Title:** {slide['title']}\n\n"
            
            # Process shapes
            images_updated = []
            decorative_elements = []
            
            for shape in slide.get('shapes', []):
                if shape.get('processed'):
                    if shape.get('decorative'):
                        decorative_elements.append(f"Shape {shape['shape_idx']} ({shape['shape_type']})")
                    elif shape.get('alt_text'):
                        shape_name = f"Shape {shape['shape_idx']} ({shape['shape_type']})"
                        images_updated.append((shape_name, shape['alt_text']))
            
            if images_updated:
                markdown_report += "**Images/Shapes Updated:**\n\n"
                for shape_name, alt_text in images_updated:
                    # Truncate long alt text for display
                    display_text = alt_text[:100] + "..." if len(alt_text) > 100 else alt_text
                    markdown_report += f"- **{shape_name}:** {display_text}\n"
                markdown_report += "\n"
            
            if decorative_elements:
                markdown_report += "**Decorative Elements:**\n\n"
                for element in decorative_elements:
                    markdown_report += f"- {element}\n"
                markdown_report += "\n"
            
            if not images_updated and not decorative_elements and not slide.get('title_set'):
                markdown_report += "*No accessibility changes made to this slide*\n\n"

        markdown_report += f"""
## Technical Details

- **AI Model:** {config.azure_openai.model}
- **Processing Method:** python-pptx with OpenAI vision
- **Multi-threading:** {'Enabled' if config.processing.enable_multithreading else 'Disabled'}
- **Max Concurrent Calls:** {config.processing.max_concurrent_api_calls}
- **Cross-platform:** Compatible with Windows, macOS, and Linux

---
*Generated by PowerPoint Accessibility API V2*
"""

        # Read the processed file and encode to base64
        with open(output_file, "rb") as f:
            file_data = f.read()
        
        file_base64 = base64.b64encode(file_data).decode('utf-8')
        
        # Clean up temp files
        if input_file.exists():
            input_file.unlink()
        if output_file.exists():
            output_file.unlink()

        logger.info(f"[FAST MODE] Processing completed successfully: {task_id}")

        # Mark progress as complete, then clean up after a delay
        progress_tracker[task_id] = {"status": "complete", "task_id": task_id}

        # Return JSON with file and markdown
        return JSONResponse(content={
            "success": True,
            "filename": f"{original_name}_accessible.pptx",
            "original_filename": file.filename,
            "file_base64": file_base64,
            "file_size": len(file_data),
            "markdown_report": markdown_report,
            "processing_time": round(processing_time, 2),
            "task_id": task_id,
            "stats": {
                "total_slides": total_slides,
                "slide_titles": slide_titles_set,
                "alt_texts": alt_text_set,
                "decorative_elements": decorative_marked,
                "processed_shapes": processed_shapes
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on error
        if input_file.exists():
            input_file.unlink()
        if output_file.exists():
            output_file.unlink()
            
        logger.error(f"[FAST MODE] Processing error for task {task_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


@app.post("/process")
async def process_powerpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PowerPoint file to process"),
    generate_slide_titles: bool = None,
    force_regenerate: bool = False,
    token_claims: Dict[str, Any] = Depends(require_auth),
):
    """
    Process a PowerPoint file to add alt-text and slide titles.
    Returns both the enhanced file and accessibility report as a ZIP.
    """
    # Use config default if not specified
    if generate_slide_titles is None:
        generate_slide_titles = config.processing.process_slide_titles
    # Validate file type
    if not file.filename.lower().endswith(('.pptx', '.ppt')):
        raise HTTPException(
            status_code=400, 
            detail="File must be a PowerPoint presentation (.pptx or .ppt)"
        )

    # Check file size
    file_size = 0
    content = await file.read()
    file_size = len(content)
    max_size = config.api.max_file_size_mb * 1024 * 1024
    
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {config.api.max_file_size_mb}MB"
        )

    # Generate unique task ID
    task_id = str(uuid.uuid4())
    
    # Save uploaded file
    input_file = temp_dir / f"{task_id}_input.pptx"
    with open(input_file, "wb") as f:
        f.write(content)

    try:
        # Process the presentation
        logger.info(f"Processing presentation: {file.filename} (Task: {task_id})")
        
        # Temporarily update config for this request
        original_force = config.processing.force_regenerate
        original_titles = config.processing.process_slide_titles
        
        config.processing.force_regenerate = force_regenerate
        config.processing.process_slide_titles = generate_slide_titles
        
        # Run in thread to keep event loop (and health checks) responsive
        output_file = temp_dir / f"{task_id}_output.pptx"
        processing_result = await asyncio.to_thread(
            processor.process_presentation,
            str(input_file),
            str(output_file)
        )
        
        # Restore original config
        config.processing.force_regenerate = original_force
        config.processing.process_slide_titles = original_titles
        
        if not processing_result.get('success', False):
            raise HTTPException(
                status_code=500,
                detail=f"Processing failed: {processing_result.get('error', 'Unknown error')}"
            )

        # Generate accessibility score
        accessibility_score = None
        if config.accessibility.enable_scoring and output_file.exists():
            accessibility_score = scorer.calculate_accessibility_score(str(output_file))

        # Create results package
        results_file = results_dir / f"{Path(file.filename).stem}_accessibility_enhanced.zip"
        
        with zipfile.ZipFile(results_file, 'w') as zip_file:
            # Add processed presentation
            zip_file.write(output_file, f"{Path(file.filename).stem}_enhanced.pptx")
            
            # Add processing report
            report_data = {
                "processing_result": processing_result,
                "accessibility_score": accessibility_score,
                "task_id": task_id,
                "original_filename": file.filename,
                "processed_at": datetime.now().isoformat(),
                "configuration": {
                    "force_regenerate": force_regenerate,
                    "generate_slide_titles": generate_slide_titles,
                    "max_alt_text_length": config.processing.max_alt_text_length
                }
            }
            
            zip_file.writestr("processing_report.json", json.dumps(report_data, indent=2))
            
            # Add accessibility report if available
            if accessibility_score and not accessibility_score.get('error'):
                markdown_report = scorer.generate_accessibility_report(accessibility_score)
                zip_file.writestr("accessibility_report.md", markdown_report)

        # Clean up temp files
        if input_file.exists():
            input_file.unlink()
        if output_file.exists():
            output_file.unlink()

        logger.info(f"Processing completed successfully: {task_id}")
        
        # Return the results file
        return FileResponse(
            path=str(results_file),
            media_type='application/zip',
            filename=f"{Path(file.filename).stem}_accessibility_enhanced.zip"
        )

    except Exception as e:
        # Clean up on error
        if input_file.exists():
            input_file.unlink()
        if 'output_file' in locals() and output_file.exists():
            output_file.unlink()
            
        logger.error(f"Processing error for task {task_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


@app.post("/score")
async def score_accessibility(
    file: UploadFile = File(..., description="PowerPoint file to analyze"),
    token_claims: Dict[str, Any] = Depends(require_auth),
):
    """
    Analyze a PowerPoint file for accessibility score without modification.
    """
    # Validate file type
    if not file.filename.lower().endswith(('.pptx', '.ppt')):
        raise HTTPException(
            status_code=400, 
            detail="File must be a PowerPoint presentation (.pptx or .ppt)"
        )

    # Generate unique task ID
    task_id = str(uuid.uuid4())
    
    # Save uploaded file
    input_file = temp_dir / f"{task_id}_score_input.pptx"
    content = await file.read()
    
    with open(input_file, "wb") as f:
        f.write(content)

    try:
        logger.info(f"Scoring accessibility: {file.filename} (Task: {task_id})")
        
        # Calculate accessibility score
        accessibility_score = scorer.calculate_accessibility_score(str(input_file))
        
        # Clean up
        if input_file.exists():
            input_file.unlink()
        
        if accessibility_score.get('error'):
            raise HTTPException(
                status_code=500,
                detail=f"Scoring failed: {accessibility_score['error']}"
            )
        
        logger.info(f"Scoring completed: {task_id}")
        return {
            "task_id": task_id,
            "filename": file.filename,
            "accessibility_score": accessibility_score,
            "analyzed_at": datetime.now().isoformat()
        }

    except Exception as e:
        # Clean up on error
        if input_file.exists():
            input_file.unlink()
            
        logger.error(f"Scoring error for task {task_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Accessibility scoring failed: {str(e)}"
        )


@app.get("/progress/{task_id}")
async def get_progress(task_id: str):
    """Get processing progress for a task. No auth required so UI can poll freely."""
    if task_id not in progress_tracker:
        return {"status": "unknown", "task_id": task_id}
    return progress_tracker[task_id]


@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str, token_claims: Dict[str, Any] = Depends(require_auth)):
    """Get the status of a background task."""
    if task_id not in background_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    return background_tasks[task_id]


@app.get("/")
async def root(token_claims: Dict[str, Any] = Depends(require_auth)):
    """Root endpoint with API information."""
    return {
        "name": "PowerPoint Accessibility API V2",
        "version": "2.0.0",
        "description": "AI-powered PowerPoint accessibility enhancement service",
        "endpoints": {
            "health": "/health",
            "config": "/config", 
            "process": "/process",
            "process-fast": "/process-powerpoint-fast",
            "score": "/score",
            "docs": "/docs"
        },
        "features": [
            "Alt-text generation using Azure OpenAI",
            "Slide title generation",
            "Accessibility scoring",
            "Decorative element marking",
            "TOML-based configuration"
        ]
    }


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host=config.api.host,
        port=config.api.port,
        reload=config.api.reload,
        log_level=config.api.log_level
    )
