from pathlib import Path
import shutil
from PIL import Image, ImageDraw

REPO = Path(r"C:\Users\crja_\.gemini\antigravity\scratch\el_rayo_autodesign")
ANDROID_APP = REPO / "android_app" / "app"
ASSETS_DST = ANDROID_APP / "src" / "main" / "assets"
RES_DIR = ANDROID_APP / "src" / "main" / "res"


def sync_web_assets():
    if ASSETS_DST.exists():
        shutil.rmtree(ASSETS_DST)
    ASSETS_DST.mkdir(parents=True, exist_ok=True)

    shutil.copy2(REPO / "index.html", ASSETS_DST / "index.html")
    shutil.copy2(REPO / "logo_el_rayo.png", ASSETS_DST / "logo_el_rayo.png")

    ort_dst = ASSETS_DST / "assets" / "ort"
    ort_dst.mkdir(parents=True, exist_ok=True)
    for f in (REPO / "assets" / "ort").iterdir():
        if f.is_file():
            shutil.copy2(f, ort_dst / f.name)

    models_dst = ASSETS_DST / "assets" / "models"
    (models_dst / "carparts").mkdir(parents=True, exist_ok=True)
    shutil.copy2(
        REPO / "assets" / "models" / "segformer_b0_cityscapes_quant.onnx",
        models_dst / "segformer_b0_cityscapes_quant.onnx",
    )
    shutil.copy2(
        REPO / "assets" / "models" / "carparts" / "parts_segmentation.onnx",
        models_dst / "carparts" / "parts_segmentation.onnx",
    )
    print(f"Synced offline web & AI assets -> {ASSETS_DST}")


def generate_icons():
    logo = Image.open(REPO / "logo_el_rayo.png").convert("RGBA")
    # Remove unused adaptive XML & template webps so PNG mipmaps apply cleanly across all APIs
    for anydpi in (RES_DIR / "mipmap-anydpi-v26").glob("*"):
        anydpi.unlink()

    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, sz in sizes.items():
        mdir = RES_DIR / folder
        mdir.mkdir(parents=True, exist_ok=True)
        for old in mdir.glob("ic_launcher*.webp"):
            old.unlink()

        # Fit El Rayo logo centered inside dark metallic automotive emblem
        bg_square = Image.new("RGBA", (sz, sz), (248, 250, 252, 255))
        pad = int(sz * 0.10)
        box = sz - pad * 2
        ratio = min(box / logo.width, box / logo.height)
        nw = max(1, int(round(logo.width * ratio)))
        nh = max(1, int(round(logo.height * ratio)))
        resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
        ox = (sz - nw) // 2
        oy = (sz - nh) // 2
        bg_square.alpha_composite(resized, (ox, oy))
        bg_square.save(mdir / "ic_launcher.png")

        # Round variant with circular alpha mask
        mask = Image.new("L", (sz, sz), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, sz - 1, sz - 1), fill=255)
        round_img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        round_img.paste(bg_square, (0, 0), mask)
        round_img.save(mdir / "ic_launcher_round.png")
    print("Generated El Rayo mipmap PNG launcher icons.")


if __name__ == "__main__":
    sync_web_assets()
    generate_icons()
