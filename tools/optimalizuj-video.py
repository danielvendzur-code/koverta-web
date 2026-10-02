"""Rovnaký mobilný záber, rozmery, 25 fps a 11 s; rýchly začiatok MP4."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent.parent
source = root / 'assets/koverta-hero-sibenik-mobil.mp4'
target = root / 'assets/koverta-hero-sibenik-mobil-rychle.mp4'
subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source),
                '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
print(f'Mobilné video: {source.stat().st_size} → {target.stat().st_size} B')
page = root / 'index.html'
html = page.read_text().replace('koverta-hero-sibenik-mobil.mp4', target.name)
page.write_text(html)
