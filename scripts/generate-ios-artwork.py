"""Validate and copy the canonical BHU app icon without transforming its bytes.

Requires Pillow for read-only PNG validation. Launch artwork is maintained
separately; this command only manages the existing AppIcon image slot.
"""
import argparse
import hashlib
from io import BytesIO
from pathlib import Path
import os
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / 'assets/branding/BHU-AppIcon-1024.png'
APP_ICON = ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'


def validate_icon(payload):
    with Image.open(BytesIO(payload)) as image:
        if image.format != 'PNG' or image.size != (1024, 1024):
            raise ValueError('Canonical icon must be a 1024x1024 PNG.')
        if getattr(image, 'is_animated', False):
            raise ValueError('Canonical icon must be a single, static PNG.')
        if 'A' in image.getbands() or 'transparency' in image.info:
            raise ValueError('App Store icon must have no alpha channel or transparency metadata; provide an opaque source PNG.')
        image.verify()
    # Decode as well as verifying PNG integrity before changing the asset slot.
    with Image.open(BytesIO(payload)) as image:
        image.load()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate that the bundled icon matches the canonical source; write nothing')
    args = parser.parse_args()
    try:
        payload = CANONICAL.read_bytes()
        validate_icon(payload)
        if args.check:
            if APP_ICON.read_bytes() != payload:
                raise ValueError('AppIcon differs from the canonical source. Run python3 scripts/generate-ios-artwork.py.')
        else:
            APP_ICON.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=APP_ICON.parent, prefix='.AppIcon-', suffix='.tmp', delete=False) as output:
                    temporary = Path(output.name)
                    output.write(payload)
                os.replace(temporary, APP_ICON)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
    except (OSError, ValueError, SyntaxError) as error:
        parser.exit(1, f'Icon validation failed: {error}\n')
    action = 'Verified' if args.check else 'Copied'
    print(f'{action} canonical BHU icon byte-for-byte: {hashlib.sha256(payload).hexdigest()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
