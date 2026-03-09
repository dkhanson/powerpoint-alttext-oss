"""
Configuration management for PowerPoint Alt-text Generator V2
"""

import os
import tomllib
from pathlib import Path
from typing import Any, Dict, Optional, List
from dataclasses import dataclass, field


@dataclass
class APIConfig:
    """API configuration settings."""
    host: str = "0.0.0.0"
    port: int = 8001
    reload: bool = True
    log_level: str = "info"
    max_file_size_mb: int = 500
    timeout_seconds: int = 300
    cors_origins: List[str] = None

    def __post_init__(self):
        if self.cors_origins is None:
            self.cors_origins = ["*"]


@dataclass
class AzureOpenAIConfig:
    """OpenAI / Azure OpenAI configuration settings."""
    provider: str = "auto"
    endpoint: str = ""
    api_key: str = ""
    api_version: str = "2024-12-01-preview"
    model: str = "gpt-4o"
    max_tokens: int = 300
    temperature: float = 0.3
    prompt_template: str = "Describe the image in concise alt text (max {max_length} chars)."

    def __post_init__(self):
        # Try to get from environment if not set
        if not self.api_key:
            self.api_key = os.getenv("AZURE_OPENAI_API_KEY", "")
        if not self.endpoint:
            self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")

        # Support standard OpenAI key as fallback
        if not self.api_key:
            self.api_key = os.getenv("OPENAI_API_KEY", "")
        if not self.endpoint:
            self.endpoint = os.getenv("OPENAI_ENDPOINT", "")


@dataclass
class ProcessingConfig:
    """Processing configuration settings."""
    temp_dir: str = "temp_uploads"
    results_dir: str = "api_results"
    backup_originals: bool = True
    process_images: bool = True
    process_shapes: bool = True
    process_slide_titles: bool = True
    force_regenerate: bool = False
    force_regenerate_slide_titles: bool = False
    enable_multithreading: bool = True
    max_concurrent_api_calls: int = 10
    max_alt_text_length: int = 180
    deduplicate_titles: bool = True
    rename_shapes_with_index: bool = False
    images_and_decorators_only: bool = False
    skip_objects_with_text: bool = False
    skip_text_boxes: bool = False
    api_timeout_seconds: int = 30
    max_retries: int = 2
    enable_image_caching: bool = True
    parallel_slide_processing: bool = False
    max_slides_parallel: int = 3

    def __post_init__(self):
        if os.getenv("PROCESSING_FORCE_REGENERATE"):
            self.force_regenerate = os.getenv("PROCESSING_FORCE_REGENERATE", "false").lower() in ("true", "1", "yes")
        if os.getenv("PROCESSING_ENABLE_MULTITHREADING"):
            self.enable_multithreading = os.getenv("PROCESSING_ENABLE_MULTITHREADING", "true").lower() in ("true", "1", "yes")
        if os.getenv("PROCESSING_MAX_CONCURRENT_API_CALLS"):
            self.max_concurrent_api_calls = int(os.getenv("PROCESSING_MAX_CONCURRENT_API_CALLS", "10"))


@dataclass
class AccessibilityConfig:
    """Accessibility configuration settings."""
    target_score_threshold: float = 80.0
    enable_scoring: bool = True


@dataclass
class AuthConfig:
    """Authentication and authorization settings."""
    require_auth: bool = False
    issuer: str = ""
    audience: str = ""
    jwks_url: str = ""
    algorithms: list = field(default_factory=lambda: ["RS256"])


@dataclass
class Config:
    """Main configuration container."""
    api: APIConfig
    azure_openai: AzureOpenAIConfig
    processing: ProcessingConfig
    accessibility: AccessibilityConfig
    auth: AuthConfig

    @classmethod
    def load_from_file(cls, config_path: Optional[Path] = None) -> "Config":
        """Load configuration from TOML file."""
        if config_path is None:
            possible_paths = [
                Path("config.toml"),
                Path("powerpoint_alttext_v2.toml"),
                Path.home() / ".powerpoint_alttext_v2.toml",
                Path(__file__).parent / "default.toml"
            ]

            for path in possible_paths:
                if path.exists():
                    config_path = path
                    break
            else:
                raise FileNotFoundError("No configuration file found")

        with open(config_path, "rb") as f:
            data = tomllib.load(f)

        return cls(
            api=APIConfig(**data.get("api", {})),
            azure_openai=AzureOpenAIConfig(**data.get("azure_openai", {})),
            processing=ProcessingConfig(**data.get("processing", {})),
            accessibility=AccessibilityConfig(**data.get("accessibility", {})),
            auth=AuthConfig(**data.get("auth", {}))
        )

    @classmethod
    def load_default(cls) -> "Config":
        """Load default configuration."""
        default_path = Path(__file__).parent / "default.toml"
        return cls.load_from_file(default_path)


# Global configuration instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        try:
            _config = Config.load_from_file()
        except FileNotFoundError:
            _config = Config.load_default()
    return _config


def reload_config(config_path: Optional[Path] = None) -> Config:
    """Reload configuration from file."""
    global _config
    if config_path:
        _config = Config.load_from_file(config_path)
    else:
        _config = Config.load_from_file()
    return _config
