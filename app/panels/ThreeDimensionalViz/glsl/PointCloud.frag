precision mediump float;
varying vec3 fragColor;
uniform bool isCircle;

void main () {
  if (isCircle) {
    // gl_PointCoord give us the coordinate of this pixel relative to the current point's position
    // In order to render a circle, we normalize and compute the distance from the current point.
    // Discard any fragments that are too far away from the center
    vec3 normal;
    normal.xy = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(normal.xy, normal.xy);
    if (r2 > 1.0) {
      discard;
    }
  }
  gl_FragColor = vec4(fragColor / 255.0, 1.0);
}
