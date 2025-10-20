#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform float u_boundaryEffects; // 境界での効果係数 [-1.0, 1.0]
uniform int u_dimension; // 1: x方向のみ, 2: 両方向

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    
    // 境界判定
    int range = 1; // 境界とみなす範囲
    bool isLeftBoundary = coord.x < range;
    bool isRightBoundary = coord.x >= (resolution.x - range);
    bool isBottomBoundary = coord.y < range;
    bool isTopBoundary = coord.y >= (resolution.y - range);

    vec2 value = texelFetch(u_bufferTexture, coord, 0).xy;

    if (u_dimension == 1){
        if ((isLeftBoundary || isRightBoundary || isBottomBoundary || isTopBoundary)) {
            value = value * u_boundaryEffects;
        }
        fragColor = vec4(value, 0.0, 1.0);
        return;
    }

    // 左右境界
    if (isLeftBoundary || isRightBoundary){
        vec2 normal = isLeftBoundary ? vec2(1.0, 0.0) : vec2(-1.0, 0.0);
        if (dot(normal, value) < 0.0) {
            value.x = value.x * u_boundaryEffects;
        }
    }
    
    // 上下境界
    if (isTopBoundary || isBottomBoundary){
        vec2 normal = isBottomBoundary ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
        if (dot(normal, value) < 0.0) {
            value.y = value.y * u_boundaryEffects;
        }
    }
    
    // 内部領域 - そのまま値をコピー
    fragColor = vec4(value, 0.0, 1.0);
}