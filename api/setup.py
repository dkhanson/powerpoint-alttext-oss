"""
Setup configuration for PowerPoint Alt-Text Generator V2
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read the README file
readme_path = Path(__file__).parent.parent / "README.md"
try:
    long_description = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""
except:
    long_description = "AI-powered PowerPoint accessibility enhancement tool (V2 - TOML-based)"

setup(
    name="powerpoint-alttext-v2",
    version="2.0.0",
    author="PowerPoint Alt-Text Generator Team",
    author_email="your-email@example.com",
    description="AI-powered PowerPoint accessibility enhancement tool (V2 - TOML-based)",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/dkhanson/PowerPointAltText",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Education",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Office/Business :: Office Suites",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires=">=3.8",
    install_requires=[
        "python-pptx>=0.6.21",
        "openai>=1.0.0",
        "fastapi>=0.100.0",
        "uvicorn[standard]>=0.22.0",
        "python-multipart>=0.0.6",
        "PyJWT[crypto]>=2.10.0",
        "Pillow>=9.0.0",  # For image resizing and optimization
        "tomllib-w; python_version<'3.11'",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=22.0.0",
            "flake8>=5.0.0",
            "mypy>=1.0.0",
        ],
        "api": [
            "fastapi>=0.100.0",
            "uvicorn[standard]>=0.22.0",
            "python-multipart>=0.0.6",
        ],
    },
    entry_points={
        "console_scripts": [
            "pptx-alttext-v2=powerpoint_alttext_v2.cli:main",
        ],
    },
    package_data={
        "powerpoint_alttext_v2": [
            "config/*.toml",
        ],
    },
    include_package_data=True,
)
