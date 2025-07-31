precision mediump float;

uniform vec3 pointLightPosition; // 点光源の位置
uniform float maxLightDistance; // 点光源の照射範囲

varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vPos;

void main() {
  // 描画中のポリゴン座標から点光源へのベクトル
  vec3 lightVec = pointLightPosition - vPos;

  // 光源から遠ざかるほど明るさを減衰させる係数を計算
  float lightDist = length(lightVec);
  float lightAtten = max((maxLightDistance - lightDist) / maxLightDistance, 0.0);

  // ピクセルの明るさを計算
  float d = dot(vNormal, normalize(lightVec)) * lightAtten;

  // 頂点カラーと明るさを乗算して出力
  gl_FragColor = vec4(vColor.xyz * d, vColor.a);
}
