#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;

uniform sampler2D u_bufferTexture;
uniform float u_velocityScale;
uniform float u_pressureScale;

vec2 restoreVelocity(vec2 texValue) {
    return texValue * u_velocityScale * 2.0 - u_velocityScale; // [0, 1] -> [-vs, vs]
}

float compressScalar(float scalerValue) {
    return (scalerValue + u_pressureScale) / (u_pressureScale * 2.0); // [-ps, ps] -> [0, 1]
}

vec2 sampleVelocity(sampler2D texture, ivec2 coord) {
    return restoreVelocity(texelFetch(texture, coord, 0).xy);
}

void main(){
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 resolution = ivec2(u_resolution);
    vec2 texelSize = 1.0 / u_resolution.xy;
    
    // 速度取得
    vec2 left   = sampleVelocity(u_bufferTexture, ivec2(max(coord.x - 1, 0), coord.y));
    vec2 right  = sampleVelocity(u_bufferTexture, ivec2(min(coord.x + 1, resolution.x - 1), coord.y));
    vec2 down   = sampleVelocity(u_bufferTexture, ivec2(coord.x, max(coord.y - 1, 0)));
    vec2 up     = sampleVelocity(u_bufferTexture, ivec2(coord.x, min(coord.y + 1, resolution.y - 1)));

    // 発散を計算: ∇·v = ∂vx/∂x + ∂vy/∂y
    float dvx_dx = (right.x - left.x) / 2.0;  // x方向速度のx方向偏微分
    float dvy_dy = (up.y - down.y) / 2.0;     // y方向速度のy方向偏微分
    
    float divergence = dvx_dx + dvy_dy;
    divergence = compressScalar(divergence);

    // if (divergence > 1.0) {
    //     fragColor = vec4(0.0, 1.0, 0.0, 1.0);
    //     return;
    // }
    // if (divergence < 0.0) {
    //     fragColor = vec4(0.0, 0.0, 1.0, 1.0);
    //     return;
    // }
    
    fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}