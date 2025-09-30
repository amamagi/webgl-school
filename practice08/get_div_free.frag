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
    
    // 境界チェック（勾配計算のため隣接ピクセルが必要）
    ivec2 leftCoord = ivec2(max(coord.x - 1, 0), coord.y);
    ivec2 rightCoord = ivec2(min(coord.x + 1, resolution.x - 1), coord.y);
    ivec2 bottomCoord = ivec2(coord.x, max(coord.y - 1, 0));
    ivec2 topCoord = ivec2(coord.x, min(coord.y + 1, resolution.y - 1));
    
    // 圧力値を取得
    float pressureLeft = texelFetch(u_pressureTexture, leftCoord, 0).x;
    float pressureRight = texelFetch(u_pressureTexture, rightCoord, 0).x;
    float pressureBottom = texelFetch(u_pressureTexture, bottomCoord, 0).x;
    float pressureTop = texelFetch(u_pressureTexture, topCoord, 0).x;
    
    // 圧力の勾配を計算（中央差分）
    float divX = (pressureLeft - pressureRight) * 0.5;
    float divY = (pressureBottom - pressureTop) * 0.5;
    
    // 現在の速度を取得
    vec2 velocity = texelFetch(u_velocityTexture, coord, 0).xy;
    velocity = velocity * 2.0 - 1.0; // [0, 1] -> [-1, 1]
    
    // 圧力勾配を減算して発散を除去
    velocity -= vec2(divX, divY);
    
    // 速度をテクスチャ範囲に戻す
    velocity = (velocity + 1.0) * 0.5; // [-1, 1] -> [0, 1]
    
    fragColor = vec4(velocity, 0.0, 1.0);
}