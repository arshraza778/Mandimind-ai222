"""
Root wrapper for Mitanin Signal pipeline CLI.
Allows running:
    python -m pipeline refresh
as well as:
    python -m backend.pipeline refresh
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).resolve().parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from backend.pipeline import main

if __name__ == "__main__":
    main()
