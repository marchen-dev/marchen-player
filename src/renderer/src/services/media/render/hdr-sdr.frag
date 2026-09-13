#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D yPlane;
uniform usampler2D uPlane;
uniform usampler2D vPlane;
uniform vec4 visible;
uniform float codeScale;
uniform bool fullRange;
uniform bool hlg;
in vec2 uv;
out vec4 color;
float pq(float value) {
  float p = pow(max(value, 0.0), 1.0 / 78.84375);
  return 100.0 * pow(max(p - 0.8359375, 0.0) / max(18.8515625 - 18.6875 * p, 0.000001), 1.0 / 0.1593017578125);
}
float inverseHlg(float value) {
  return value <= 0.5 ? value * value / 3.0 : (exp((value - 0.55991073) / 0.17883277) + 0.28466892) / 12.0;
}
float hable(float value) {
  return ((value * (0.15 * value + 0.05) + 0.004) / (value * (0.15 * value + 0.5) + 0.06)) - 0.0666666667;
}
float srgb(float value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}
void main() {
  ivec2 pixel = ivec2(visible.xy + min(floor(vec2(uv.x, 1.0 - uv.y) * visible.zw), visible.zw - 1.0));
  float y = float(texelFetch(yPlane, pixel, 0).r);
  float u = float(texelFetch(uPlane, pixel / 2, 0).r);
  float v = float(texelFetch(vPlane, pixel / 2, 0).r);
  if (fullRange) {
    y /= codeScale * 256.0 - 1.0;
    u = (u - codeScale * 128.0) / (codeScale * 256.0 - 1.0);
    v = (v - codeScale * 128.0) / (codeScale * 256.0 - 1.0);
  } else {
    y = (y - codeScale * 16.0) / (codeScale * 219.0);
    u = (u - codeScale * 128.0) / (codeScale * 224.0);
    v = (v - codeScale * 128.0) / (codeScale * 224.0);
  }
  vec3 signal = max(vec3(y + 1.4746 * v, y - 0.1645531268 * u - 0.5713531268 * v, y + 1.8814 * u), 0.0);
  vec3 linear;
  if (hlg) {
    linear = vec3(inverseHlg(signal.r), inverseHlg(signal.g), inverseHlg(signal.b));
    float luminance = dot(linear, vec3(0.2627, 0.6780, 0.0593));
    linear *= 10.0 * pow(max(luminance, 0.0), 0.2);
  } else {
    linear = vec3(pq(signal.r), pq(signal.g), pq(signal.b));
  }
  linear = mat3(1.660491, -0.124550, -0.018151, -0.587641, 1.132900, -0.100579, -0.072850, -0.008349, 1.118730) * linear;
  float peak = max(max(linear.r, linear.g), max(linear.b, 0.000001));
  linear *= hable(peak) / hable(10.0) / peak;
  linear = clamp(linear, 0.0, 1.0);
  color = vec4(srgb(linear.r), srgb(linear.g), srgb(linear.b), 1.0);
}
