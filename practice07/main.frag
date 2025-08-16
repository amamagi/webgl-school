precision mediump float;

uniform sampler2D textureUnit0;
uniform sampler2D textureUnit1;
uniform vec3 eyePos;

varying vec3 vPos;
varying vec3 vNorm;
varying vec4 vColor;
varying vec2 vTexCoord; // テクスチャ座標 @@@

void main() {
  vec4 textureColor0 = texture2D(textureUnit0, vTexCoord);
  vec4 textureColor1 = texture2D(textureUnit1, vTexCoord);

  // 法線ベクトルと視線ベクトルを取得
  vec3 n = normalize(vNorm);
  vec3 e = normalize(eyePos - vPos);

  // Y平面への射影を取得
  vec3 nYPlain = normalize(vec3(n.x, 0, n.z));
  vec3 eYPlain = normalize(vec3(e.x, 0, e.z));

  // 外積の大きさ（ベクトルのなす角のsin）をブレンディングのウェイトとする
  vec3 c = cross(nYPlain, eYPlain);
  float weight = 0.5 + sign(c.y) * length(c) / 2.0;
  gl_FragColor = vColor * mix(textureColor0, textureColor1, weight);
}
