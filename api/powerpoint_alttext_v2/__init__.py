"""
PowerPoint Alt-Text Generator V2

A modern, TOML-configured PowerPoint accessibility enhancement tool
based on the working scripts version.
"""

__version__ = "2.0.0"
__author__ = "PowerPoint Alt-Text Generator Team"

from .config import get_config, Config
from .core.processor import PowerPointProcessor
from .core.accessibility_scorer import AccessibilityScorer

__all__ = [
    "get_config",
    "Config", 
    "PowerPointProcessor",
    "AccessibilityScorer"
]