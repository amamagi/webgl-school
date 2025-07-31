
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;

uniform mat4 mvpMatrix;
uniform mat4 normalMatrix; // 法線変換行列 @@@

varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vPos;

void main() {
  // 法線をまず行列で変換する @@@
  vNormal = normalize(normalMatrix * vec4(normal, 0.0)).xyz;

  // MVP 行列と頂点座標を乗算してから出力する
  gl_Position = mvpMatrix * vec4(position, 1.0);

  // 頂点カラーと座標はそのまま渡す
  vColor = color;
  vPos = position;
}
