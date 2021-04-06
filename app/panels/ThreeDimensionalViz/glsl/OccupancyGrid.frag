precision lowp float;

varying vec2 uv;
varying float vAlpha;

uniform sampler2D palette;
uniform sampler2D data;

void main () {
  // look up the point in our data texture corresponding to
  // the current point being shaded
  vec4 point = texture2D(data, uv);

  // vec2(point.a, 0.5) is similar to textelFetch for webGL 1.0
  // it looks up a point along our 1 dimentional palette
  // http://www.lighthouse3d.com/tutorials/glsl-tutorial/texture-coordinates/
  gl_FragColor = texture2D(palette, vec2(point.a, 0.5));
  gl_FragColor.a *= vAlpha;
}
