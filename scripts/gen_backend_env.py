"""Create backend/.env from backend/.env.example on first run.

Never overwrites an existing backend/.env (local secrets/edits are
preserved on re-runs). Fills in real ADMIN_API_KEY/JWT_SECRET_KEY values
in place of the "change_me_in_production" placeholders, the same values
backend/README.md's Setup step 2 says to generate by hand with
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.

Run via `make backend-env`, or directly: python3 scripts/gen_backend_env.py
"""
import re
import secrets
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "backend" / ".env"
EXAMPLE_PATH = REPO_ROOT / "backend" / ".env.example"


def main() -> None:
    if ENV_PATH.exists():
        print("backend/.env already exists, leaving it alone")
        return

    text = EXAMPLE_PATH.read_text()
    text = re.sub(r"ADMIN_API_KEY=.*", f"ADMIN_API_KEY={secrets.token_urlsafe(32)}", text)
    text = re.sub(r"JWT_SECRET_KEY=.*", f"JWT_SECRET_KEY={secrets.token_urlsafe(32)}", text)
    ENV_PATH.write_text(text)
    print("created backend/.env with generated ADMIN_API_KEY/JWT_SECRET_KEY")


if __name__ == "__main__":
    main()
