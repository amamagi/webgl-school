#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform sampler2D u_floatTexture;
in vec2 vTexCoord;
out vec4 fragColor;

// 可視化モード
uniform int u_visualizationMode; // 0: grayscale, 1: heatmap, 2: raw RGB

// 値の範囲を正規化するためのパラメータ
uniform float u_minValue;
uniform float u_maxValue;

// ヒートマップカラー関数
vec3 heatmap(float value) {
    // 0.0 ~ 1.0 の値を青→緑→黄→赤のグラデーションに変換
    vec3 color;
    value = clamp(value, 0.0, 1.0);
    
    if (value < 0.25) {
        // 青 → シアン
        color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), value * 4.0);
    } else if (value < 0.5) {
        // シアン → 緑
        color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (value - 0.25) * 4.0);
    } else if (value < 0.75) {
        // 緑 → 黄
        color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (value - 0.5) * 4.0);
    } else {
        // 黄 → 赤
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (value - 0.75) * 4.0);
    }
    
    return color;
}

void main() {
    vec2 pos = gl_FragCoord.xy / u_resolution.xy;
    // FLOATテクスチャから値を読み出し
    vec4 floatValue = texture(u_floatTexture, pos);
    
    // 正規化（minValue ~ maxValue を 0.0 ~ 1.0 にマッピング）
    vec4 normalized = (floatValue - u_minValue) / (u_maxValue - u_minValue);
    normalized = clamp(normalized, 0.0, 1.0);

    vec3 color = normalized.rgb;

    fragColor = vec4(color, 1.0);
}