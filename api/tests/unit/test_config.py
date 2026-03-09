"""
Unit tests for configuration module
"""
import pytest
from pathlib import Path
from powerpoint_alttext_v2.config import get_config


class TestConfig:
    """Test configuration loading and validation."""
    
    def test_config_initialization(self):
        """Test that config initializes with defaults."""
        config = get_config()
        
        assert config.api.host == "0.0.0.0"
        assert config.api.port == 8001
        assert config.processing.process_images is True
        assert config.processing.process_shapes is True
        assert config.processing.max_alt_text_length == 180
    
    def test_azure_openai_config(self):
        """Test Azure OpenAI configuration."""
        config = get_config()
        
        assert hasattr(config, 'azure_openai')
        assert config.azure_openai.api_version == "2024-12-01-preview"
        assert config.azure_openai.model == "gpt-4o"
        assert config.azure_openai.max_tokens == 300
    
    def test_processing_config(self):
        """Test processing configuration."""
        config = get_config()
        
        assert config.processing.process_slide_titles is True
        assert config.processing.force_regenerate is False
        assert config.processing.enable_multithreading is True
        assert config.processing.max_concurrent_api_calls == 10
    
    def test_accessibility_config(self):
        """Test accessibility scoring configuration."""
        config = get_config()
        
        assert config.accessibility.target_score_threshold == 80.0
        assert config.accessibility.enable_scoring is True
    
    def test_get_config_singleton(self):
        """Test that get_config returns the same instance."""
        config1 = get_config()
        config2 = get_config()
        
        assert config1 is config2
