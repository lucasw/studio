precision lowp float;

uniform mat4 projection, view;
uniform vec3 offset;
uniform vec4 orientation;
uniform float width, height, resolution, alpha;

attribute vec3 point;

#WITH_POSE

varying vec2 uv;
varying float vAlpha;

void main () {
  // set the texture uv to the unscaled vertext point
  uv = vec2(point.x, point.y);

  // compute the plane vertex dimensions
  float planeWidth = width * resolution;
  float planeHeight = height * resolution;

  // rotate the point by the ogrid orientation & scale the point by the plane vertex dimensions
  vec3 position = rotate(point, orientation) * vec3(planeWidth, planeHeight, 1.);

  // move the vertex by the marker offset
  vec3 loc = applyPose(position + offset);
  vAlpha = alpha;
  gl_Position = projection * view * vec4(loc, 1);
}
