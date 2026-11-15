"""Generate the opaque BHU icon and launch assets from the existing green brand.
These are reviewable candidate artwork, not App Store screenshots.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def mark(size):
    image = Image.new('RGB', (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t=y/max(1,size-1)
        color=tuple(round(a+(b-a)*t) for a,b in zip((6,59,44),(8,127,91)))
        draw.line((0,y,size,y),fill=color)
    margin=round(size*.19)
    draw.rounded_rectangle((margin,margin,size-margin,size-margin), radius=round(size*.105),outline=(181,239,209),width=max(1,round(size*.012)))
    font=ImageFont.truetype(FONT,round(size*.20))
    draw.text((size/2,size*.40),'BHU',font=font,fill=(255,255,255),anchor='mm')
    for row,width in enumerate((.36,.25,.32)):
        y=round(size*(.57+row*.075));x=round(size*.32)
        draw.rounded_rectangle((x,y,x+round(size*width),y+round(size*.019)),radius=max(1,round(size*.009)),fill=(160,226,191))
    return image

icons = ROOT/'ios/App/App/Assets.xcassets/AppIcon.appiconset'
icons.mkdir(parents=True,exist_ok=True)
mark(1024).save(icons/'AppIcon-512@2x.png',optimize=True)
splash=Image.new('RGB',(2732,2732),(245,248,246))
symbol=mark(500);splash.paste(symbol,((2732-500)//2,(2732-500)//2))
folder=ROOT/'ios/App/App/Assets.xcassets/Splash.imageset'
for name in ('splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'):
    splash.save(folder/name,optimize=True)
print('Generated opaque 1024px BHU icon and three launch images.')
