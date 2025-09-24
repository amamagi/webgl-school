#version 300 es
in vec3 position;
in vec3 normal;
in vec4 color;
in vec2 texCoord; // テクスチャ座標 @@@
out vec2 vTexCoord; // テクスチャ座標受け渡し用 @@@
uniform mat4 mvpMatrix;

void main() {
  vTexCoord = texCoord;
  gl_Position = mvpMatrix * vec4(position, 1.0);
}
