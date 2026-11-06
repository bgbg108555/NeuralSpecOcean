from pathlib import Path
import json

b = Path(__file__).resolve().parent


def compact_floats(obj):
    if isinstance(obj, float):
        return round(obj, 4)
    if isinstance(obj, list):
        return [compact_floats(v) for v in obj]
    if isinstance(obj, dict):
        return {k: compact_floats(v) for k, v in obj.items()}
    return obj


data = {k: compact_floats(json.loads((b / 'offline-terrain' / f'{k}.json').read_text(encoding='utf-8'))) for k in ['baseline', 'sandbar']}
(b / 'src' / 'TerrainData.js').write_text('const prebakedTerrain=' + json.dumps(data, separators=(',', ':')) + ';\n', encoding='utf-8')

names = [
    'TerrainBake',
    'TerrainData',
    'TerrainRuntime',
    'PBRShading',
    'NasaStarMap',
    'SkyCloudEnv',
    'RockShadowPass',
    'CinemaPostPass',
    'Bathymetry',
    'CoastalWaves',
    'SwashRigGPU',
    'DetailTexture',
    'FoamTexture',
    'SplashFlipbook',
    'SpectralWaves',
    'MidWave',
    'FoamField',
    'FoamWorld',
    'ShoreVisual',
    'CoastalRocks',
    'Beach',
    'UnderwaterLighting',
    'UnderwaterBoundary',
    'Offshore',
    'FoamShader',
    'RockSplashSystem',
    'OceanAudio',
    'OceanRing',
    'DepthCapture',
    'UnderwaterReflection',
    'UnderwaterPass',
    'PerfMonitor',
]

module_code = '\n'.join(
    (b / 'src' / f'{n}.js').read_text(encoding='utf-8').replace('export const ', 'const ').replace('export function ', 'function ')
    for n in names
)

code = (
    (b / 'three-bundle.js').read_text(encoding='utf-8')
    + '\n'
    + module_code
    + '\n'
    + (b / 'demo.js').read_text(encoding='utf-8')
)

html = (b / 'template.html').read_text(encoding='utf-8').replace('/*BUNDLE*/', code)
out_source = b / 'Underwater_Water.html'
out_root = b.parent / '完整海景.html'
out_index = b.parent / 'index.html'
out_source.write_text(html, encoding='utf-8')
out_root.write_text(html, encoding='utf-8')
out_index.write_text(html, encoding='utf-8')
print(f'Built {out_index} & {out_root} ({out_index.stat().st_size / (1024*1024):.2f} MB)')
