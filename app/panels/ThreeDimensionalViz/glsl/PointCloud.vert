precision mediump float;

// this comes from the camera
uniform mat4 projection, view;

#WITH_POSE

attribute vec3 position;
attribute vec3 color; // color values in range [0-255]

uniform float pointSize;
uniform int colorMode;
uniform vec4 flatColor;
uniform vec4 minGradientColor;
uniform vec4 maxGradientColor;
uniform float minColorFieldValue;
uniform float maxColorFieldValue;

varying vec3 fragColor;

float getFieldValue() {
  return color.x;
}

float getFieldValue_UNORM() {
  float value = getFieldValue();
  float colorFieldRange = maxColorFieldValue - minColorFieldValue;
  if (abs(colorFieldRange) < 0.00001) {
    return 0.0;
  }
  return max(0.0, min((value - minColorFieldValue) / colorFieldRange, 1.0));
}

vec3 gradientColor() {
  float pct = getFieldValue_UNORM();
  return mix(minGradientColor, maxGradientColor, pct).rgb;
}

// taken from http://docs.ros.org/jade/api/rviz/html/c++/point__cloud__transformers_8cpp_source.html
// line 47
vec3 rainbowColor() {
  float pct = getFieldValue_UNORM();
  float h = (1.0 - pct) * 5.0 + 1.0;
  float i = floor(h);
  float f = fract(h);
  // if i is even
  if (mod(i, 2.0) < 1.0) {
    f = 1.0 - f;
  }
  float n = 1.0 - f;
  vec3 ret = vec3(0);
  if (i <= 1.0) {
    ret = vec3(n, 0.0, 1.0);
  } else if (i == 2.0) {
    ret = vec3(0.0, n, 1.0);
  } else if (i == 3.0) {
    ret = vec3(0.0, 1.0, n);
  } else if (i == 4.0) {
    ret = vec3(n, 1.0, 0.0);
  } else {
    ret = vec3(1.0, n, 0.0);
  }
  return 255.0 * ret;
}

void main () {
  gl_PointSize = pointSize;
  vec3 p = applyPose(position);
  gl_Position = projection * view * vec4(p, 1);

  if (colorMode == ${COLOR_MODE_GRADIENT}) {
    fragColor = gradientColor();
  } else if (colorMode == ${COLOR_MODE_RAINBOW}) {
    fragColor = rainbowColor();
  } else if (colorMode == ${COLOR_MODE_BGR}) {
    fragColor = vec3(color.b, color.g, color.r);
  } else if (colorMode == ${COLOR_MODE_RGB}) {
    fragColor = color;
  } else {
    fragColor = flatColor.rgb;
  }
}
