#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_pressureTexture;
uniform sampler2D u_velocityTexture;

void main(){
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    
    // 圧力値を取得（境界チェック付き）
    float pressureLeft = texelFetch(u_pressureTexture, ivec2(max(coord.x - 1, 0), coord.y), 0).x;
    float pressureRight = texelFetch(u_pressureTexture, ivec2(min(coord.x + 1, resolution.x - 1), coord.y), 0).x;
    float pressureBottom = texelFetch(u_pressureTexture, ivec2(coord.x, max(coord.y - 1, 0)), 0).x;
    float pressureTop = texelFetch(u_pressureTexture, ivec2(coord.x, min(coord.y + 1, resolution.y - 1)), 0).x;

    // 圧力の勾配を計算（中央差分）
    vec2 gradient = vec2(pressureRight - pressureLeft, pressureTop - pressureBottom) * 0.5;

    // 現在の速度を取得
    vec2 velocity = texelFetch(u_velocityTexture, coord, 0).xy;

    // 圧力勾配を減算して発散を除去
    velocity -= gradient;

    fragColor = vec4(velocity, 0.0, 1.0);
}