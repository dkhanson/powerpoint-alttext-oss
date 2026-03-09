"""
Command Line Interface for PowerPoint Alt-Text Generator V2
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

from .config import get_config
from .core.processor import PowerPointProcessor
from .core.accessibility_scorer import AccessibilityScorer


def process_file(input_file: str, output_file: Optional[str] = None, **kwargs) -> int:
    """Process a single PowerPoint file."""
    processor = PowerPointProcessor()
    
    input_path = Path(input_file)
    if not input_path.exists():
        print(f"[ERROR] Input file not found: {input_file}")
        return 1

    if not input_path.suffix.lower() in ['.pptx', '.ppt']:
        print(f"[ERROR] Input file must be a PowerPoint presentation")
        return 1
    
    if output_file is None:
        output_file = f"{input_path.stem}_enhanced_v2.pptx"
    
    try:
        print(f"Processing: {input_file}")
        result = processor.process_presentation(input_file, output_file)
        
        if result.get('success'):
            print(f"[OK] Processed {result['processed_slides']} slides")
            print(f"Output saved to: {output_file}")
            return 0
        else:
            print(f"[ERROR] {result.get('error', 'Unknown error')}")
            return 1

    except Exception as e:
        print(f"[ERROR] Processing file: {e}")
        return 1


def score_file(input_file: str) -> int:
    """Score accessibility of a PowerPoint file."""
    scorer = AccessibilityScorer()
    
    input_path = Path(input_file)
    if not input_path.exists():
        print(f"[ERROR] Input file not found: {input_file}")
        return 1

    try:
        print(f"Analyzing accessibility: {input_file}")
        score_data = scorer.calculate_accessibility_score(input_file)
        
        if score_data.get('error'):
            print(f"[ERROR] {score_data['error']}")
            return 1

        # Print summary
        print(f"Accessibility Score: {score_data['overall_accessibility_score']}%")
        print(f"Level: {score_data['accessibility_level']}")
        print(f"Target Threshold: {score_data['target_threshold']}% ({'Met' if score_data['meets_target_threshold'] else 'Not Met'})")
        
        # Print detailed report
        report = scorer.generate_accessibility_report(score_data)
        report_file = f"{input_path.stem}_accessibility_report.md"
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"Detailed report saved to: {report_file}")
        
        return 0
        
    except Exception as e:
        print(f"[ERROR] Scoring file: {e}")
        return 1


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="PowerPoint Alt-Text Generator V2 - AI-powered accessibility enhancement"
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Process command
    process_parser = subparsers.add_parser('process', help='Process a PowerPoint file')
    process_parser.add_argument('input', help='Input PowerPoint file path')
    process_parser.add_argument('-o', '--output', help='Output file path (optional)')
    process_parser.add_argument('--force-regenerate', action='store_true', 
                               help='Force regeneration of existing alt-text')
    process_parser.add_argument('--no-slide-titles', action='store_true',
                               help='Skip slide title generation')
    
    # Score command
    score_parser = subparsers.add_parser('score', help='Score accessibility of a PowerPoint file')
    score_parser.add_argument('input', help='Input PowerPoint file path')
    
    # Config command
    config_parser = subparsers.add_parser('config', help='Show current configuration')
    
    # Version command
    version_parser = subparsers.add_parser('version', help='Show version information')
    
    args = parser.parse_args()
    
    if args.command == 'process':
        return process_file(
            args.input, 
            args.output,
            force_regenerate=args.force_regenerate,
            generate_slide_titles=not args.no_slide_titles
        )
    
    elif args.command == 'score':
        return score_file(args.input)
    
    elif args.command == 'config':
        config = get_config()
        print("Current Configuration:")
        print(f"  API Port: {config.api.port}")
        print(f"  Azure OpenAI Configured: {'Yes' if config.azure_openai.api_key else 'No'}")
        print(f"  Process Images: {'Yes' if config.processing.process_images else 'No'}")
        print(f"  Process Shapes: {'Yes' if config.processing.process_shapes else 'No'}")
        print(f"  Process Slide Titles: {'Yes' if config.processing.process_slide_titles else 'No'}")
        print(f"  Max Alt Text Length: {config.processing.max_alt_text_length}")
        print(f"  Target Score Threshold: {config.accessibility.target_score_threshold}%")
        return 0
    
    elif args.command == 'version':
        from . import __version__
        print(f"PowerPoint Alt-Text Generator V2: {__version__}")
        return 0
    
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())