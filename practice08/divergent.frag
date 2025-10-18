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
    vec2 texelSize = 1.0 / u_resolution.xy;
    
    // 速度取得
    vec2 left   = texelFetch(u_bufferTexture, ivec2(max(coord.x - 1, 0), coord.y), 0).xy;
    vec2 right  = texelFetch(u_bufferTexture, ivec2(min(coord.x + 1, resolution.x - 1), coord.y), 0).xy;
    vec2 down   = texelFetch(u_bufferTexture, ivec2(coord.x, max(coord.y - 1, 0)), 0).xy;
    vec2 up     = texelFetch(u_bufferTexture, ivec2(coord.x, min(coord.y + 1, resolution.y - 1)), 0).xy;

    // 発散を計算: ∇·v = ∂vx/∂x + ∂vy/∂y
    float dvx_dx = (right.x - left.x) / 2.0;  // x方向速度のx方向偏微分
    float dvy_dy = (up.y - down.y) / 2.0;     // y方向速度のy方向偏微分
    
    float divergence = dvx_dx + dvy_dy;
    // Direct output
    
    fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}