from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"E:\projects\questions-bank\zoology\kattar\Animal Kingdom  Kattar NEET 2026  Zoology By Dr. Akanksha Agarwal Ma'am.pdf")
OUTPUT_DIR = ROOT / "public" / "bank-visuals" / "zoology" / "verified"

# Boxes were visually adjudicated against 130-dpi full-page renders. They contain
# only the figure needed to answer the question, avoiding duplicated stem/options.
VISUALS = {
    7: {"page": 2, "box_130": (88, 65, 410, 275), "name": "animal-kingdom-q07-body-cavity.webp"},
    34: {"page": 7, "box_130": (170, 530, 465, 682), "name": "animal-kingdom-q34-chordate-features.webp"},
    41: {"page": 8, "box_130": (675, 205, 1020, 360), "name": "animal-kingdom-q41-body-cavities.webp"},
    45: {"page": 9, "box_130": (620, 124, 1065, 376), "name": "animal-kingdom-q45-vertebrata-flowchart.webp"},
    48: {"page": 10, "box_130": (265, 325, 390, 620), "name": "animal-kingdom-q48-hirudinaria.webp"},
}


def render_page(document: pdfium.PdfDocument, page_number: int) -> Image.Image:
    page = document[page_number - 1]
    return page.render(scale=260 / 72).to_pil().convert("RGB")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(PDF_PATH)
    report = []
    scale = 2.0  # 260-dpi render divided by the 130-dpi adjudication coordinate space.
    for question_number, spec in VISUALS.items():
        page_image = render_page(document, spec["page"])
        box = tuple(round(value * scale) for value in spec["box_130"])
        crop = page_image.crop(box)
        crop = ImageOps.expand(crop, border=24, fill="white")
        output_path = OUTPUT_DIR / spec["name"]
        crop.save(output_path, "WEBP", lossless=True, method=6)
        report.append({
            "questionNumber": question_number,
            "page": spec["page"],
            "output": str(output_path.relative_to(ROOT)).replace("\\", "/"),
            "width": crop.width,
            "height": crop.height,
            "bytes": output_path.stat().st_size,
        })
    print(report)


if __name__ == "__main__":
    main()
