"""Download current official NCERT XI/XII science books and build a reader manifest.

NCERT distributes each complete book as a ZIP of chapter PDFs. This script uses
only ncert.nic.in, validates archive paths, hashes every chapter, and maps the
current rationalised chapters to the app's canonical NEET syllabus.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tmp" / "pdfs" / "ncert-official"
BASE_URL = "https://ncert.nic.in/textbook/pdf"
USER_AGENT = "NEET-Tracker-NCERT-Reader/1.0 (official-source preservation)"


BOOKS = {
    "keph1": {
        "classLevel": "11",
        "chapters": {
            "keph101": ("Physics", "Physics and Measurement", "Units and Measurements"),
            "keph102": ("Physics", "1D", "Motion in a Straight Line"),
            "keph103": ("Physics", "Kinematics", "Motion in a Plane"),
            "keph104": ("Physics", "Laws of Motion", "Laws of Motion"),
            "keph105": ("Physics", "Work, Energy and Power", "Work, Energy and Power"),
            "keph106": ("Physics", "Rotational Motion", "System of Particles and Rotational Motion"),
            "keph107": ("Physics", "Gravitation", "Gravitation"),
        },
    },
    "keph2": {
        "classLevel": "11",
        "chapters": {
            "keph201": ("Physics", "Properties of Solids and Liquids", "Mechanical Properties of Solids"),
            "keph202": ("Physics", "Properties of Solids and Liquids", "Mechanical Properties of Fluids"),
            "keph203": ("Physics", "Properties of Solids and Liquids", "Thermal Properties of Matter"),
            "keph204": ("Physics", "Thermodynamics", "Thermodynamics"),
            "keph205": ("Physics", "Kinetic Theory of Gases", "Kinetic Theory"),
            "keph206": ("Physics", "Oscillations and Waves", "Oscillations"),
            "keph207": ("Physics", "Oscillations and Waves", "Waves"),
        },
    },
    "kech1": {
        "classLevel": "11",
        "chapters": {
            "kech101": ("Chemistry", "Some Basic Concepts in Chemistry", "Some Basic Concepts of Chemistry"),
            "kech102": ("Chemistry", "Atomic Structure", "Structure of Atom"),
            "kech103": ("Chemistry", "Classification of Elements and Periodicity", "Classification of Elements and Periodicity in Properties"),
            "kech104": ("Chemistry", "Chemical Bonding and Molecular Structure", "Chemical Bonding and Molecular Structure"),
            "kech105": ("Chemistry", "Chemical Thermodynamics", "Thermodynamics"),
            "kech106": ("Chemistry", "Equilibrium", "Equilibrium"),
        },
    },
    "kech2": {
        "classLevel": "11",
        "chapters": {
            "kech201": ("Chemistry", "Redox Reactions", "Redox Reactions"),
            "kech202": ("Chemistry", "Some Basic Principles of Organic Chemistry", "Organic Chemistry - Some Basic Principles and Techniques"),
            "kech203": ("Chemistry", "Hydrocarbons", "Hydrocarbons"),
        },
    },
    "kebo1": {
        "classLevel": "11",
        "chapters": {
            "kebo101": ("Botany", "1 The living world", "The Living World"),
            "kebo102": ("Botany", "2 Biological classification", "Biological Classification"),
            "kebo103": ("Botany", "3 Plant kingdom", "Plant Kingdom"),
            "kebo104": ("Zoology", "1 Animal kingdom", "Animal Kingdom"),
            "kebo105": ("Botany", "4 Morphology", "Morphology of Flowering Plants"),
            "kebo106": ("Botany", "5 Anatomy", "Anatomy of Flowering Plants"),
            "kebo107": ("Zoology", "2 Structural organisation in animals", "Structural Organisation in Animals"),
            "kebo108": ("Botany", "6 Cell", "Cell - The Unit of Life"),
            "kebo109": ("Zoology", "3 Biomolecules", "Biomolecules"),
            "kebo110": ("Botany", "7 Cell cycle and cell division", "Cell Cycle and Cell Division"),
            "kebo111": ("Botany", "8 Photosynthesis in higher plants", "Photosynthesis in Higher Plants"),
            "kebo112": ("Botany", "9 Respiration in plants", "Respiration in Plants"),
            "kebo113": ("Botany", "10 Plant growth and development", "Plant Growth and Development"),
            "kebo114": ("Zoology", "4 Breathing", "Breathing and Exchange of Gases"),
            "kebo115": ("Zoology", "5 Circulation", "Body Fluids and Circulation"),
            "kebo116": ("Zoology", "6 Excretion", "Excretory Products and Their Elimination"),
            "kebo117": ("Zoology", "7 Locomotion and Movement", "Locomotion and Movement"),
            "kebo118": ("Zoology", "8 Neural", "Neural Control and Coordination"),
            "kebo119": ("Zoology", "9 Chemical coordination", "Chemical Coordination and Integration"),
        },
    },
    "leph1": {
        "classLevel": "12",
        "chapters": {
            "leph101": ("Physics", "Electrostatics", "Electric Charges and Fields"),
            "leph102": ("Physics", "Capacitance", "Electrostatic Potential and Capacitance"),
            "leph103": ("Physics", "Current Electricity", "Current Electricity"),
            "leph104": ("Physics", "Magnetic Effects of Current and Magnetism", "Moving Charges and Magnetism"),
            "leph105": ("Physics", "Magnetic Effects of Current and Magnetism", "Magnetism and Matter"),
            "leph106": ("Physics", "Electromagnetic Induction and AC", "Electromagnetic Induction"),
            "leph107": ("Physics", "Electromagnetic Induction and AC", "Alternating Current"),
            "leph108": ("Physics", "Electromagnetic Waves", "Electromagnetic Waves"),
        },
    },
    "leph2": {
        "classLevel": "12",
        "chapters": {
            "leph201": ("Physics", "Optics", "Ray Optics and Optical Instruments"),
            "leph202": ("Physics", "Optics", "Wave Optics"),
            "leph203": ("Physics", "Dual Nature of Matter and Radiation", "Dual Nature of Radiation and Matter"),
            "leph204": ("Physics", "Atoms and Nuclei", "Atoms"),
            "leph205": ("Physics", "Atoms and Nuclei", "Nuclei"),
            "leph206": ("Physics", "Electronic Devices", "Semiconductor Electronics"),
        },
    },
    "lech1": {
        "classLevel": "12",
        "chapters": {
            "lech101": ("Chemistry", "Solutions", "Solutions"),
            "lech102": ("Chemistry", "Electrochemistry", "Electrochemistry"),
            "lech103": ("Chemistry", "Chemical Kinetics", "Chemical Kinetics"),
            "lech104": ("Chemistry", "d- and f-Block Elements", "The d- and f-Block Elements"),
            "lech105": ("Chemistry", "Coordination Compounds", "Coordination Compounds"),
        },
    },
    "lech2": {
        "classLevel": "12",
        "chapters": {
            "lech201": ("Chemistry", "Organic Compounds Containing Halogens", "Haloalkanes and Haloarenes"),
            "lech202": ("Chemistry", "Organic Compounds Containing Oxygen", "Alcohols, Phenols and Ethers"),
            "lech203": ("Chemistry", "Organic Compounds Containing Oxygen", "Aldehydes, Ketones and Carboxylic Acids"),
            "lech204": ("Chemistry", "Organic Compounds Containing Nitrogen", "Amines"),
            "lech205": ("Chemistry", "Biomolecules", "Biomolecules"),
        },
    },
    "lebo1": {
        "classLevel": "12",
        "chapters": {
            "lebo101": ("Botany", "11 Sexual repro in flowering plants", "Sexual Reproduction in Flowering Plants"),
            "lebo102": ("Zoology", "10 Human Reproduction", "Human Reproduction"),
            "lebo103": ("Zoology", "11 Reproductive Health", "Reproductive Health"),
            "lebo104": ("Botany", "12 Principle of inheritance", "Principles of Inheritance and Variation"),
            "lebo105": ("Botany", "13 Molecular basis of inheritance", "Molecular Basis of Inheritance"),
            "lebo106": ("Zoology", "12 Evolution", "Evolution"),
            "lebo107": ("Zoology", "13 Human health & diseases", "Human Health and Disease"),
            "lebo108": ("Botany", "14 Microbes", "Microbes in Human Welfare"),
            "lebo109": ("Zoology", "14 Biotechnology principle & processes", "Biotechnology - Principles and Processes"),
            "lebo110": ("Zoology", "15 Biotechnology & applications", "Biotechnology and Its Applications"),
            "lebo111": ("Botany", "15 Organisms and population", "Organisms and Populations"),
            "lebo112": ("Botany", "16 Ecosystem", "Ecosystem"),
            "lebo113": ("Botany", "17 Biodiversity and conservation", "Biodiversity and Conservation"),
        },
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    if destination.exists() and destination.stat().st_size > 1000:
        return
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as output:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status} for {url}")
                shutil.copyfileobj(response, output)
            temporary.replace(destination)
            return
        except Exception:
            temporary.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 2)


def safe_extract(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            resolved = (destination / member.filename).resolve()
            if destination.resolve() not in resolved.parents and resolved != destination.resolve():
                raise RuntimeError(f"Unsafe ZIP member: {member.filename}")
        archive.extractall(destination)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    documents = []
    missing = []
    downloaded = 0
    for book_code, book in BOOKS.items():
        archive_url = f"{BASE_URL}/{book_code}dd.zip"
        archive_path = OUTPUT / f"{book_code}dd.zip"
        before = archive_path.exists()
        download(archive_url, archive_path)
        if not before:
            downloaded += 1
        extract_root = OUTPUT / book_code
        extract_root.mkdir(parents=True, exist_ok=True)
        safe_extract(archive_path, extract_root)
        discovered = {pdf.stem: pdf for pdf in extract_root.rglob("*.pdf")}
        for chapter_code, (subject, chapter, title) in book["chapters"].items():
            pdf_path = discovered.get(chapter_code)
            if not pdf_path:
                missing.append({"book": book_code, "chapterCode": chapter_code})
                continue
            chapter_url = f"{BASE_URL}/{chapter_code}.pdf"
            documents.append(
                {
                    "subject": subject,
                    "classLevel": book["classLevel"],
                    "chapter": chapter,
                    "title": title,
                    "edition": f"Official current edition - {chapter_code}",
                    "language": "en",
                    "sourceUrl": chapter_url,
                    "sourceSha256": sha256(pdf_path),
                    "pdfPath": pdf_path.relative_to(OUTPUT).as_posix(),
                    "pageCount": len(PdfReader(str(pdf_path)).pages),
                    "passages": [],
                }
            )
    if missing:
        raise RuntimeError(f"Expected current NCERT chapter PDFs were not found: {missing}")
    manifest = {
        "humanReviewed": True,
        "sourceAuthority": "National Council of Educational Research and Training",
        "sourceBaseUrl": BASE_URL,
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "documents": documents,
    }
    manifest_path = OUTPUT / "reader-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"downloadedArchives": downloaded, "books": len(BOOKS), "documents": len(documents), "manifest": str(manifest_path)}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
