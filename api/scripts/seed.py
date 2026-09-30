"""Seed a demo login: a user, an organization and the sample knowledge base.

Run: `make seed` while `make dev` is running. It goes through the app itself:
Better Auth signs the user up (and hashes the password), and the API ingests
the documents from `docs/sample-knowledge-base/`. Safe to run again: what
already exists is kept.

For local use only: anyone who reads this file knows the password.
"""

import asyncio
import os
from pathlib import Path

import httpx

from echo_api.config import get_settings

EMAIL = "demo@example.com"
PASSWORD = "echo-demo-password"
NAME = "Demo Operator"
ORGANIZATION = "Acme Inc (demo)"
SLUG = "acme-demo"
DOCUMENTS = Path(__file__).resolve().parents[2] / "docs" / "sample-knowledge-base"
INGEST_TIMEOUT = 180  # seconds; OCR loads its model on first use


async def main() -> None:
    web = os.environ.get("BETTER_AUTH_URL", get_settings().better_auth_url)
    # Better Auth refuses state-changing requests without the app's Origin.
    async with httpx.AsyncClient(
        base_url=web, headers={"Origin": web}, timeout=120
    ) as http:
        credentials = {"email": EMAIL, "password": PASSWORD}
        signed_up = await http.post(
            "/api/auth/sign-up/email", json={**credentials, "name": NAME}
        )
        if signed_up.is_success:
            print(f"created {EMAIL}")
        else:  # already there: sign in instead (the cookie lands in `http`)
            (
                await http.post("/api/auth/sign-in/email", json=credentials)
            ).raise_for_status()

        organizations = (
            await http.get("/api/auth/organization/list")
        ).raise_for_status()
        organization = next(
            (o for o in organizations.json() if o["slug"] == SLUG), None
        )
        if organization is None:
            created = await http.post(
                "/api/auth/organization/create",
                json={"name": ORGANIZATION, "slug": SLUG},
            )
            organization = created.raise_for_status().json()
            print(f"created {ORGANIZATION}")
        await http.post(
            "/api/auth/organization/set-active",
            json={"organizationId": organization["id"]},
        )

        # The dashboard's route to the API: a short-lived JWT, through Next.js.
        token = (await http.get("/api/auth/token")).raise_for_status().json()["token"]
        api = {"Authorization": f"Bearer {token}"}
        present = {
            d["filename"] for d in (await http.get("/api/v1/files", headers=api)).json()
        }
        for path in sorted(DOCUMENTS.iterdir()):
            if path.name not in present:
                upload = await http.post(
                    "/api/v1/files",
                    headers=api,
                    files={"file": (path.name, path.read_bytes())},
                )
                upload.raise_for_status()
                print(f"uploaded {path.name}")

        for _ in range(INGEST_TIMEOUT):
            documents = (await http.get("/api/v1/files", headers=api)).json()
            if all(d["status"] != "processing" for d in documents):
                break
            await asyncio.sleep(1)
        for d in sorted(documents, key=lambda d: d["filename"]):
            detail = (
                f"{d['chunk_count']} chunks" if d["status"] == "ready" else d["error"]
            )
            print(f"  {d['filename']:36} {d['status']:10} {detail or ''}")

    print(f"""
Sign in at {web}
  email     {EMAIL}
  password  {PASSWORD}
Widget: {web}/widget?organizationId={organization["id"]}
Evals:  make eval ORG={organization["id"]}""")


if __name__ == "__main__":
    asyncio.run(main())
