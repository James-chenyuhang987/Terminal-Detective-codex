/** Owned material copies: loader caches and other actors remain immutable. */
export function fieldMaterial(source) {
  const material = source.clone();
  const grain = /skin|hair|lip/.test(source.name) ? .025 : /brass|blue|navy|floor|wear/.test(source.name) ? .065 : .045;
  material.onBeforeCompile = shader => {
    shader.uniforms.fieldGrain = { value: grain };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFieldCoord;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFieldCoord = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFieldCoord;\nuniform float fieldGrain;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat fieldSurface = fract(sin(dot(floor(vFieldCoord.xy * 240.0) + floor(vFieldCoord.z * 240.0), vec2(127.1, 311.7))) * 43758.5453);\nroughnessFactor = clamp(roughnessFactor + (fieldSurface - 0.5) * fieldGrain, 0.04, 1.0);\ndiffuseColor.rgb *= 0.986 + fieldSurface * 0.014;');
  };
  material.customProgramCacheKey = () => 'terminal-detective-field-grain-v1';
  return material;
}
