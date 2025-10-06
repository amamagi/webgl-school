#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform float u_bufferScale; // テクスチャ値のスケール
uniform float u_bufferOffset; // テクスチャ値のオフセット
uniform float u_boundaryEffects; // 境界での効果係数 [-1.0, 1.0]
uniform int u_dimension; // 1: x方向のみ, 2: 両方向

vec2 restoreValue(vec2 texValue) {
    return texValue * u_bufferScale * 2.0 - u_bufferOffset; // [0, 1] -> [-vs, vs]
}

vec2 compressValue(vec2 value) {
    return (value + u_bufferOffset) / (u_bufferScale * 2.0); // [-vs, vs] -> [0, 1]
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    
    // 境界判定
    int range = 4; // 境界とみなす範囲
    bool isLeftBoundary = coord.x < range;
    bool isRightBoundary = coord.x >= (resolution.x - range);
    bool isBottomBoundary = coord.y < range;
    bool isTopBoundary = coord.y >= (resolution.y - range);

    if (u_dimension == 1){
        if (!(isLeftBoundary || isRightBoundary || isBottomBoundary || isTopBoundary)) {
            fragColor = texelFetch(u_bufferTexture, coord, 0);
            return;
        }
        vec2 value = restoreValue(texelFetch(u_bufferTexture, coord, 0).xy);
        value = value * u_boundaryEffects;
        vec2 result = compressValue(value);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }

    // 左右境界
    if (isLeftBoundary || isRightBoundary){
        vec2 normal = isLeftBoundary ? vec2(1.0, 0.0) : vec2(-1.0, 0.0);
        vec2 value = restoreValue(texelFetch(u_bufferTexture, coord, 0).xy);
        if (dot(normal, value) < 0.0) {
            value.x = value.x * u_boundaryEffects;
        }
        vec2 result = compressValue(value);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 上下境界
    if (isTopBoundary || isBottomBoundary){
        vec2 normal = isBottomBoundary ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
        vec2 value = restoreValue(texelFetch(u_bufferTexture, coord, 0).xy);
        if (dot(normal, value) < 0.0) {
            value.y = value.y * u_boundaryEffects;
        }
        vec2 result = compressValue(value);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 内部領域 - そのまま値をコピー
    fragColor = texelFetch(u_bufferTexture, coord, 0);
}