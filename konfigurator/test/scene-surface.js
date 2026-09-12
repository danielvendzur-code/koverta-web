const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const box={window:{}};vm.runInNewContext(fs.readFileSync('konfigurator/scene-surface.js','utf8'),box);
const {build,packed}=box.window.SP_SURFACE;
// Sloped sheet, overlapping table, and an actual opening between two sheets.
const surface=build([[[0,0,100],[100,0,200],[100,100,200],[0,100,100]],[[30,30,250],[50,30,250],[50,50,250],[30,50,250]]]);
assert.equal(surface.hit(20,70).z,120);assert.equal(surface.hit(40,40).z,250);assert.equal(surface.hit(-1,50),null);
const gap=build([[[0,0,100],[40,0,100],[40,100,100],[0,100,100]],[[60,0,100],[100,0,100],[100,100,100],[60,100,100]]]);
assert.equal(gap.hit(50,50),null);assert.equal(gap.hit(30,50).z,100);
const buffer=zlib.gunzipSync(fs.readFileSync('konfigurator/scene-assets/touring-sedan.bin.gz'));
const car=packed(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
const hood=car.hit(600,0),roof=car.hit(2800,0),boot=car.hit(4400,0);
assert(hood.z<1100&&roof.z>1400&&boot.z<1200,'rain must meet actual hood/roof/boot, not one elevated box');
assert(car.hit(2800,1100)===null,'no rain collision outside car');
assert(roof.normal[2]>.8);
console.log('Precipitation surfaces PASS: true height, openings, overlaps, normals, car hood/roof/boot.');
