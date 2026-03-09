"""Core processing modules for PowerPoint Alt-Text Generator V2."""

from .processor import PowerPointProcessor
from .accessibility_scorer import AccessibilityScorer

__all__ = ["PowerPointProcessor", "AccessibilityScorer"]