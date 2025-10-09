#version 300 es

layout (location=0) in vec3 position;
layout (location=1) in vec3 normal;
layout (location=2) in vec4 color;
layout (location=3) in vec2 texCoord; // テクスチャ座標 @@@

out vec2 vTexCoord; // テクスチャ座標受け渡し用 @@@

uniform mat4 mvpMatrix;

void main() {
  vTexCoord = texCoord;
  gl_Position = mvpMatrix * vec4(position, 1.0);
}
