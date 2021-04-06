precision mediump float;

uniform mat4 projection, view;

#WITH_POSE

uniform float pointSize;
uniform float angle_min;
uniform float angle_increment;
uniform float range_min;
uniform float range_max;
uniform bool isHitmap;
uniform vec4 color;

attribute float index;
attribute float range;
attribute float intensity;
attribute vec4 hitmapColor;

varying vec4 vColor;

void main () {
  float angle = angle_min + index * angle_increment;
  vec3 p = applyPose(vec3(range * cos(angle), range * sin(angle), 0));

  gl_Position = projection * view * vec4(p, 1);
  gl_PointSize = pointSize;

  if (range < range_min || range > range_max || intensity == 0.0) {
    gl_PointSize = 0.;
  }
  vColor = isHitmap ? hitmapColor : color;
}
