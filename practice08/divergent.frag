#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;

void main(){
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    
    // 境界チェック（勾配計算のため隣接ピクセルが必要）
    ivec2 leftCoord = ivec2(max(coord.x - 1, 0), coord.y);
    ivec2 rightCoord = ivec2(min(coord.x + 1, resolution.x - 1), coord.y);
    ivec2 upCoord = ivec2(coord.x, min(coord.y + 1, resolution.y - 1));
    ivec2 downCoord = ivec2(coord.x, max(coord.y - 1, 0));
    
    // 隣接ピクセルのベクトル値を取得
    vec2 left = texelFetch(u_bufferTexture, leftCoord, 0).xy;
    vec2 right = texelFetch(u_bufferTexture, rightCoord, 0).xy;
    vec2 up = texelFetch(u_bufferTexture, upCoord, 0).xy;
    vec2 down = texelFetch(u_bufferTexture, downCoord, 0).xy;
    
    // テクスチャ座標[0,1]から物理座標[-1,1]に変換
    left = left * 2.0 - 1.0;
    right = right * 2.0 - 1.0;
    up = up * 2.0 - 1.0;
    down = down * 2.0 - 1.0;

    // 発散を計算: ∇·v = ∂vx/∂x + ∂vy/∂y
    float dvx_dx = (right.x - left.x) * 0.5;  // x方向速度のx方向偏微分
    float dvy_dy = (up.y - down.y) * 0.5;     // y方向速度のy方向偏微分
    
    float divergence = dvx_dx + dvy_dy;
    
    fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}