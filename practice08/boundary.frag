#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform float u_scale;
uniform int u_dimension; // 1: x方向のみ, 2: 両方向

// 値を[-1, 1]から[0, 1]に変換
vec2 normalizeToTexture(vec2 value) {
    return (value + 1.0) * 0.5;
}

// 値を[0, 1]から[-1, 1]に変換
vec2 normalizeFromTexture(vec2 value) {
    return value * 2.0 - 1.0;
}

// 境界条件を適用
vec2 applyBoundaryCondition(ivec2 coord, ivec2 offset, bool scaleX, bool scaleY) {
    vec2 value = texelFetch(u_bufferTexture, coord + offset, 0).xy;
    value = normalizeFromTexture(value);
    
    // スケールを適用（境界での反射を表現）
    if (u_dimension == 1) {
        if (scaleX) value.x *= u_scale;
    } else if (u_dimension == 2) {
        if (scaleX) value.x *= u_scale;
        if (scaleY) value.y *= u_scale;
    }
    
    return normalizeToTexture(value);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    
    // 境界判定
    bool isLeftBoundary = coord.x == 0;
    bool isRightBoundary = coord.x == resolution.x - 1;
    bool isBottomBoundary = coord.y == 0;
    bool isTopBoundary = coord.y == resolution.y - 1;
    
    // 左境界
    if (isLeftBoundary) {
        vec2 result = applyBoundaryCondition(coord, ivec2(1, 0), true, false);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 右境界
    if (isRightBoundary) {
        vec2 result = applyBoundaryCondition(coord, ivec2(-1, 0), true, false);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 下境界
    if (isBottomBoundary) {
        vec2 result = applyBoundaryCondition(coord, ivec2(0, 1), false, true);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 上境界
    if (isTopBoundary) {
        vec2 result = applyBoundaryCondition(coord, ivec2(0, -1), false, true);
        fragColor = vec4(result, 0.0, 1.0);
        return;
    }
    
    // 内部領域 - そのまま値をコピー
    fragColor = texelFetch(u_bufferTexture, coord, 0);
}