"""Create reader-safe NCERT copies whose PDF title and filename are the chapter title.

The official source cache remains untouched. Derived asset hashes are recorded so
the reader can serve a pleasant filename while retaining the original provenance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return clean or "ncert-chapter"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    root = manifest_path.parent
    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = []

    for index, document in enumerate(manifest["documents"], start=1):
        source_path = root / document["pdfPath"]
        relative = Path(f"class-{document['classLevel']}") / slug(document["subject"]) / f"{slug(document['title'])}.pdf"
        destination = output_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        reader = PdfReader(source_path)
        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        metadata = {str(key): str(value) for key, value in (reader.metadata or {}).items() if value is not None}
        metadata["/Title"] = document["title"]
        metadata["/Subject"] = f"NCERT Class {document['classLevel']} {document['subject']}"
        writer.add_metadata(metadata)
        with destination.open("wb") as handle:
            writer.write(handle)
        assets.append({
            "sourceSha256": document["sourceSha256"],
            "title": document["title"],
            "derivedPath": destination.as_posix(),
            "derivedSha256": sha256(destination),
            "bytes": destination.stat().st_size,
        })
        print(f"Named {index}/{len(manifest['documents'])}: {document['title']}", flush=True)

    report = Path(args.report).resolve()
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"assets": assets}, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(report), "assets": len(assets)}, indent=2))


if __name__ == "__main__":
    main()
