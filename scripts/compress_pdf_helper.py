import fitz
import os
import sys
from PIL import Image
import io

def compress_pdf(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        return False

    try:
        doc = fitz.open(input_path)
        
        # Optimize images page by page
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            for img_info in image_list:
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    
                    image_bytes = base_image["image"]
                    
                    # Load with PIL
                    img = Image.open(io.BytesIO(image_bytes))
                    
                    # Convert to grayscale to save space, preserving transparency readability
                    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                        # Math equations or graphics are black text on transparent background.
                        # Overlaying onto a white background preserves legibility.
                        background = Image.new("L", img.size, 255) # Grayscale white background
                        rgba_img = img.convert("RGBA")
                        background.paste(rgba_img.convert("L"), mask=rgba_img.split()[-1])
                        img = background
                    else:
                        img = img.convert("L") # Simple grayscale
                        
                    # Downsample to 800px width max
                    width, height = img.size
                    if width > 800:
                        ratio = 800.0 / width
                        new_size = (800, int(height * ratio))
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                        
                    # Compress to JPEG
                    out_io = io.BytesIO()
                    img.save(out_io, format="JPEG", quality=40, optimize=True)
                    new_image_bytes = out_io.getvalue()
                    
                    # Replace inside PDF
                    page.replace_image(xref, stream=new_image_bytes)
                except Exception as e:
                    # Ignore individual image errors
                    pass

        # Save with maximal compression and garbage collection of duplicates
        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        return True
    except Exception as e:
        print(f"Error optimizing {input_path}: {e}")
        return False

if __name__ == "__main__":
    print(f"compress_pdf_helper.py starting with args: {sys.argv}")
    if len(sys.argv) < 3:
        print("Usage: python compress_pdf_helper.py <input_path> <output_path>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    success = compress_pdf(input_file, output_file)
    print(f"compress_pdf returned: {success}")
    if success:
        os._exit(0)
    else:
        os._exit(1)
