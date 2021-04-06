precision mediump float;
varying vec4 vColor;
uniform bool isCircle;

void main () {
  if (isCircle && length(gl_PointCoord * 2.0 - 1.0) > 1.0) {
    discard;
  }

  gl_FragColor = vColor;
}
