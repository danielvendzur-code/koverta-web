"""Restore the exact Poly Haven CC0 inputs. No Blender or authenticated download.
Usage: python konfigurator/tools/fetch-bistro-source.py /tmp/koverta-bistro
Then: python konfigurator/tools/build-scene-assets.py /tmp/koverta-bistro
"""
import hashlib,json,pathlib,sys,urllib.request
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
manifest=json.loads(pathlib.Path(__file__).with_name('bistro-source.json').read_text())
for name,source in manifest.items():
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==source['sha256']:continue
    with urllib.request.urlopen(source['url'],timeout=60) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=source['sha256']:raise ValueError('Source checksum mismatch: '+name)
    p.write_bytes(data)
print('Verified Poly Haven bistro source ready:',root)
