uniform float uTime;
uniform float uIntensity;
uniform float uActivation;
varying vec2 vUv;

// Distance bands produce antialiased circles without a texture.
float ring(float radius, float center, float width) {
  float edge = max(fwidth(radius), 0.001);
  return 1.0 - smoothstep(width, width + edge, abs(radius - center));
}

void main() {
  vec2 point = vUv - 0.5;
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float rotation = uTime * 0.08;

  float outer = ring(radius, 0.445, 0.003) + ring(radius, 0.415, 0.002);
  float inner = ring(radius, 0.285, 0.0025) + ring(radius, 0.095, 0.002);
  float segments = smoothstep(0.2, 0.55, sin((angle + rotation) * 12.0));
  float arcs = ring(radius, 0.355, 0.008) * segments;

  float radialBand = smoothstep(0.31, 0.32, radius) * (1.0 - smoothstep(0.39, 0.40, radius));
  float marks = (1.0 - smoothstep(0.04, 0.09, abs(sin((angle - rotation) * 12.0)))) * radialBand;
  float petals = ring(radius, 0.18 + 0.035 * cos(angle * 6.0 + rotation), 0.0025);
  float pattern = clamp(outer + inner + arcs + marks + petals, 0.0, 1.0);

  float edgeFade = 1.0 - smoothstep(0.455, 0.49, radius);
  float halo = (1.0 - smoothstep(0.0, 0.055, abs(radius - 0.435))) * 0.09;
  float pulse = 0.94 + 0.06 * sin(uTime * 1.4);
  vec3 color = mix(vec3(0.12, 0.20, 0.48), vec3(0.85, 0.53, 0.20), uActivation * 0.82);
  float alpha = clamp((pattern * 0.78 + halo) * edgeFade, 0.0, 0.85);

  gl_FragColor = vec4(color * uIntensity * pulse, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
